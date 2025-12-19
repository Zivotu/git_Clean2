# Analiza problema: `/build/` vs `/bundle/` putanje

**Datum:** 2025-12-19  
**Problem:** "App not found" kada se pokrene aplikacija online, slike ne vidim  
**Izvor:** ChatGPT analiza server stanja

---

## 📊 TRENUTNO STANJE

### Na serveru (disk):
```
/srv/thesara/storage/bundles/builds/<BUILD_ID>/build/
├── index.html
├── app.js
├── manifest_v1.json
└── ...
```

### Što API servira:
✅ `/builds/<BUILD_ID>/bundle/...` → **200 OK** (compatibility layer)  
❌ `/builds/<BUILD_ID>/build/...` → **200 OK** (primary)  
❌ `/builds/<BUILD_ID>/index.html` → **404** (nema root serviranje)

### Što frontend traži:
- `PlayPageClient.tsx` (linija 252-254): `/builds/<BUILD_ID>/build/`
- `BuildBadges.tsx`: `/builds/<BUILD_ID>/build/manifest_v1.json`
- `apps/page.tsx`: `/builds/<BUILD_ID>/build/manifest_v1.json`

---

## 🔍 DETALJNA ANALIZA

### 1. API Struktura (Backend)

**Glavne disk putanje** (`paths.ts`, linija 11):
```typescript
export function getBuildDir(id: string): string {
  return path.join(BUNDLE_ROOT, 'builds', id, 'bundle');
}
```
☝️ **PROBLEM:** Funkcija vraća `bundle/`, ali diskovi imaju `build/`!

**API servira na** (`index.ts`, linija 634-720):
- `/builds/:buildId/build` → čita iz `/builds/<id>/build/` direktorija
- `/builds/:buildId/bundle` → **redirect** na `/build/` ako `bundle/` ne postoji
- **Fallback mehanizam** (linija 653-663): ako ne nađe u `build/`, traži u `bundle/`

**Ostale API putanje koje koriste** `/bundle/`:
- `public.ts`: Sve redirect logike (linije 240, 293, 537, 612, 640, 715)
- `bundleBuildWorker.ts`: `baseHref` u HTML (linija 1317)
- `Build.ts`: `injectBaseHref` (linija 75)
- `review.ts`: Preview URL-ovi (linija 450)

### 2. Frontend Struktura (Web)

**Što frontend traži:**
```typescript
// PlayPageClient.tsx (linija 247-254)
const baseIframeSrc = useMemo(() => {
  if (!buildId) return buildIframeSrc(appId);
  const base = (APPS_HOST || '').replace(/\/$/, '');
  const encodedId = encodeURIComponent(buildId);
  if (!base) {
    return `/builds/${encodedId}/build/`;  // ← OVDJE
  }
  return `${base}/builds/${encodedId}/build/`;  // ← I OVDJE
}, [appId, buildId])
```

**Ostali frontend zapisi:**
- `app/apps/page.tsx`: `/build/manifest_v1.json`
- `app/components/BuildBadges.tsx`: `/build/manifest_v1.json`
- `dev/play-debug/page.tsx`: `/builds/${id}/index.html` (testni)

### 3. Compatibility Layer

API **IMA** compatibility rute (`index.ts`, linija 579-630):
```javascript
// Compatibility redirects: older web clients may use "/bundle" path
app.get('/builds/:buildId/bundle/', ...)
app.get('/builds/:buildId/bundle/*', ...)
```

Ali ove rute **redirectaju na `/build/`** kad `bundle/` ne postoji!

---

## 🎯 UZROK PROBLEMA

### Problem je **TROSTRUK**:

1. **Disk struktura:** Fajlovi su na disku pod `/builds/<id>/build/`
2. **API očekuje:** `getBuildDir()` vraća `.../bundle/` umjesto `.../build/`
3. **Frontend traži:** `/builds/<id>/build/` (ISPRAVNO prema disku!)

### Što se događa:

1. Frontend učita iframe: `/builds/<UUID>/build/`
2. API primi request za `/builds/<UUID>/build/`
3. API uspješno servira iz `/builds/<UUID>/build/` direktorija ✅
4. **ALI:** Mnogi drugi dijelovi API-ja generiraju URL-ove sa `/bundle/`:
   - Redirects u `public.ts`
   - Preview URLovi u `review.ts`
   - Base href injection u HTML
5. Kad aplikacija traži relativne resurse, koristi pogrešan base path

### Realni primjer toka:

```
1. User klikne "Play" → Frontend otvara iframe `/builds/ABC/build/`
2. API servira index.html iz `/builds/ABC/build/index.html` ✅
3. index.html ima `<base href="/builds/ABC/bundle/">` ← PROBLEM!
4. Kad app traži `./app.js`, browser učita `/builds/ABC/bundle/app.js`
5. API traži `/builds/ABC/bundle/app.js` → ENOENT → redirect → 404
6. App crashes → "App not found"
```

---

## ✅ RJEŠENJE: Opcija A (PREPORUČENO)

**Promijeni `getBuildDir()` da vraća pravi path `build/` umjesto `bundle/`**

### Zašto je ovo najbolje:

1. **Minimalno promjena** - samo 1 linija u `paths.ts`
2. **Pravi source of truth** - diskovi koriste `build/`
3. **API već podržava `/build/` rute** - sve je pripremljeno
4. **Frontend već koristi `/build/`** - ne treba mijenjati ništa

### Što treba promijeniti:

#### **JEDNA DATOTEKA:**

```typescript
// apps/api/src/paths.ts (linija 11)
// PRIJE:
return path.join(BUNDLE_ROOT, 'builds', id, 'bundle');

// POSLIJE:
return path.join(BUNDLE_ROOT, 'builds', id, 'build');
```

### Utjecaj promjene:

#### ✅ Što će raditi BOLJE:
- Svi API redirect-i će pokazivati na `/build/`
- Base href u HTML će biti `/builds/<id>/build/`
- Manifest fetch-evi će raditi
- Apps će se učitavati iz pravog direktorija
- Preview će raditi

#### ⚠️ Što treba PROVJERITI:
1. **Build worker** (`bundleBuildWorker.ts`) - gdje kreira fajlove
2. **Review routes** - gdje traži preview fajlove
3. **Bucket upload** - GCS putanje (ako koristiš)

#### 🔒 Što NEĆE utjecati:
- **Play mehanika** - frontend već traži `/build/`
- **Shims** - ne ovisi o ovom path-u
- **Storage/Rooms** - potpuno odvojeni sistem
- **Tokens** - auth je nezavisan
- **iFrame sandbox** - CSP i sandbox ne ovise o path-u

---

## 🔴 POTENCIJALNI RIZICI

### 1. Build Worker
**Lokacija:** `bundleBuildWorker.ts`, linija 1317

```typescript
const baseHref = `/builds/${buildId}/bundle/`;
```

**Rizik:** Worker kreira bundle i postavlja `<base href>` u HTML-u.  
**Fix:** Promijeniti u `/build/` nakon glavne promjene.

### 2. Legacy `/bundle/` compatibility
**Lokacija:** `index.ts`, linija 579-630

API ima redirect za `/bundle/` → `/build/`. Ovo će **i dalje raditi**, ali će biti zapravo nepotrebno nakon što promijenimo `getBuildDir`.

**Akcija:** Ostaviti kao fallback za postojeće buildove koji možda još imaju `/bundle/` direcotry.

### 3. Bucket (GCS) putanje
**Lokacija:** `Build.ts`, linija 647-649

```typescript
destination: `builds/${id}/bundle.tar.gz`
```

**Rizik:** Ako koristiš Google Cloud Storage, tar arhive su možda pod `/bundle.tar.gz`.  
**Fix:** Provjeriti gdje se stvarno uploadaju arhive i uskladiti.

---

## 📝 IMPLEMENTACIJSKI PLAN

### Faza 1: Mala promjena (SAFE)
1. ✅ Promijeni `apps/api/src/paths.ts` (linija 11): `bundle` → `build`
2. ✅ Promijeni `apps/api/src/workers/bundleBuildWorker.ts` (linija 1317):  
   `const baseHref = '/builds/${buildId}/build/';`
3. ✅ Build i test lokalno
4. ✅ Provjeriti da Play radi, shims rade, storage radi

### Faza 2: Deploy na server
1. ✅ Backup trenutne verzije
2. ✅ Deploy nove verzije
3. ✅ Testirati postojeće aplikacije
4. ✅ Provjeriti log za greške

### Faza 3: Verifikacija
1. ✅ Otvoriti nekoliko aplikacija kroz Play
2. ✅ Provjeriti da slike učitavaju
3. ✅ Provjeriti da manifest radi
4. ✅ Provjeriti storage/rooms sync

---

## 🆚 ALTERNATIVA: Opcija B (NE PREPORUČUJEM)

**Promijeni diskove: premjesti sve iz `build/` u `bundle/`**

### Zašto NE:
- 📁 Treba fizički premjestiti 154 build foldere na serveru
- ⏰ Dugo traje i rizično je
- 🔄 Frontend bi i dalje trebao update (jer traži `/build/`)
- 🧩 Više error surface-a - može nešto poći po zlu

---

## 📌 ZAKLJUČAK

**Preporuka:** **OPCIJA A** - promijeni samo `paths.ts`

**Razlog:** 
- Minimalna intervencija (2 linije koda)
- Usklađuje API sa stvarnim stanjem diska
- Frontend već radi ispravno
- API već podržava `/build/` rute
- Niska vjerojatnost breaking change-a

**Sigurnost:**
- Play će raditi ✅
- Shims će raditi ✅  
- Storage će raditi ✅
- Rooms će raditi ✅
- Tokens će raditi ✅
- iFrame sandbox će raditi ✅

**Jedini risk:**
- Postojeći buildovi koji možda imaju `/bundle/` directory će koristiti fallback mehanizam (koji već postoji)

---

## 🔧 DODATNI PROBLEMI

### Problem 2: Missing `/uploads/` slike

**Uzrok:** `/srv/thesara/storage/uploads` je prazan  
**Fix:** Vratiti listing slike iz backupa ili regenerirati

**To je ODVOJENI problem** od bundle/build conflict-a.

