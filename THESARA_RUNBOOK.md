# Thesara — Platform Runbook (2025-10-31)

Ovaj dokument je referentna točka za trenutnu konfiguraciju sustava, tokove objave i reprodukcije mini‑aplikacija, storage arhitekturu te rješenja koja smo implementirali tijekom stabilizacije. Zamjenjuje stariji izvještaj `Izvjestaj_Analiza_Problema.md`.


## 1) Kratak pregled arhitekture

- Mono‑repo (pnpm workspaces):
  - `apps/api` — Fastify API, bundlanje i posluživanje build artefakata, storage API, SSE za build status.
  - `apps/web` — Next.js (SSR) web klijent (Play stranice, Admin, itd.).
  - `storage/` — lokalni storage (listings.json, uploads, itd.).
- Objavljene mini‑aplikacije se bundlaju per‑app (esbuild, IIFE) i poslužuju ispod:
  - lokalno: `/builds/:buildId/build/*`
  - bucket (Firebase/GCS/R2): `/public/builds/*` (API proxy na bucket)
- Play sandbox (iframe) koristi shims:
  - Tailwind v3 CDN u index predlošku
  - `crypto.randomUUID` polyfill (nesigurna okolina)
  - Minimalni debug overlay (error/probe)
  - `localStorage`/`sessionStorage` bridge preko `postMessage` → parent → `/api/storage`
- Storage API (ETag, rate limit, backend pluggable — local/R2/Firebase GCS) s batch PATCH operacijama.


## 2) Lokalni razvoj i pokretanje

Preduvjet: Docker (za Redis), Node 20+, pnpm.

- Pokretanje cijelog dev okruženja (API + worker + web):
  - `pnpm dev` (root) — podiže Redis (docker compose) i pokreće:
    - `apps/api` (port: 8789 po defaultu, zapis i u `.diag/api-port.txt`)
    - lokalni dev worker (za queue)
    - `apps/web` (Next.js, port 3000) s `NEXT_PUBLIC_API_URL=http://127.0.0.1:8789/api`

- Samo Redis:
  - `pnpm run dev:redis` / `pnpm run dev:redis:down`

- Direkt u paketima:
  - `apps/api`: `pnpm -C apps/api dev` (postavlja `CREATEX_WORKER_ENABLED=true`) + opcionalno `pnpm -C apps/api dev:worker`
  - `apps/web`: `pnpm -C apps/web run dev:local`

Napomene:
- `tools/dev.mjs` injecta varijable: `DATABASE_URL=file:.devdata/sqlite.db` i `GOOGLE_APPLICATION_CREDENTIALS=keys/createx-e0ccc-3510ddb20df0.json`.
- API bira port počevši od `PORT` (default 8789); ako je zauzet, pokušava +1 do 10 puta.


## 3) Konfiguracija okoline (apps/api/src/config.ts)

Ključni ENV‑ovi (defaulti su razumna dev vrijednost):
- PORT: default 8789
- PUBLIC_BASE: vanjski base URL API‑ja (default `http://127.0.0.1:8789`)
- WEB_BASE: `http://localhost:3000`
- BUNDLE_STORAGE_PATH / PREVIEW_STORAGE_PATH: gdje se spremaju buildovi
- STORAGE_DRIVER: `local` | `r2` | `firebase` (auto određivanje preko kredencijala ako nije postavljeno)
- ALLOWED_ORIGINS: CORS lista (CSV) — npr. `http://localhost:3000,https://thesara.space`
- JWT_SECRET: potreban u production, u devu se generira fallback
- REDIS_URL ili REDIS_HOST/REDIS_PORT: za build queue
- FIREBASE_*: za GCS/Firebase bucket (projectId, clientEmail, privateKey, storageBucket)
- CREATEX_WORKER_ENABLED: `true` da se pokrene build worker

CORS: API dinamički dopušta exact i wildcard origene iz ALLOWED_ORIGINS; "null" origin (sandboxed iframe) je dozvoljen.


## 4) Objavljivanje mini‑aplikacije (Publish flow)

Endpoint: `POST /api/publish`

Payload (sažeto):
- `inlineCode: string` — izvorni kod React komponente (TS/TSX je OK; esbuild obrada u workeru)
- `title`, `description`, `author.uid`, `translations`, `visibility`, `preview.dataUrl` (opcionalno)

Što se događa:
1) Kreira se zapis u bazi za Build i Listing (FK safety) i inicijalna struktura build direktorija.
2) Generira se `build/index.html` s:
   - Tailwind v3 CDN
   - randomUUID polyfill, debug overlay
   - `<script src="/shims/localstorage.js"></script>` (storage bridge)
   - `<div id="root"></div>` i učitavanje `app.js`
3) Iz korisničkog koda generira se `_app_entry.tsx` koji će:
   - po potrebi injektirati lagane shadcn/ui stubove (Card, Button, …)
   - ispraviti Recharts ResponsiveContainer i PieChart dimenzije za iframe
   - renderati default export komponentu u `#root`
4) `ensureDependencies(buildId)` skenira importove i upisuje minimalni `package.json` (allow‑list verzije)
5) Build posao se stavlja u red (BullMQ) i worker ga preuzima.

Worker (`apps/api/src/workers/createxBuildWorker.ts`):
- Radi u `build/` direktoriju, `npm install` prema per‑build package.json
- esbuild (IIFE, `outfile=build/app.js`), minify + tree shaking
- Ako esbuild prijavi "Could not resolve" → pokušaj instalacije nedostajućih allow‑list paketa → ponovni pokušaj
- Na uspjeh: `status=success`, `mode=bundled`; SSE event „final"

Kako brzo objaviti iz PowerShell‑a (Windows):
- Primjer koristi datoteku `apps/api/tmp/test-publish-motion.tsx` kao `inlineCode`.

```powershell
$code = Get-Content -Path .\apps\api\tmp\test-publish-motion.tsx -Raw
$body = @{ inlineCode = $code; title = 'Motion Test'; author = @{ uid = 'dev-user' } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8789/api/publish -ContentType 'application/json' -Body $body -Headers @{ Authorization = "Bearer <FIREBASE_ID_TOKEN>" }
```

Rezultat: `{ ok: true, buildId, listingId, slug }` i build krene. Status:
- SSE: `/build/{buildId}/events`
- Status JSON: `/build/{buildId}/status`


## 5) Reprodukcija (Play) i posluživanje buildova

Rute (apps/api/src/routes/public.ts, index.ts):
- Play redirect:
  - `GET /play/:id` → 307 na najbolju lokaciju:
    - ako postoji bucket objekt: `/public/builds/{buildId}/index.html`
    - inače lokalno: `/builds/{buildId}/bundle/` ili `/builds/{buildId}/`
- Asseti:
  - lokalno: `GET /builds/:buildId/build/*` (eksplicitne rute s točnim MIME + CSP)
  - bucket: `GET /public/builds/*` (proxy u bucket; samo kad `STORAGE_DRIVER !== 'local'`)

Sigurnost/CSP:
- `manifest_v1.json` može zadati `networkPolicy` i `networkDomains` → `buildCsp()` gradi CSP zaglavlje.
- `setStaticHeaders()` postavlja `Content-Security-Policy`, `Cross-Origin-Resource-Policy: cross-origin`, `X-Storage-Backend` i CORS refleksiju za `Origin`.


## 6) Storage arhitektura i bridge

Iframe (aplikacija) ne koristi `window.localStorage` direktno; umjesto toga, `localstorage.js` stubira API i šalje batch operacije parentu (`postMessage`) → parent zove `/api/storage` GET/PATCH, radi ETag sinkronizaciju i vraća snapshot/ACK.

Rute (apps/api/src/routes/storage.ts):
- `GET /api/storage?ns=<namespace>` — dohvaća JSON snapshot; odgovara s `ETag: "<ver>"`
- `PATCH /api/storage?ns=<namespace>` — tijelo: niz operacija `{ op: 'set'|'del'|'clear', ... }`; zahtijeva `If-Match` (ETag) i `X-Thesara-App-Id` header; odgovara `200` ili `201` (kad je `If-Match: 0`)
- CORS: vraća `ETag` i `X-Storage-Backend`, dopušta `Authorization, If-Match, X-Thesara-App-Id`

Backend (apps/api/src/storageV2.ts + config STORAGE_DRIVER):
- `local` — datoteke u `storage/kv`
- `firebase` — GCS bucket (kroz `@google-cloud/storage`); kredencijali iz `FIREBASE_*` ili `GOOGLE_APPLICATION_CREDENTIALS`
- `r2` — Cloudflare R2 (ako je konfiguriran)

Provjeriti u mrežnom tabu:
- `GET /api/storage?ns=default` → `200`, headeri: `ETag`, `X-Storage-Backend`
- `PATCH /api/storage?ns=default` → `200/201`; na `412` klijent treba refetch i retry s novim `ETag`


## 7) Ključne rute i aliasi (/api prefiks)

Zbog globalnog `onRequest` hooka u `apps/api/src/index.ts` koji skida `/api` prefiks, rute se registriraju na rootu. Kako bismo izbjegli ovisnost o hooku (npr. iza drugačijeg reverse proxyja), dodani su eksplicitni aliasi:

- App meta:
  - `GET /app-meta/:id` i `GET /api/app-meta/:id`
- Creators by id (minimalni shape za početnu):
  - `GET /creators/id/:uid` i `GET /api/creators/id/:uid`
- Listings (već je postojao alias):
  - `GET /listings` i `GET /api/listings`

Time su ispravljeni 404 slučajevi koje smo vidjeli u logu:
- `Route GET:/api/app-meta/167 not found`
- `Route GET:/api/creators/id/dev-user not found`


## 8) Dinamičke ovisnosti i allow‑list

- `apps/api/src/lib/dependencies.ts` skenira importove u `_app_entry.tsx` i upisuje `build/package.json` s minimalnim setom ovisnosti.
- Verzije su kontrolirane u `DEPENDENCY_VERSIONS` (allow‑list). Ako želite dodati paket, dodajte ga s verzijom.
- Worker na esbuild grešku „Could not resolve 'pkg'“ pokušava paket iz allow‑lista instalirati i ponoviti build.

Dodavanje nove biblioteke:
1) U `DEPENDENCY_VERSIONS` dodati `{ 'ime-paketa': 'x.y.z' }`
2) Objaviti aplikaciju ponovo (publish) — worker će instalirati novu ovisnost.


## 9) Debug i dijagnostika

- Debug overlay u bundlanom `index.html` pokazuje:
  - runtime error poruke
  - probe za `click` (npr. gumb „Dodaj“) i `submit`
  - dostupnost `crypto.randomUUID`
- Play rute i assets:
  - 404 i CSP problemi bilježe se s tagovima `build_index_not_found`, `build_asset_not_found`
- Storage:
  - `X-Storage-Backend` header u odgovorima
  - rate limit za PATCH (6 / 10s po korisnik:ns)
  - na `412` klijent refetch/ponovni pokušaj

Brzi smoke test (PowerShell):

```powershell
# App meta
Invoke-RestMethod http://127.0.0.1:8789/api/app-meta/167 -Method Get

# Creator by id (dev)
Invoke-RestMethod http://127.0.0.1:8789/api/creators/id/dev-user -Method Get

# Listings (moj popis)
Invoke-RestMethod "http://127.0.0.1:8789/api/listings?owner=wLLhw6RwsgO0QmTUI2wEYW8MmF33" -Method Get
```


## 10) Promjene koje smo uveli (sažetak)

- Per‑app bundlanje (IIFE), automatsko otkrivanje i instalacija ovisnosti, worker retry na missing deps
- Sandbox runtime stabilizacija: Tailwind v3, ReactDOM mount, Recharts fix, shadcn stubovi, randomUUID polyfill, debug overlay
- Storage bridge: zamjena in‑memory shima pravim `postMessage` mostom → parent → `/api/storage` (ETag, batch)
- Rute:
  - `publicRoutes` montirane na root (ne pod `/api`)
  - Dodani aliasi: `/api/app-meta/:id`, `/api/creators/id/:uid`, te već postojeći `/api/listings`
  - Eksplicitne rute za `/builds/:buildId/build/*` (ispravni MIME/CSP)
  - Bucket proxy: `/public/builds/*` kad `STORAGE_DRIVER !== 'local'`


## 11) Preporuke za produkciju

- Postaviti eksplicitno:
  - `PORT`, `PUBLIC_BASE`, `WEB_BASE`
  - `JWT_SECRET`
  - `ALLOWED_ORIGINS` (točna lista domena i/ili wildcard uz oprez)
  - `STORAGE_DRIVER` i pripadne kredencijale (`R2_*` ili `FIREBASE_*`)
  - `REDIS_URL` za BullMQ queue
- Omogućiti worker: `CREATEX_WORKER_ENABLED=true` (i redis)
- SSL/TLS: `HTTPS_KEY`/`HTTPS_CERT` ako API sluša direktno (inače terminacija na reverse proxyju)


## 12) Brzi troubleshooting

- 404 na `/api/app-meta/:id` ili `/api/creators/id/:uid`:
  - Provjeriti da je API restartan nakon ove promjene (dodani aliasi).
- Play 404 nakon publish:
  - Provjeriti da `apps/api` log pokazuje validan redirect (na `/builds/...` ili `/public/builds/...`).
  - Ako `STORAGE_DRIVER !== 'local'`, provjeriti da su objekti za `buildId` prisutni u bucketu.
- Storage `412 Precondition Failed` pri PATCH:
  - Normalno kod konflikta verzije; klijent refetch i retry s novim `ETag`.
- Esbuild „Could not resolve ...“:
  - Dodati paket u `DEPENDENCY_VERSIONS` (allow‑list) i ponoviti publish.


## 13) Mape i ključne datoteke

- API ulaz: `apps/api/src/index.ts`
- Play rute i meta: `apps/api/src/routes/public.ts`
- Publish: `apps/api/src/routes/publish.ts`
- Storage API: `apps/api/src/routes/storage.ts` + `apps/api/src/storageV2.ts`
- Shims (bridgeovi): `apps/api/src/routes/shims.ts`, `apps/api/src/shims/localStorageBridge.ts`
- Build worker: `apps/api/src/workers/createxBuildWorker.ts`
- Dinamičke ovisnosti: `apps/api/src/lib/dependencies.ts`


---
Ako trebate dodatne primjere (npr. curl, Postman kolekciju) ili automatizirane smoke testove, možemo ih dodati u `scripts/` i povezati u CI.
