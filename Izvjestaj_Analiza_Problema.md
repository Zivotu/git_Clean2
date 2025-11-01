# Izvještaj: Analiza problema s playback-om mini aplikacija u Thesara platformi

**Datum**: 30. listopada 2025  
**Problem**: Objavljene mini aplikacije ne pokreću se u Play modu - NS_ERROR_CORRUPTED_CONTENT, CORS i MIME type errors

---

## 1. ARHITEKTURA STAROG PROJEKTA (StariProjekt - FUNKCIONIRA)

### 1.1 Struktura Servisa
- **API Server**: Fastify 4.x, port 8789
- **Static File Serving**: `@fastify/static` plugin
- **Storage Path**: `storage/bundles/builds/:buildId/build/` ili `bundle/`

### 1.2 Routing Mehanizam

```typescript
// apps/api/src/index.ts (StariProjekt)
await app.register(fastifyStatic, {
  root: path.join(config.BUNDLE_STORAGE_PATH, 'builds'),
  prefix: '/builds/',
  decorateReply: false,
  setHeaders: (res, pathName) => {
    // Automatski pozvan za SVE fileove
    setStaticHeaders(res, pathName);
  }
});
```

**Ključne karakteristike**:
- **Jedan handler**: Samo `fastifyStatic` registracija, bez dodatnih routea
- **Automatic MIME detection**: `@fastify/static` interno koristi `mime-types` biblioteku koja automatski detektira:
  - `.js` → `application/javascript`
  - `.html` → `text/html`
  - `.css` → `text/css`
  - `.json` → `application/json`
- **setHeaders callback**: Poziva se **nakon** što `@fastify/static` odredi MIME type i **prije** slanja responsa

### 1.3 Client-Side (PlayPageClient.tsx)

```typescript
// StariProjekt pristup
const iframeSrc = `/builds/${buildId}/build/`;

// Direktno učitavanje u iframe:
<iframe src={iframeSrc} />
```

**Execution Flow**:
1. Browser zatraži `GET /builds/8f144a36.../build/`
2. Fastify static handler pronalazi `index.html` (zbog `index: ['index.html']`)
3. Vraća HTML s CSP headerima iz `setStaticHeaders`
4. Browser parsira HTML, nalazi `<script type="module" src="./app.js">`
5. Browser zatraži `GET /builds/8f144a36.../build/app.js`
6. `@fastify/static` detektira `.js` extension → `Content-Type: application/javascript`
7. `setHeaders` callback dodaje CSP/CORS/CORP headere
8. Module se uspješno učitava

### 1.4 Security Headers (setStaticHeaders)

```typescript
const setStaticHeaders = async (res, pathName) => {
  // 1. Učitaj manifest za CSP policy
  const manifestPath = /* derive from pathName */;
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  
  // 2. Generiraj CSP based on manifest.networkPolicy
  const csp = buildCsp(manifest);
  res.setHeader('Content-Security-Policy', csp);
  
  // 3. CORS headers
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
};
```

**Zašto radi**:
- `pathName` parametar uvijek sadrži **relativnu putanju** fileа (npr. `8f144a36.../build/app.js`)
- Callback se izvršava **nakon** interno postavljenog `Content-Type` headera
- Nema konflikata između više handlera

---

## 2. ARHITEKTURA NOVOG PROJEKTA (Trenutni - NE FUNKCIONIRA)

### 2.1 Struktura Servisa
- **API Server**: Fastify 5.6.1, port 8789
- **Static File Serving**: `@fastify/static` 8.3.0
- **Storage Path**: Isti kao StariProjekt

### 2.2 Routing Mehanizam (Kompleksan)

```typescript
// apps/api/src/routes/buildAlias.ts
app.get('/:listingId/build/*', async (req, reply) => {
  // Pronalazi buildId iz listingId
  const buildId = await resolveBuildId(listingId);
  
  // Injectira request prema /builds/:buildId/build/*
  const response = await app.inject({
    method: 'GET',
    url: `/builds/${buildId}/build/*`
  });
  
  // Vraća response s CSP headerima
  return reply
    .header('Content-Security-Policy', csp)
    .send(response.body);
});

// apps/api/src/index.ts
await app.register(buildAlias); // Registriran PRIJE static handlera

await app.register(fastifyStatic, {
  root: path.join(config.BUNDLE_STORAGE_PATH, 'builds'),
  prefix: '/builds/',
  setHeaders: (res, pathName) => {
    void setStaticHeaders(res, pathName);
  }
});

// Dodatni onRequest hook (najnoviji pokušaj)
app.addHook('onRequest', async (req, reply) => {
  if (!req.url?.startsWith('/builds/')) return;
  
  const reqPath = req.url.replace(/^\/builds\//, '').split('?')[0];
  if (!/\.m?js$/i.test(reqPath)) return;
  
  const filePath = path.join(config.BUNDLE_STORAGE_PATH, 'builds', reqPath);
  const content = await readFile(filePath, 'utf8');
  
  reply.header('Content-Type', 'application/javascript; charset=utf-8');
  reply.header('Access-Control-Allow-Origin', '*');
  return reply.send(content);
});
```

### 2.3 Problemi i Dijagnoza

#### Problem 1: MIME Type Detection Failure
**Simptomi**:
```
GET http://127.0.0.1:8789/builds/8f144a36.../build/app.js
Status: 200
Type: json (SHOULD BE: js)
Content-Type: application/json (SHOULD BE: application/javascript)
Size: 0 B (SHOULD BE: ~50 kB)
```

**Root Cause Analiza**:
1. **Windows Path Separator Issue**:
   - `pathName` u `setHeaders` callback dobiva `8f144a36...\build\app.js` (backslashes)
   - `mime-types` biblioteka očekuje POSIX paths sa `/`
   - Extension detection pukne: `.js\build\app` nije validan extension
   
2. **Query String Pollution**:
   - Ako URL sadrži query parametre (`app.js?v=123&token=xyz`)
   - `mime-types.lookup('app.js?v=123')` vraća `null` → fallback na `application/octet-stream`

3. **setHeaders Timing**:
   - `setHeaders` callback poziva se **nakon** što `@fastify/static` već postavi `Content-Type`
   - Ako `Content-Type` nije postavljen, `setHeaders` **ne može** ga dodati jer radi s Node.js `res` objektom, ne Fastify `reply` objektom
   - `res.setHeader()` može **overwrite**, ali samo ako se pozove **prije** `res.writeHead()`

4. **Hook Execution Order**:
   ```
   onRequest hook → buildAlias route check → fastifyStatic route → setHeaders callback → onSend hook
   ```
   - Ako `onRequest` hook **ne returna** (ili returna bez `reply.send()`), execution nastavlja dalje
   - `fastifyStatic` onda overwritea headere koje je hook postavio
   - Rezultat: `Content-Type: application/json` (možda default fallback)

#### Problem 2: CORS Errors
**Simptomi**:
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:8789/builds/.../app.js. (Reason: CORS request did not succeed). Status code: (null).
```

**Root Cause**:
1. **Missing Origin Header**:
   - Iframe na `http://localhost:3000` zatraži resource `http://127.0.0.1:8789/builds/.../app.js`
   - Browser **ne šalje** `Origin` header jer smatra da je "same-origin" (localhost = 127.0.0.1)
   - Naš CORS logic:
     ```typescript
     if (origin && isOriginAllowed(origin)) {
       res.setHeader('Access-Control-Allow-Origin', origin);
     }
     // Nema fallback → header se ne postavlja!
     ```
   - Browser očekuje `Access-Control-Allow-Origin: *` ili specifičan origin → CORS fail

2. **Preflighted Requests**:
   - Neki requests triggeraju OPTIONS preflight (zbog custom headers)
   - Ako preflight nije pravilno handlan, main request ne prolazi

#### Problem 3: CSP Blocking
**Simptomi**:
```
Content-Security-Policy: The page's settings blocked the loading of a resource at https://cdn.jsdelivr.net/npm/react@19/+esm
```

**Root Cause**:
- CSP generiran iz manifesta **ne uključuje** CDN domene potrebne za React module
- `buildCsp()` funkcija koristi `manifest.networkPolicy`, ali ako manifest ima `network: "isolated"`, CSP blokira sve vanjske domene

#### Problem 4: NS_ERROR_CORRUPTED_CONTENT
**Simptomi**:
```
NS_ERROR_CORRUPTED_CONTENT
The page you are trying to view cannot be shown because an error in data transmission was detected.
```

**Root Cause Chain**:
1. Browser zatraži `app.js` kao ES module (`type="module"`)
2. Dobije `Content-Type: application/json` umjesto `application/javascript`
3. Browser pokuša parsirati kao JSON → pukne jer je JS kod, ne JSON
4. Module loader baca `NS_ERROR_CORRUPTED_CONTENT`
5. Import chain pukne → cijela aplikacija ne učitava

### 2.4 Pokušana Rješenja (Kronološki)

#### Pokušaj 1: Dodavanje CSP u buildAlias
```typescript
// buildAlias.ts
reply.header('Content-Security-Policy', csp);
reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
```
**Rezultat**: Nije riješilo MIME problem jer buildAlias samo handla HTML, ne i JS fileove

#### Pokušaj 2: CORS headers u shims routes
```typescript
// shims.ts
reply.header('Access-Control-Allow-Origin', '*');
reply.type('application/javascript').send(SHIM_CONTENT);
```
**Rezultat**: Shims rade, ali `app.js` i dalje ne

#### Pokušaj 3: srcDoc iframe pristup
```typescript
// PlayPageClient.tsx
const html = await fetch(`/:appId/build/`).then(r => r.text());
const modifiedHtml = html.replace('<head>', '<head><base href="/builds/:buildId/build/">');
<iframe srcDoc={modifiedHtml} />
```
**Rezultat**: srcDoc iframe **nasljeđuje parent CSP** → blokira CDN skripte

#### Pokušaj 4: Direktna /builds/ putanja
```typescript
const iframeSrc = `/builds/${buildId}/build/`;
<iframe src={iframeSrc} />
```
**Rezultat**: Zaobiđen buildAlias, ali MIME problem ostao

#### Pokušaj 5: Explicit Content-Type override u setStaticHeaders
```typescript
const setStaticHeaders = async (res, pathName) => {
  if (pathName && /\.m?js$/i.test(pathName)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
  // ... rest of CSP logic
};
```
**Rezultat**: Nije funkcioniralo jer `pathName` sadrži Windows backslashes ili je pozvan prekasno

#### Pokušaj 6: onRequest hook interceptor
```typescript
app.addHook('onRequest', async (req, reply) => {
  if (req.url?.startsWith('/builds/') && /\.m?js$/i.test(req.url)) {
    const content = await readFile(filePath, 'utf8');
    reply.header('Content-Type', 'application/javascript; charset=utf-8');
    return reply.send(content);
  }
});
```
**Rezultat**: Hook se izvršava, ali možda **ne prekida** dalje izvršavanje ili `fastifyStatic` overwritea headere

---

## 3. THESARA PLATFORMA - CILJEVI I ZAHTJEVI

### 3.1 Korisničko Iskustvo (User Flow)

#### Publish Flow
1. **Korisnik (Creator)** kreira mini app kroz ChatGPT ili Thesara UI
2. Klikne **"Publish App"** button
3. **Frontend** (`apps/web`):
   - Prikuplja source code fileove (_app_entry.tsx, package.json, metadata)
   - Šalje POST request na `/api/publish`
4. **Backend** (`apps/api`):
   - Prima multipart/form-data
   - Validira strukturu (mora biti React komponenta)
   - Dodaje job u BullMQ queue
   - Vraća `{ buildId, listingId }`
5. **Worker**:
   - Bundlea aplikaciju pomoću esbuild:
     - Input: `_app_entry.tsx`
     - Output: `app.js` (single bundle)
     - External: React, ReactDOM (učitavaju se iz CDN)
   - Generira `index.html` s import mapom:
     ```html
     <script type="importmap">
     {
       "imports": {
         "react": "https://esm.sh/react@19",
         "react-dom": "https://esm.sh/react-dom@19",
         "thesara-client": "/shims/rooms.js",
         "thesara-client/storage": "/shims/storage.js"
       }
     }
     </script>
     <script type="module" src="./app.js"></script>
     ```
   - Sprema fileove u `storage/bundles/builds/:buildId/build/`
   - Updatea listing status → `PUBLISHED`
6. **Frontend**: Pokazuje "App published successfully!" i link na Play page

#### Play Flow (Ovo NE RADI trenutno)
1. **Korisnik (Player)** klikne na **"Play"** button za neku aplikaciju
2. **Frontend** navigira na `/play/:appId`
3. **PlayPageClient.tsx**:
   - Fetcha listing metadata (`GET /api/listings/:appId`)
   - Dobiva `{ buildId, title, description, ... }`
   - Kreira iframe sa `src="/builds/:buildId/build/"`
   - Postavlja postMessage bridge za Storage API
4. **Browser učitava iframe**:
   - `GET /builds/:buildId/build/` → Dobiva `index.html`
   - Parsira HTML, učitava:
     - `GET https://esm.sh/react@19` → React module
     - `GET https://esm.sh/react-dom@19` → ReactDOM module
     - `GET /shims/rooms.js` → Thesara Rooms API shim
     - `GET /shims/storage.js` → Thesara Storage API shim
     - `GET /builds/:buildId/build/app.js` → **User aplikacija (OVDJE PROBLEM)**
5. **Unutar iframe-a**:
   - User aplikacija renderira UI
   - Ako pozove `storage.set('key', 'value')`:
     - Shim šalje `postMessage` prema parent windowu
     - PlayPageClient hvata poruku, šalje na API `/api/storage/set`
     - Vraća response nazad kroz `postMessage`
     - Shim resolvea Promise

### 3.2 Arhitekturni Zahtjevi

#### Security Requirements
1. **Content Security Policy (CSP)**:
   - **Purpose**: Sprječiti XSS i malicious code injection
   - **Manifest-driven**: Svaka aplikacija deklarira `networkPolicy` u manifestu:
     ```json
     {
       "networkPolicy": {
         "allowedDomains": ["api.example.com"],
         "allowCdn": true,
         "allowInlineStyles": false
       }
     }
     ```
   - **Dynamic CSP**: CSP se generira per-app based on policy:
     ```
     default-src 'self';
     script-src 'self' https://esm.sh https://cdn.jsdelivr.net;
     connect-src 'self' https://api.example.com;
     style-src 'self' 'unsafe-inline';
     ```

2. **CORS (Cross-Origin Resource Sharing)**:
   - **Problem**: Thesara API (`127.0.0.1:8789`) mora biti dostupan iz iframe-a hostanog na istom ili različitom originu
   - **Requirements**:
     - Static assets (`/builds/*`) → `Access-Control-Allow-Origin: *` (public)
     - API endpoints (`/api/*`) → `Access-Control-Allow-Origin: <whitelisted origins>` + credentials
     - Shims (`/shims/*`) → `Access-Control-Allow-Origin: *` (potrebni za module imports)

3. **CORP (Cross-Origin Resource Policy)**:
   - Svi static asseti moraju imati `Cross-Origin-Resource-Policy: cross-origin`
   - Omogućava učitavanje iz iframe-a

#### Performance Requirements
1. **Bundle Size**: `app.js` treba biti < 500 kB (optimizacija esbuild)
2. **CDN Caching**: React/ReactDOM iz CDN-a s `Cache-Control: public, max-age=31536000`
3. **Static Caching**: `/builds/*` fileovi immutable nakon publisha → agresivno cache

#### Module Loading Requirements
1. **ES Modules**: Sve mora biti ESM, no CommonJS
2. **Import Maps**: Support za bare specifiers (`import React from 'react'`)
3. **Dynamic Imports**: Support za `import('./lazy-component.js')`
4. **External Dependencies**: React, ReactDOM **ne smiju** biti bundlani u `app.js` (eksterni)

### 3.3 Razlike između projekata

| Aspekt | StariProjekt | Novi Projekt |
|--------|--------------|--------------|
| **Routing** | Jedan static handler | buildAlias + static handler + hooks |
| **Path Format** | `/builds/:id/build/` direktno | `/:listingId/build/` → alias → inject |
| **MIME Detection** | Automatski (radi) | Pukne (ne detektira .js) |
| **CSP Logic** | Jednostavan, jedan callback | Kompleksan, više mjesta |
| **CORS** | Postavljen uvijek | Kondicionalan, pukne bez Origin headera |
| **Windows Support** | Testiran | Backslash issues |
| **Hook Usage** | Minimalno | Previše hookova, execution order konfliktan |

---

## 4. TRENUTNI STATUS I NERIJEŠENI PROBLEMI

### 4.1 Što Radi
- ✅ Redis container (Docker Compose)
- ✅ API server s BullMQ worker
- ✅ Publish flow (build job uspješan)
- ✅ Shims endpoints (`/shims/rooms.js`, `/shims/storage.js`) vraćaju `Content-Type: application/javascript`
- ✅ HTML file (`/builds/:id/build/`) učitava se ispravno
- ✅ CSP headeri postavljeni na HTML responseu

### 4.2 Što NE Radi
- ❌ `app.js` dobiva `Content-Type: application/json` umjesto `application/javascript`
- ❌ Browser baca `NS_ERROR_CORRUPTED_CONTENT`
- ❌ CORS errors: "request did not succeed", status code (null)
- ❌ Module loading chain pukne → aplikacija se ne renderira

### 4.3 Debug Output (Network Tab)
```
GET http://127.0.0.1:8789/builds/8f144a36-d1e3-45ae-bdcf-ada1176e3295/build/app.js
Status: 200 (ali nema content)
Type: json ← PROBLEM
Transferred: 0 B ← PROBLEM
Size: 0 B ← PROBLEM

Console Error:
Loading module from "http://127.0.0.1:8789/builds/.../build/app.js" 
was blocked because of a disallowed MIME type ("application/json").

Cross-Origin Request Blocked: The Same Origin Policy disallows reading 
the remote resource. (Reason: CORS request did not succeed). Status code: (null).
```

---

## 5. PITANJA ZA DALJNJE ISTRAŽIVANJE

### 5.1 Fastify Static Internals
1. **Kako `@fastify/static` odlučuje koji MIME type postaviti?**
   - Koristi li `mime-types.lookup(path)`?
   - Ako da, handla li Windows backslash pathove?
   - Što se događa ako `lookup()` vrati `null`?

2. **Kada se `setHeaders` callback poziva u execution lifecycle-u?**
   - Prije ili nakon `res.writeHead()`?
   - Može li overwrite već postavljeni `Content-Type`?
   - Izvršava li se za 404 responses?

3. **Kako `onRequest` hook interagira s fastify-static routeom?**
   - Ako hook pozove `reply.send()`, zaustavlja li to dalje izvršavanje?
   - Može li `fastifyStatic` overwriteat headere postavljene u hooku?

### 5.2 Windows Path Handling
1. **Kako normalizirati pathove prije slanja u `setHeaders`?**
   ```typescript
   const normalizedPath = pathName?.replace(/\\/g, '/');
   ```
   
2. **Treba li koristiti `path.posix.join()` umjesto `path.join()`?**
   - `path.join()` na Windowsu vraća backslashes
   - `path.posix.join()` uvijek vraća forward slashes

### 5.3 Alternative Architecture
1. **Treba li napustiti buildAlias pristup?**
   - Vratiti se na direktne `/builds/:buildId/build/` URLove?
   - Koristiti client-side alias resolution?

2. **Treba li implementirati custom static handler umjesto `@fastify/static`?**
   ```typescript
   app.get('/builds/:buildId/*', async (req, reply) => {
     const filePath = resolveFilePath(req.params);
     const mimeType = mime.lookup(filePath); // Manual MIME detection
     reply.header('Content-Type', mimeType);
     return reply.sendFile(filePath);
   });
   ```

3. **Može li se koristiti Nginx kao reverse proxy za static files?**
   - Nginx ima robustan MIME detection
   - Može hardcodeat headere per extension
   - Fastify handla samo API logic

### 5.4 CORS Strategy
1. **Treba li uvijek vratiti `Access-Control-Allow-Origin: *` za `/builds/*`?**
   - Static asseti su ionako javni
   - Eliminira problem s missing Origin headerom

2. **Kako pravilno handlati OPTIONS preflight requests?**
   ```typescript
   app.options('/builds/*', async (req, reply) => {
     reply.header('Access-Control-Allow-Origin', '*');
     reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
     reply.header('Access-Control-Allow-Headers', '*');
     return reply.send();
   });
   ```

### 5.5 CSP Refinement
1. **Kako dinamički uključiti CDN domene u CSP?**
   ```typescript
   const csp = `
     default-src 'self';
     script-src 'self' https://esm.sh https://cdn.jsdelivr.net;
     connect-src 'self' ${manifest.networkPolicy.allowedDomains.join(' ')};
   `;
   ```

2. **Treba li CSP biti različit za index.html i app.js?**
   - HTML može imati strožiji CSP
   - JS fileovi možda ne trebaju CSP header (samo se izvršavaju, ne serveiraju HTML)

---

## 6. PREPORUKE ZA SLJEDEĆE KORAKE

### 6.1 Kratkoročno (Brzi Fix)
1. **Napusti `onRequest` hook pristup** (očito ne radi)
2. **Implementiraj custom route PRIJE `fastifyStatic` registracije**:
   ```typescript
   app.get('/builds/:buildId/build/:filename', async (req, reply) => {
     const { buildId, filename } = req.params;
     
     // Force MIME type based on extension
     const ext = path.extname(filename);
     const mimeType = mime.lookup(ext) || 'application/octet-stream';
     
     const filePath = path.join(
       config.BUNDLE_STORAGE_PATH, 
       'builds', 
       buildId, 
       'build', 
       filename
     );
     
     reply.header('Content-Type', mimeType);
     reply.header('Access-Control-Allow-Origin', '*');
     reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
     
     return reply.sendFile(filename, path.dirname(filePath));
   });
   ```

3. **Testirati sa `reply.sendFile()` umjesto `readFile + send()`**
   - `sendFile()` ima built-in streaming i error handling

### 6.2 Srednjoročno (Refactoring)
1. **Eliminirati buildAlias ako nije kritičan**
   - Client-side može direktno koristiti `/builds/:buildId/build/`
   - Jednostavnija arhitektura

2. **Centralizirati security header logic**:
   ```typescript
   // middleware/staticHeaders.ts
   export const applyStaticHeaders = (reply, manifest) => {
     reply.header('Content-Security-Policy', buildCsp(manifest));
     reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
     reply.header('Access-Control-Allow-Origin', '*');
   };
   ```

3. **Path normalization utility**:
   ```typescript
   // utils/paths.ts
   export const normalizePath = (p: string) => {
     return p.replace(/\\/g, '/');
   };
   ```

### 6.3 Dugoročno (Production Ready)
1. **Nginx reverse proxy za static assets**
   ```nginx
   location /builds/ {
     alias /var/thesara/storage/bundles/builds/;
     
     location ~* \.js$ {
       add_header Content-Type application/javascript;
       add_header Access-Control-Allow-Origin *;
       add_header Cross-Origin-Resource-Policy cross-origin;
     }
   }
   ```

2. **CDN za bundle distribution** (Cloudflare, AWS CloudFront)
   - Edge caching
   - Automatic MIME detection
   - Global availability

3. **Monitoring i logging**:
   ```typescript
   app.addHook('onResponse', (req, reply, done) => {
     logger.info({
       url: req.url,
       statusCode: reply.statusCode,
       contentType: reply.getHeader('content-type'),
       responseTime: reply.getResponseTime()
     });
     done();
   });
   ```

---

## 7. ZAKLJUČAK

**Root Problem**: `@fastify/static` MIME detection ne radi kako treba za nested `.js` fileove na Windows environmentu, a naši hookovi/callbackovi ne uspijevaju to korigirati zbog execution order problema.

**Immediate Action**: Implementirati **custom route handler** koji **eksplicitno** postavlja sve potrebne headere **prije** pozivanja `sendFile()`.

**Long-term Solution**: Izvaditi static file serving iz Fastify-ja i koristiti Nginx ili CDN koji imaju production-tested MIME handling.

**Critical Requirement**: Bez ispravnog `Content-Type: application/javascript` headera, **cijeli module loading chain ne može funkcionirati** → aplikacija neće nikad raditi.

---

**Pripremljeno za**: Konzultaciju s drugim AI sistemom / review od strane tima  
**Status**: BLOCKER - Ne možemo deployati dok se ovo ne riješi  
**Priority**: P0 (kritično)
