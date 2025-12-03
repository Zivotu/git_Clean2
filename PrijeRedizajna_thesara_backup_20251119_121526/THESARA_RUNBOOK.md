
# Thesara â€” Platform Runbook (2025-11-02)

**Status update:** Objavljivanje, odobravanje i Play sada rade u produkciji (thesara.space). Nginx i API su usklaÄ‘eni s dokumentacijom. Sobe (rooms) joÅ¡ nisu vidljive â€“ to je jedini preostali problem. SljedeÄ‡i korak: provjeriti storage shim i PlayPageClient.tsx, osigurati da svi pozivi idu na /api/storage, a ne na window.localStorage.

Ovaj dokument je referentna toÄka za trenutnu konfiguraciju sustava, tokove objave i reprodukcije miniâ€‘aplikacija, storage arhitekturu te rjeÅ¡enja koja smo implementirali tijekom stabilizacije. Zamjenjuje stariji izvjeÅ¡taj `Izvjestaj_Analiza_Problema.md`.


## 1) Kratak pregled arhitekture

- Monoâ€‘repo (pnpm workspaces):
  - `apps/api` â€” Fastify API, bundlanje i posluÅ¾ivanje build artefakata, storage API, SSE za build status.
  - `apps/web` â€” Next.js (SSR) web klijent (Play stranice, Admin, itd.).
  - `storage/` â€” lokalni storage (listings.json, uploads, itd.).
- Objavljene miniâ€‘aplikacije se bundlaju perâ€‘app (esbuild, IIFE) i posluÅ¾uju ispod:
  - lokalno: `/builds/:buildId/build/*`
  - bucket (Firebase/GCS/R2): `/public/builds/*` (API proxy na bucket)
- Play sandbox (iframe) koristi shims:
  - Tailwind v3 CDN u index predloÅ¡ku
  - `crypto.randomUUID` polyfill (nesigurna okolina)
  - Minimalni debug overlay (error/probe)
  - `localStorage`/`sessionStorage` bridge preko `postMessage` â†’ parent â†’ `/api/storage`
- Storage API (ETag, rate limit, backend pluggable â€” local/R2/Firebase GCS) s batch PATCH operacijama.


## 2) Lokalni razvoj i pokretanje

Preduvjet: Docker (za Redis), Node 20+, pnpm.

- Pokretanje cijelog dev okruÅ¾enja (API + worker + web):
  - `pnpm dev` (root) â€” podiÅ¾e Redis (docker compose) i pokreÄ‡e:
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
- API bira port poÄevÅ¡i od `PORT` (default 8789); ako je zauzet, pokuÅ¡ava +1 do 10 puta.


## 3) Konfiguracija okoline (apps/api/src/config.ts)

KljuÄni ENVâ€‘ovi (defaulti su razumna dev vrijednost):
- PORT: default 8789
- PUBLIC_BASE: vanjski base URL APIâ€‘ja (default `http://127.0.0.1:8789`)
- WEB_BASE: `http://localhost:3000`
- BUNDLE_STORAGE_PATH / PREVIEW_STORAGE_PATH: gdje se spremaju buildovi
- STORAGE_DRIVER: `local` | `r2` | `firebase` (auto odreÄ‘ivanje preko kredencijala ako nije postavljeno)
- ALLOWED_ORIGINS: CORS lista (CSV) â€” npr. `http://localhost:3000,https://thesara.space`
- JWT_SECRET: potreban u production, u devu se generira fallback
- REDIS_URL ili REDIS_HOST/REDIS_PORT: za build queue
- FIREBASE_*: za GCS/Firebase bucket (projectId, clientEmail, privateKey, storageBucket)
- CREATEX_WORKER_ENABLED: `true` da se pokrene build worker

CORS: API dinamiÄki dopuÅ¡ta exact i wildcard origene iz ALLOWED_ORIGINS; "null" origin (sandboxed iframe) je dozvoljen.


## 4) Objavljivanje miniâ€‘aplikacije (Publish flow)

Endpoint: `POST /api/publish`

Payload (saÅ¾eto):
- `inlineCode: string` â€” izvorni kod React komponente (TS/TSX je OK; esbuild obrada u workeru)
- `title`, `description`, `author.uid`, `translations`, `visibility`, `preview.dataUrl` (opcionalno)

Å to se dogaÄ‘a:
1) Kreira se zapis u bazi za Build i Listing (FK safety) i inicijalna struktura build direktorija.
2) Generira se `build/index.html` s:
   - Tailwind v3 CDN
   - randomUUID polyfill, debug overlay
   - `<script src="/shims/localstorage.js"></script>` (storage bridge)
   - `<div id="root"></div>` i uÄitavanje `app.js`
3) Iz korisniÄkog koda generira se `_app_entry.tsx` koji Ä‡e:
   - po potrebi injektirati lagane shadcn/ui stubove (Card, Button, â€¦)
   - ispraviti Recharts ResponsiveContainer i PieChart dimenzije za iframe
   - renderati default export komponentu u `#root`
4) `ensureDependencies(buildId)` skenira importove i upisuje minimalni `package.json` (allowâ€‘list verzije)
5) Build posao se stavlja u red (BullMQ) i worker ga preuzima.

Worker (`apps/api/src/workers/createxBuildWorker.ts`):
- Radi u `build/` direktoriju, `npm install` prema perâ€‘build package.json
- esbuild (IIFE, `outfile=build/app.js`), minify + tree shaking
- Ako esbuild prijavi "Could not resolve" â†’ pokuÅ¡aj instalacije nedostajuÄ‡ih allowâ€‘list paketa â†’ ponovni pokuÅ¡aj
- Na uspjeh: `status=success`, `mode=bundled`; SSE event â€žfinal"


Bundle upload worker (`apps/api/src/workers/bundleBuildWorker.ts`):
- Prihvaća ZIP koji mora imati lock (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` ili `bun.lockb`) i prema njemu bira alat (`npm ci`, `pnpm install --frozen-lockfile`, …) te per-job `.npmrc` i cache.
- Nakon uspješnog builda lock se kopira u `storage\bundles\listing-locks\<listingId>` pa sljedeći upload istog listinga može koristiti cacheirani lock čak i ako ga ZIP ne sadrži.
- Ako ZIP uopće nema lock, worker prvo pokušava vratiti cacheirani lock za listing; ako ga nema, sintetizira `package-lock.json` (`npm install --package-lock-only`, `save-exact=true`, izolirani cache) i tek onda pokreće `npm ci`.
- Windows Defender / antivirus: dodaj `C:\thesara_RollBack\storage\bundles` u izuzeća jer cleanup `node_modules` briše desetke tisuća datoteka – bez izuzeća Defender zna držati lockove (`EPERM`) i spriječiti sljedeći build.

Kako brzo objaviti iz PowerShellâ€‘a (Windows):
- Primjer koristi datoteku `apps/api/tmp/test-publish-motion.tsx` kao `inlineCode`.

```powershell
$code = Get-Content -Path .\apps\api\tmp\test-publish-motion.tsx -Raw
$body = @{ inlineCode = $code; title = 'Motion Test'; author = @{ uid = 'dev-user' } } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8789/api/publish -ContentType 'application/json' -Body $body -Headers @{ Authorization = "Bearer <FIREBASE_ID_TOKEN>" }
```

Rezultat: `{ ok: true, buildId, listingId, slug }` i build krene. Status:
- SSE: `/build/{buildId}/events`
- Status JSON: `/build/{buildId}/status`


## 5) Reprodukcija (Play) i posluÅ¾ivanje buildova

Rute (apps/api/src/routes/public.ts, index.ts):
- Play redirect:
  - `GET /play/:id` â†’ 307 na najbolju lokaciju:
    - ako postoji bucket objekt: `/public/builds/{buildId}/index.html`
    - inaÄe lokalno: `/builds/{buildId}/bundle/` ili `/builds/{buildId}/`
- Asseti:
  - lokalno: `GET /builds/:buildId/build/*` (eksplicitne rute s toÄnim MIME + CSP)
  - bucket: `GET /public/builds/*` (proxy u bucket; samo kad `STORAGE_DRIVER !== 'local'`)

Sigurnost/CSP:
- `manifest_v1.json` moÅ¾e zadati `networkPolicy` i `networkDomains` â†’ `buildCsp()` gradi CSP zaglavlje.
- `setStaticHeaders()` postavlja `Content-Security-Policy`, `Cross-Origin-Resource-Policy: cross-origin`, `X-Storage-Backend` i CORS refleksiju za `Origin`.


### Admin pristup (PIN + role)

- Admin UI se otključava isključivo na backendu: korisnik mora biti prijavljen, imati email na listi `adminSettings/accessControl.allowedEmails` i unijeti PIN koji odgovara `ADMIN_ACCESS_PIN_HASH`.
- `POST /admin/access/unlock` provodi PIN provjeru, rate limiting (`ADMIN_ACCESS_WINDOW_MS`, `ADMIN_ACCESS_MAX_ATTEMPTS`) i dodjeljuje custom claim `admin=true` kada je potrebno.
- Hash se generira npr. `echo -n 'pin+salt' | sha256sum`; vrijednost ide u `ADMIN_ACCESS_PIN_HASH`, opcionalni salt u `ADMIN_ACCESS_PIN_SALT`.
- Popis dopuštenih emailova se održava preko admin taba (pozivi `GET/POST /admin/access/allowed`); nema više direktnog Firestore pristupa iz browsera.

## 6) Storage arhitektura i bridge

Iframe (aplikacija) ne koristi `window.localStorage` direktno; umjesto toga, `localstorage.js` stubira API i Å¡alje batch operacije parentu (`postMessage`) â†’ parent zove `/api/storage` GET/PATCH, radi ETag sinkronizaciju i vraÄ‡a snapshot/ACK.

Rute (apps/api/src/routes/storage.ts):
- `GET /api/storage?ns=<namespace>` â€” dohvaÄ‡a JSON snapshot; odgovara s `ETag: "<ver>"`
- `PATCH /api/storage?ns=<namespace>` â€” tijelo: niz operacija `{ op: 'set'|'del'|'clear', ... }`; zahtijeva `If-Match` (ETag) i `X-Thesara-App-Id` header; odgovara `200` ili `201` (kad je `If-Match: 0`)
- CORS: vraÄ‡a `ETag` i `X-Storage-Backend`, dopuÅ¡ta `Authorization, If-Match, X-Thesara-App-Id`

Backend (apps/api/src/storageV2.ts + config STORAGE_DRIVER):
- `local` â€” datoteke u `storage/kv`
- `firebase` â€” GCS bucket (kroz `@google-cloud/storage`); kredencijali iz `FIREBASE_*` ili `GOOGLE_APPLICATION_CREDENTIALS`
- `r2` â€” Cloudflare R2 (ako je konfiguriran)

Provjeriti u mreÅ¾nom tabu:
- `GET /api/storage?ns=default` â†’ `200`, headeri: `ETag`, `X-Storage-Backend`
- `PATCH /api/storage?ns=default` â†’ `200/201`; na `412` klijent treba refetch i retry s novim `ETag`



### 6.1) Novo (2025-11) — shim fix i Rooms/Play dijagnostika

- **Shim inicijalizacija:** `apps/api/src/shims/localStorageBridge.ts` sada postavlja `NS = getNamespace()` prije prvog `debugLog('boot', …)` poziva. Ako se u konzoli pojavi `ReferenceError: Cannot access 'NS' before initialization`, znači da browser još uvijek servira staru verziju (`/shims/localstorage.js`). Riješi se `pnpm --filter @thesara/api build`, `pm2 restart thesara-api` i hard reload ili `?v=<commit>` parametar.
- **Demo soba/room token:** `PlayPageClient.tsx` automatski zove `/api/rooms/storage/demo` i iframeu dodaje `?ns=app:<appId>:room:<code>&roomToken=<jwt>`. Svaki `app:*:room:*` namespace zahtijeva isti `X-Thesara-Room-Token` na `/api/storage`. Ako ga nema, server vraća `403 room_token_missing`.
- **401 uzrok:** Poruka “Failed to fetch snapshot…” najčešće je `401` iz `GET /api/storage` jer je Firebase ID token (query param `token=`) istekao ili oštećen. U `pm2 logs thesara-api` to izgleda kao `auth: firebase verify error summary` / `auth/argument-error`. Rješenje je osvježiti login odnosno Play link; `ROOMS_STORAGE_SECRET` je već ispravan.
- **Kako provjeriti na VPS-u:**
  ```
  pm2 logs thesara-api --lines 20 | rg "Storage patch successful"
  ls storage/kv | rg app-<appId>-room
  ```
  Ako se logovi pojavljuju i JSON fajl postoji (npr. `storage/kv/app-74-room-demo.json`), storage radi. Ako vidiš `401`, fokusiraj se na Firebase token; ako vidiš `403`, provjeri stiže li `roomToken`.

## 7) KljuÄne rute i aliasi (/api prefiks)

Zbog globalnog `onRequest` hooka u `apps/api/src/index.ts` koji skida `/api` prefiks, rute se registriraju na rootu. Kako bismo izbjegli ovisnost o hooku (npr. iza drugaÄijeg reverse proxyja), dodani su eksplicitni aliasi:

- App meta:
  - `GET /app-meta/:id` i `GET /api/app-meta/:id`
- Creators by id (minimalni shape za poÄetnu):
  - `GET /creators/id/:uid` i `GET /api/creators/id/:uid`
- Listings (veÄ‡ je postojao alias):
  - `GET /listings` i `GET /api/listings`

Time su ispravljeni 404 sluÄajevi koje smo vidjeli u logu:
- `Route GET:/api/app-meta/167 not found`
- `Route GET:/api/creators/id/dev-user not found`


## 8) DinamiÄke ovisnosti i allowâ€‘list

- `apps/api/src/lib/dependencies.ts` skenira importove u `_app_entry.tsx` i upisuje `build/package.json` s minimalnim setom ovisnosti.
- Verzije su kontrolirane u `DEPENDENCY_VERSIONS` (allowâ€‘list). Ako Å¾elite dodati paket, dodajte ga s verzijom.
- Worker na esbuild greÅ¡ku â€žCould not resolve 'pkg'â€œ pokuÅ¡ava paket iz allowâ€‘lista instalirati i ponoviti build.

Dodavanje nove biblioteke:
1) U `DEPENDENCY_VERSIONS` dodati `{ 'ime-paketa': 'x.y.z' }`
2) Objaviti aplikaciju ponovo (publish) â€” worker Ä‡e instalirati novu ovisnost.


## 9) Debug i dijagnostika

- Debug overlay u bundlanom `index.html` pokazuje:
  - runtime error poruke
  - probe za `click` (npr. gumb â€žDodajâ€œ) i `submit`
  - dostupnost `crypto.randomUUID`
- Play rute i assets:
  - 404 i CSP problemi biljeÅ¾e se s tagovima `build_index_not_found`, `build_asset_not_found`
- Storage:
  - `X-Storage-Backend` header u odgovorima
  - rate limit za PATCH (6 / 10s po korisnik:ns)
  - na `412` klijent refetch/ponovni pokuÅ¡aj

Brzi smoke test (PowerShell):

```powershell
# App meta
Invoke-RestMethod http://127.0.0.1:8789/api/app-meta/167 -Method Get

# Creator by id (dev)
Invoke-RestMethod http://127.0.0.1:8789/api/creators/id/dev-user -Method Get

# Listings (moj popis)
Invoke-RestMethod "http://127.0.0.1:8789/api/listings?owner=wLLhw6RwsgO0QmTUI2wEYW8MmF33" -Method Get
```


## 10) Promjene koje smo uveli (saÅ¾etak)

- Perâ€‘app bundlanje (IIFE), automatsko otkrivanje i instalacija ovisnosti, worker retry na missing deps
- Sandbox runtime stabilizacija: Tailwind v3, ReactDOM mount, Recharts fix, shadcn stubovi, randomUUID polyfill, debug overlay
- Storage bridge: zamjena inâ€‘memory shima pravim `postMessage` mostom â†’ parent â†’ `/api/storage` (ETag, batch)
- Rute:
  - `publicRoutes` montirane na root (ne pod `/api`)
  - Dodani aliasi: `/api/app-meta/:id`, `/api/creators/id/:uid`, te veÄ‡ postojeÄ‡i `/api/listings`
  - Eksplicitne rute za `/builds/:buildId/build/*` (ispravni MIME/CSP)
  - Bucket proxy: `/public/builds/*` kad `STORAGE_DRIVER !== 'local'`


## 11) Preporuke za produkciju

- Postaviti eksplicitno:
  - `PORT`, `PUBLIC_BASE`, `WEB_BASE`
  - `JWT_SECRET`
  - `ALLOWED_ORIGINS` (toÄna lista domena i/ili wildcard uz oprez)
  - `STORAGE_DRIVER` i pripadne kredencijale (`R2_*` ili `FIREBASE_*`)
  - `REDIS_URL` za BullMQ queue
- OmoguÄ‡iti worker: `CREATEX_WORKER_ENABLED=true` (i redis)
- SSL/TLS: `HTTPS_KEY`/`HTTPS_CERT` ako API sluÅ¡a direktno (inaÄe terminacija na reverse proxyju)


## 12) Brzi troubleshooting

- 404 na `/api/app-meta/:id` ili `/api/creators/id/:uid`:
  - Provjeriti da je API restartan nakon ove promjene (dodani aliasi).
- Play 404 nakon publish:
  - Provjeriti da `apps/api` log pokazuje validan redirect (na `/builds/...` ili `/public/builds/...`).
  - Ako `STORAGE_DRIVER !== 'local'`, provjeriti da su objekti za `buildId` prisutni u bucketu.
- Storage `412 Precondition Failed` pri PATCH:
  - Normalno kod konflikta verzije; klijent refetch i retry s novim `ETag`.
- Esbuild â€žCould not resolve ...â€œ:
  - Dodati paket u `DEPENDENCY_VERSIONS` (allowâ€‘list) i ponoviti publish.


## 13) Mape i kljuÄne datoteke

- API ulaz: `apps/api/src/index.ts`
- Play rute i meta: `apps/api/src/routes/public.ts`
- Publish: `apps/api/src/routes/publish.ts`
- Storage API: `apps/api/src/routes/storage.ts` + `apps/api/src/storageV2.ts`
- Shims (bridgeovi): `apps/api/src/routes/shims.ts`, `apps/api/src/shims/localStorageBridge.ts`
- Build worker: `apps/api/src/workers/createxBuildWorker.ts`
- DinamiÄke ovisnosti: `apps/api/src/lib/dependencies.ts`


---
Ako trebate dodatne primjere (npr. curl, Postman kolekciju) ili automatizirane smoke testove, moÅ¾emo ih dodati u `scripts/` i povezati u CI.
