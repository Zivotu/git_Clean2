# BundleSetupInstructions

## Overview
This document captures exactly what we configured to make "upload ? build ? approve ? play" work for AI-generated ZIP bundles. Follow these steps from scratch whenever you recreate the environment.

## 1. Workspace Requirements
1. **Node 20+** (base dev environment).
2. **pnpm workspace install**: run `corepack enable` and `pnpm install` from repo root so `workspace:*` references resolve.
3. **Redis**: run `docker compose -f docker-compose.dev.yml up redis` or provide `REDIS_URL`.
4. **Environment files**: `apps/api/.env.local`, `apps/web/.env.local`, service account JSON under `keys/` (referenced by `GOOGLE_APPLICATION_CREDENTIALS`).
5. **Defender/AV exclusions**: add `C:\thesara_RollBack\storage\bundles` so worker can delete node_modules without `EPERM`.

## 2. Running Dev Stack
- `pnpm --filter api dev` (or `npm run dev` inside `apps/api`) with `CREATEX_WORKER_ENABLED=true`. This spins Fastify API + bundle worker.
- `pnpm --filter web dev` for Next.js frontend.
- Ensure both processes have network access and see the same storage paths (`storage/kv`, `storage/bundles`).

## 3. Upload Flow (POST /api/publish/bundle)
Key additions in `apps/api/src/workers/bundleBuildWorker.ts`:
1. **Per-job npm cache + `.npmrc`** forcing `registry.npmjs.org` with `npm ci` for deterministic installs. Cache lives inside the extracted workspace and is wiped after each job.
2. **Lock detection**:
   - Accepts `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` and runs the matching tool (`npm ci`, `pnpm install --frozen-lockfile`, etc.).
   - If ZIP lacks a lock, worker:
     * Restores last lock cached under `storage/bundles/listing-locks/<listingId>/...`.
     * If cache empty, synthesizes `package-lock.json` using `npm install --package-lock-only` (with `save-exact=true` and isolated `.npmrc`).
   - After a successful build, the lock is saved back into the per-listing cache for future uploads.
3. **Temporary files**: workspace, `.npm-cache`, `.npmrc`, uploaded ZIP – all removed in `finally {}` so disk usage stays bounded.

## 4. Build Output Sanitization (publish phase)
Modifications in `apps/api/src/models/Build.ts` to prepare `dist/` for serving:
1. **sanitizeBundleIndex** now:
   - Strips disallowed ad scripts (Google ads, DoubleClick, adsbygoogle).
   - Injects `<base href="/builds/<buildId>/bundle/">` and our storage shim script.
   - Rewrites absolute `src="/foo"` / `href="/bar"` to relative `./foo` to ensure assets resolve inside the bundle.
2. **Entrypoint detection**:
   - `detectEntrypointScript` scans `<script type="module" src="...">` tags, giving priority to modules containing `index/main/app`, then falls back to first `.js` in `assets/`.
   - `ensureAppEntrypoint` copies the detected file into both `build/app.js` and `bundle/app.js` if not provided. Approve no longer fails on "Missing required file(s): app.js".
3. **Lock-step copying**: `build/` and `bundle/` directories are aligned (copy + sanitize) before publication. Manifest fallback creates `manifest_v1.json` if missing, ensuring `/play/<buildId>` works.
4. **CSP/Play compatibility**: Because `<base>` + rewritten `src/href` ensure every asset request hits `/builds/<buildId>/bundle/...`, the API returns correct MIME types and Play iframe renders the app without manual edits.

## 5. Approval Flow
- Approve route (`/api/review/approve/:buildId`) calls `publishBundle`. With the above fixes, it succeeds even when the uploaded ZIP uses module scripts or lacks an explicit app.js.
- Reminder: If runs fail earlier and you delete build rows from the DB, Prisma may log `P2025`; rerun publish to regenerate the build before approving.

## 6. Playing the Bundle
- Always use `/play/<buildId>` (or `/builds/<buildId>/bundle/`) so `<base>` rewriting takes effect. Opening `http://127.0.0.1:8789/index.html` directly will attempt to load assets from `/assets/...` at the root and fail.
- Third-party ad scripts remain blocked by CSP – expected behavior. The rest of the app uses local assets rewritten above and now renders as expected.

## 7. Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| `npm warn tarball ... EINTEGRITY` in worker | Antivirus/HTTPS inspection corrupts tarballs | Disable web scanning or run worker where downloads are untouched. Use `Invoke-WebRequest + Get-FileHash` to confirm checksum matches `npm view pkg@version dist.integrity`. |
| `Missing required file(s): app.js` during approve | ZIP lacks entry-point script and worker couldn’t synthesize it | Ensure latest code (with module-script detection) is deployed; `sanitizeBundleIndex` + `ensureAppEntrypoint` now cover this. |
| Assets 404 or MIME mismatch (`index.css` served as JSON) | Opening bundle from root instead of `/play/<id>` | Always hit `/play/<buildId>`; the injected `<base href>` rewrites relative URLs. |
| Prisma `P2025` during approve | Build record removed/reset while approve still running | Re-run publish or keep DB/listings in sync with storage. |
| AdSense scripts blocked (`pagead2.googlesyndication`) | CSP previously disallowed Google ad origins | CSP builder now whitelists `pagead2.googlesyndication.com`, `tpc.googlesyndication.com`, and `googleads.g.doubleclick.net`. No manual action needed unless Google introduces new ad domains. |

## 8. Summary Checklist
1. `pnpm install` + `docker compose -f docker-compose.dev.yml up redis`.
2. Set `CREATEX_WORKER_ENABLED=true`, start API + web with pnpm.
3. Ensure Defender excludes `storage\bundles`.
4. Upload ZIP via `/api/publish/bundle` or web UI ? worker does lock management & build.
5. Approve via admin UI; publish bundles sanitized HTML and entrypoint.
6. Test via `/play/<buildId>`.

This process is now fully automated—no manual edits to ZIP contents are required. Follow the troubleshooting table if you hit hashes, missing files, or MIME issues.
