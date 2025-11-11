# Thesara Storage & Rooms Migration Plan

This document gathers the current pain points, reaffirms the core goals, and lays out
a phased plan for evolving the storage/rooms stack. Treat it as the working "bible"
for the initiative; as we complete each phase locally we mirror the same steps on the
VPS (per deployment notes in `reportProblems.md`).

---

## 1. Current Issues (from investigations to date)

### 1.1 Storage
- Legacy mini-apps and LLM-generated code still use `window.localStorage`, so state
  lives per browser and never syncs for other users.
- Storage shim (`apps/api/src/shims/storageClient.ts`) does not attach JWT tokens or
  the required `X-Thesara-App-Id` header, so calls fail when routed through the API.
- Some Play iframe loads succeed only because `PlayPageClient.tsx` uses the new
  `/api/storage` helper; standalone bundles do not share that implementation.
- **2025-11 update:** `/api/storage` now defaults to `shared` scope for namespaces
  starting with `app:`/`global:` when a client forgets the `X-Thesara-Scope` header,
  so non-room apps automatically share leaderboard/state data across all users.

### 1.2 Rooms
- The old Firestore-based `/rooms/*` API is disabled unless `ROOMS_ENABLED=true` and
  it requires a valid Firebase ID token. Locally we often fall back to dev tokens,
  while production rejects the requests (`token_expired`).
- Rooms V1 (`/rooms/v1`) already exists with Prisma + Argon2 PIN hashing, but the
  issued JWT token lacks `issuer/audience` claims, so `GET /rooms/v1/:code` fails.
- Client apps still call the legacy shim (`/shims/rooms.js`) and never touch Rooms V1.

### 1.3 Environment / Deployment Gaps
- Nginx rewrites cover `/rooms/:path*` but not `/rooms/v1/:path*` (needs verification
  and addition if missing).
- `.env` files do not set `ROOMS_ENABLED`, `ROOMS_V1__JWT_SECRET`, or related fields,
  so the new service has inconsistent behaviour between local dev and VPS.

---

## 1a. How the System Works Today (and why it fails)

The original “rooms” experience was built as a thin client-side layer:
- Apps relied on `window.localStorage` to persist a room’s shopping list. That storage
  is inherently **per browser and per device**; there is no sharing by default.
- Legacy shims (`/shims/rooms.js`, `/shims/storage.js`) exposed helpers that expected
  the local browser to synchronise state, with the API only acting as a proxy in exceptional
  cases. When storage moved to `/api/storage`, these shims were not updated to supply
  JWTs or `X-Thesara-App-Id`, so they now fail silently.
- The new `PlayPageClient.tsx` works because it bypasses those shims and talks directly
  to `/api/storage`. Standalone bundles or LLM-generated apps still hit the outdated
  `localStorage` flow, causing mismatched behaviour between dev and production.

For rooms:
- The legacy Firestore-based `/rooms` API requires a **valid Firebase ID token** and
  `ROOMS_ENABLED=true`. Locally we often run with dev mocks, so the call “works”; on
  the VPS the request fails with `token_expired` because the token is missing or stale.
- Rooms V1 already addresses those problems (JWT session token, Prisma DB), but the
  emitted token is missing issuer/audience fields. Consequently the very next request
  (`GET /rooms/v1/:code`) is rejected with `invalid_token`. The fix is small but has
  never been applied, leaving V1 half-finished and legacy rooms disabled.

This combination explains the current symptoms: locally we may see success due to
dev-only shortcuts, while production traffic hits the stricter configuration and fails.

---

## 2. Core Goals (the North Star)

1. **Server-backed storage everywhere** – all published apps and shims write through
   `/api/storage`, enabling cross-device sync and optimistic concurrency with `If-Match`.
2. **Rooms V1 as the single source of truth** – PIN-protected rooms with Prisma-backed
   state, JWT session tokens, and shareable histories replace the legacy Firestore flow.
3. **Parity between local and VPS** – identical `.env` flags, Nginx rewrites, and PM2
   configs so behaviour does not diverge between environments.
4. **LLM-friendly SDK surface** – provide storage/rooms helpers (or enforced shims)
   that nudge generated apps away from `localStorage` to the supported APIs.

---

## 3. Execution Plan (phased)

Each phase should be implemented locally (repo root `C:\thesara_RollBack`) and then
applied verbatim on the VPS (`/srv/thesara/app`). Mark phases as complete in version
control so we can track rollout.

### Phase 0 — Baseline & Configuration ✅ *Completed*
1. Added the Rooms V1 env block ( `ROOMS_ENABLED`, `ROOMS_V1__JWT_*` ) in all local env files and documented the production template (`apps/api/.env`, `.env.local`, `.env.production`).
2. Updated Next.js rewrites to proxy `/rooms/v1/:path*` alongside legacy `/rooms/:path*` (`apps/web/next.config.mjs`).
3. Expanded nginx example config with a `/rooms/` proxy stanza (`deploy/nginx/thesara.space.example`).
4. Ready for VPS replication after local verification.

### Phase 1 — Rooms V1 Stabilisation ✅ *Completed*
1. `signRoomToken` now signs with issuer and audience from config (`apps/api/src/plugins/jwt.ts`).
2. Manual curl tests planned for create/join/get; automation still pending.
3. Firestore legacy routes left disabled; documentation update still outstanding.
4. VPS deployment pending final local smoke tests (see Section 4).

### Phase 2 — Storage Shim Alignment ✅ *Completed*
1. Replaced shim with server-backed implementation (handles Authorization, namespace, If-Match, and randomUUID fallback) (`apps/api/src/shims/storageClient.ts`).
2. Storage helpers already live in `snapshot-loader.ts`; external docs still to be written.
3. Publish pipeline shim injection review outstanding.
4. Sample Play tests pending (to perform before VPS rollout).

### Phase 3 — Client Application Migration ✅ *In progress / partially done*
1. Example app (`temp_extract/App.tsx`) now uses Rooms V1 + storage helper with token propagation.
2. Need to prepare public migration guide and refresh LLM templates/prompts to discourage direct `localStorage`.
3. Audit other sample code for compliance.
4. **NEW (2025-02)** Play host dobio je “Rooms toolbar”:
   - Upload wizard ima `capabilities.storage.roomsMode` (`off` | `optional` | `required`).
   - `/rooms/storage/demo|create|join` vraćaju `namespace` i `roomToken`; storage namespace = `app:<appId>:room:<slug>`.
   - `storage.ts` traži `X-Thesara-Room-Token` za svaki `app:*:room:*` namespace, shim ga automatski dodaje.
   - Demo soba (PIN 1111) uvijek se otvara prva kako bi iframe odmah radio, korisnik zatim preko toolbara kreira ili join-a vlastitu sobu.

### Phase 4 — Observability & Hardening ⏳ *Not started*
1. Add dashboards/alerts for `/rooms/v1` and `/api/storage`.
2. Review rate limits/idempotency (ensure config matches production needs).
3. Plan end-to-end scenarios (multi-user join, concurrent writes).
4. Remove legacy assets as adoption completes.

---

## 4. Deployment Reminder Checklist
- Apply `.env` updates locally → commit → propagate to VPS (`/srv/thesara/app/apps/api/.env`).
- Regenerate `dist/server.cjs` with `pnpm --filter @thesara/api build`.
- Restart PM2 processes (`pm2 restart thesara-api && pm2 restart thesara-web`).
- Validate via curl or Postman before exposing new functionality to users.
- Update documentation (internal + public) after finishing each phase.
- **New:** Ensure Play iframe smoke test passes (create/join room, add item, storage sync across tabs).

---

## 5. Next Steps
With this plan in place:
1. Local smoke tests (Rooms V1 + storage shim) before VPS deployment.
2. Document migration guidance for app creators and update publish pipeline to guarantee new shim injection.
3. Plan observability work (Phase 4) and create tasks for remaining documentation.

Once production deploy succeeds, retire legacy storage/rooms docs and mark phases accordingly.
