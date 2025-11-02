# Thesara – Operational Report and Problem Notebook (reportProblems)

Date: 2025-11-02
Repository: Thesara_Rollback

This document captures our current production and local setup, architecture, configs, routes, goals (rooms + server-backed storage), the issues encountered, fixes applied, and a checklist to reproduce and debug from scratch. Use this as the single source of truth for tomorrow’s investigation.

## Project goals

- Replace browser-only localStorage with a server-backed storage layer so apps work across devices and sessions.
- Add “rooms” for shared, real-time collaboration between multiple clients.
- Ensure published apps run in production under thesara.space with:
  - storage shim injected and accessible via /api/shims/localstorage.js
  - cross-origin iframe sandbox support (allow-same-origin + allow-scripts)
  - stable SSR asset URLs (no 127.0.0.1 in rendered HTML)
  - static review previews for builds at /review/builds/:id/

## Top-level architecture

- Monorepo with two runtime services:
  - API (Fastify/Node 20) at 0.0.0.0:8788 (with port fallback)
  - Web (Next.js 15 / React 18/19) at 0.0.0.0:3000
- Reverse proxy: nginx in front of thesara-web and thesara-api (see deploy/nginx).
- PM2 manages both processes on the VPS.
- Storage: filesystem-backed for builds and uploaded assets under storage/ and BUNDLE_STORAGE_PATH.
- Workers: BullMQ worker for “createx build” (CREATEX_WORKER_ENABLED).

## Repository structure (selected)

- apps/
  - api/ (Fastify server)
    - src/index.ts (main server)
    - src/routes/* (routes: build, review, shims, storage, rooms, …)
    - tsup.config.cjs, tsconfig.json
    - package.json (build scripts)
  - web/ (Next.js)
    - next.config.{js,mjs}
    - app/pages/components/lib
- ecosystem.config.cjs (PM2 config)
- deploy/ (nginx, pm2)
- storage/ (uploads, builds, …)

## Server environment (VPS)

- OS: Ubuntu (nginx/1.24.0 present)
- Node: v20.x
- PM2: runs thesara-api and thesara-web
- Paths:
  - Repo root: /srv/thesara/app
  - API cwd: /srv/thesara/app/apps/api
  - Web cwd: /srv/thesara/app/apps/web

### PM2 config (ecosystem.config.cjs)

- thesara-api
  - script: node --openssl-legacy-provider -r dotenv/config dist/server.cjs
  - cwd: apps/api
  - env:
    - NODE_ENV=production
    - PORT=8788
    - DOTENV_CONFIG_PATH=/srv/thesara/app/apps/api/.env
    - CREATEX_WORKER_ENABLED=true
    - ALLOW_REVIEW_PREVIEW=true (enables static previews at /review/builds/:id/)
- thesara-web
  - script: pnpm start
  - cwd: apps/web
  - env:
    - NODE_ENV=production
    - PORT=3000
    - INTERNAL_API_URL=http://127.0.0.1:8788/api (Next.js rewrites proxy to API)

## API service details (apps/api)

- Framework: Fastify 5
- CORS: origin reflection + support for literal "null" origin (sandboxed iframes)
- Helmet: CSP disabled centrally; CSP set per static build with buildCsp
- Auth: JWT plugin + auth middleware
- Rate limit + Swagger + Metrics
- Static public: mounted at '/'
- Uploads: fastify-static at /uploads/ serving from LOCAL_STORAGE_DIR
- Build artifacts:
  - Explicit routes for /builds/:buildId/build (index + assets with proper MIME and CORP)
  - Legacy redirect from /builds/:buildId/bundle → /builds/:buildId/build
- Review previews:
  - When ALLOW_REVIEW_PREVIEW=true, fastify-static mounts at /review/builds/
  - allowedPath() blocks API subpaths (llm, policy, delete, force-delete, restore, rebuild) and the exact bare path /review/builds/:id to preserve JSON admin endpoint
  - Default redirect on (so /review/builds/:id → /review/builds/:id/)
- Health endpoints: /health and /healthz
- On-request hook strips '/api' prefix, so nginx or Next proxy can prefix API calls with /api
- On-send hook sets CORP and X-Storage-Backend headers for static assets
- Storage shim and rooms routes under /shims and /rooms
- Port bind with fallback:
  - Prefers PORT (8788), tries consecutive ports up to PORT_FALLBACK_ATTEMPTS (default 10)
  - Writes the chosen port to apps/api/.diag/api-port.txt

### API build/start

- Build tool: tsup (target node20)
- Build script (fixed):
  - tsup
  - copy non-TS assets to dist
  - copy dist/index.js → dist/server.cjs (no rename; both files exist)
- PM2 runs dist/server.cjs

## Web service details (apps/web)

- Next.js 15, React 18/19
- Rewrites:
  - Split API_BASE vs API_URL (API_URL includes /api for the proxy)
  - /shims/:path* rewrite to API_BASE (so published apps request /api/shims/localstorage.js)
  - Default internal API port set to 8788
- SSR asset URLs:
  - In apps/web/lib/preview.ts, static asset URL builder uses the public site origin for SSR paths (uploads/builds/review/builds/public/builds/play) to avoid 127.0.0.1 mixed-content issues
- PlayPageClient.tsx:
  - iframe sandbox flags include allow-same-origin
- Publisher (apps/api/src/routes/publish.ts):
  - Injects /api/shims/localstorage.js into published builds

## Critical routes and behavior

- /api prefix:
  - Requests arriving as /api/* get stripped to /* in the API server
- Storage shim:
  - /api/shims/localstorage.js → served with JS MIME and CORS
- Rooms:
  - /rooms/*
- Build assets:
  - /builds/:buildId/build → index.html (text/html, CORP: cross-origin)
  - /builds/:buildId/build/* → proper content-type based on extension
- Review:
  - /review/builds/:id/ → static preview (index.html) when ALLOW_REVIEW_PREVIEW=true
  - /review/builds/:id → JSON admin route (401 if unauthenticated)
- Health:
  - /health, /healthz → 200 OK

## Known issues we hit and resolutions

1) Storage shim MIME mismatch and path confusion
   - Symptom: /shims/localstorage.js served with wrong MIME; clients requested /api/shims vs /shims
   - Fix: Serve under /shims with correct MIME; web rewrites proxy /shims/* to API_BASE; publish injects /api/shims/localstorage.js

2) Wrong API port (8789 vs 8788)
   - Symptom: web/internal proxy pointed at 8789; API on 8788
   - Fix: Next config default to 8788; ecosystem sets PORT=8788

3) Sandbox blocked localStorage
   - Symptom: iframe sandbox restrictions
   - Fix: Add allow-same-origin to iframe sandbox flags in PlayPageClient

4) Review previews: trailing slash 404 vs bare path 401
   - Symptom: /review/builds/:id/ returned 404; /review/builds/:id returned 401 (JSON route)
   - Fix: Mount fastify-static at /review/builds/ with redirect and allowedPath; enable via ALLOW_REVIEW_PREVIEW=true in PM2 env

5) SSR assets mixed content (127.0.0.1)
   - Symptom: SSR HTML referenced 127.0.0.1 for images/assets
   - Fix: apps/web/lib/preview.ts now uses public site origin for known static paths in SSR

6) API build failure: Unexpected end of file
   - Symptom: Corrupted tail of apps/api/src/index.ts (dangling export and stray fragments)
   - Fix: Repaired start() loop, removed stray export, cleaned bootstrap, restored closing braces

7) PM2 MODULE_NOT_FOUND for dist/server.cjs
   - Symptom: PM2 attempted to run dist/server.cjs that didn’t exist after build in some sequences
   - Fix: Build now copies index.js to server.cjs instead of renaming (so both exist) and restarts use --update-env when env changes

8) Health unreachable after restart
   - Symptom: curl to 127.0.0.1:8788 failed; logs showed MODULE_NOT_FOUND loop
   - Fix: After build-script change, rebuild API and restart PM2 (ensure dist/server.cjs exists)

## Outstanding/Watch items

- Confirm thesara-api stable startup and binding on 8788 (or diagnose fallback):
  - pm2 logs thesara-api | grep "listening on"
  - cat apps/api/.diag/api-port.txt
- Confirm /review/builds/:id/ returns 200 with correct CSP and MIME after ALLOW_REVIEW_PREVIEW=true
- Rebuild thesara-web and verify:
  - /api/shims/localstorage.js → 200
  - No sandbox/localStorage console errors
  - No mixed-content; assets from https://thesara.space
- Consider cleaning duplicate devDependencies keys in apps/api/package.json (@types/react*, warnings only)

## ChatGPT forensic summary & potential risks

**What works (confirmed by code audit):**
- Review preview hosting: fastify-static at /review/builds/ with redirect + allowedPath correctly guards admin JSON on bare path while serving static index on trailing slash.
- Port fallback: API writes chosen port to .diag/api-port.txt for post-restart verification.
- Server storage: Dual /storage and /api/storage endpoints share the same backend with CORS + ETag headers.
- Local KV backend: Uses .lock files + generation counter in .meta for pessimistic locking (prevents clobbered writes without GCS).
- Front-end shim: Always sends X-Thesara-App-Id, shared scope, retries on 412 for optimistic concurrency.
- Play iframe: Requests builds directly with sandbox permissive enough for localStorage bridge.
- SSR assets: preview.ts prefers public origin for static paths, avoiding 127.0.0.1 leakage.
- PM2/nginx: Config aligns with ALLOW_REVIEW_PREVIEW=true, INTERNAL_API_URL proxy, and nginx bypass for builds/uploads.

**Potential failure points identified:**
1. **Port watchdog fragility**: If .diag/ directory missing or wrong permissions on VPS, port fallback trail disappears and confuses diagnostics.
2. **Storage CORS static allowlist**: Missing staging hosts; new review domains silently fall back to thesara.space and break credentialed PATCH.
3. **Rooms rate-limiting in-memory only**: Crashes/restarts flush token bucket; bursts can pass until Firestore writes catch up (Firebase Admin + Firestore quotas).
4. **Publish pipeline eventual consistency**: Mixes KV + Firestore writes with best-effort retry; review UI and storage can diverge if Firestore sync fails repeatedly.

**Recommended hardening (from ChatGPT):**
- Operational visibility: PM2 post-restart scripts verify .diag creation; extend runbook with failure modes (missing file, permission denial) and automated pm2 logs grep for early warning.
- Storage/rooms resilience: Parameterize CORS origins via env; add integration tests for staging PATCH; persist rooms rate-limit counters in Redis (reuse REDIS_URL) so throttling survives restarts and reduces mixed-content/sandbox error spikes.
- Next step: Run prod checklist from this doc, capture deviations, keep notebook authoritative.

## From-scratch verification checklist (prod VPS)

1) Pull code, build API, ensure server.cjs exists
```bash
cd /srv/thesara/app
git fetch origin main && git reset --hard origin/main
pnpm -F @thesara/api build
ls -l apps/api/dist/server.cjs
```

2) Restart API with updated env
```bash
pm2 restart thesara-api --update-env
pm2 logs thesara-api --lines 100
```

3) Confirm port and health
```bash
cat apps/api/.diag/api-port.txt
curl -sS -I http://127.0.0.1:8788/health || curl -sS -I http://127.0.0.1:$(cat apps/api/.diag/api-port.txt)/health
```

4) Review preview routing (replace REAL_BUILD_ID)
```bash
curl -I http://127.0.0.1:8788/review/builds/REAL_BUILD_ID/
curl -i  http://127.0.0.1:8788/review/builds/REAL_BUILD_ID
```

5) Rebuild and restart web
```bash
pnpm -F @thesara/web build
pm2 restart thesara-web
```

6) Browser validation (Chrome)
- Load a play/review page
- Network: /api/shims/localstorage.js 200
- Console: no sandbox/localStorage errors
- HTML/Network: assets from https://thesara.space (no 127.0.0.1)

## Local development notes (Windows)

- Default shell: PowerShell
- Run web and API locally via pnpm workspaces
- API will bind to 8788 by default; health at http://127.0.0.1:8788/health
- Next.js app at http://127.0.0.1:3000; rewrites /api → API
- For local SSR, ensure PUBLIC_BASE/WEB_BASE configured appropriately to avoid mixed content

## Useful files to inspect

- apps/api/src/index.ts (server setup, routes, review preview mount)
- apps/api/src/routes/shims.ts (storage/rooms shims)
- apps/api/src/routes/publish.ts (injects storage shim)
- apps/web/next.config.mjs and next.config.js (rewrites, ports)
- apps/web/lib/preview.ts (SSR static URL builder)
- ecosystem.config.cjs (PM2 settings and env)
- apps/api/package.json (build scripts)

## Appendices – Common commands

- PM2
```bash
pm2 status
pm2 logs thesara-api --lines 200
pm2 restart thesara-api --update-env
pm2 restart thesara-web
```

- Health / Port
```bash
cat apps/api/.diag/api-port.txt
curl -I http://127.0.0.1:8788/health
```

- Review routes (HEAD/GET)
```bash
curl -I http://127.0.0.1:8788/review/builds/REAL_BUILD_ID/
curl -i  http://127.0.0.1:8788/review/builds/REAL_BUILD_ID
```

- Build API
```bash
pnpm -F @thesara/api build
```

- Build Web
```bash
pnpm -F @thesara/web build
```

---
If anything in this report diverges from what you see on the VPS, annotate and adjust here so we keep this as the authoritative operational notebook.
