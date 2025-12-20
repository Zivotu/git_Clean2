# Thesara - Checklist Foldera Za Deployment

Ovaj dokument sadrži kompletan popis foldera koji moraju postojati na serveru kada se deploya Thesara projekt online.

## 📁 Obvezni Runtime Storage Folderi

Kada se aplikacija deploya na produkciju (obično `/srv/thesara/`), sljedeći runtime folderi **MORAJU** postojati:

### 1. `/srv/thesara/storage/` - Glavni Storage Folder

Ovaj folder sadrži sve runtime podatke koje aplikacija generira. **Ovo je ključni folder koji debe biti u backup-u!**

#### Podfolderi:

```
/srv/thesara/storage/
├── bundles/              # Objavljene mini-aplikacije (bundled builds)
├── previews/             # Preview slike aplikacija
├── uploads/              # User upload datoteke (slike, dokumenti)
├── cdn-cache/            # CDN cache za NPM pakete
├── kv/                   # Key-value storage za localStorage API
├── data.db              # SQLite baza (ako se koristi lokalni DB)
└── pin-sessions.json    # Admin PIN session tracking
```

### 2. `/srv/thesara/storage/bundles/` - Aplikacije

**Ovo je folder gdje se spremaju objavljene mini-aplikacije!**

- Svaka objavljena aplikacija ima svoj podfolder: `/srv/thesara/storage/bundles/<buildId>/`
- Jedan listing može imati više buildova (verzija)
- Struktura pojedine aplikacije:
  ```
  bundles/<buildId>/
  ├── bundle/
  │   ├── index.html       # Entry point aplikacije
  │   ├── app.js           # Bundled JavaScript (IIFE)
  │   └── manifest_v1.json # Metadata (permissions, network policy)
  └── build/               # Source files korišteni za build
      ├── package.json
      ├── node_modules/
      └── _app_entry.tsx
  ```

**Dodatno:**
```
bundles/listing-locks/     # Cached lock fileovi za brže rebuild-ove
└── <listingId>/
    └── package-lock.json
```

### 3. `/srv/thesara/storage/previews/` - Preview Slike

Folder sa slikama (thumbnails) aplikacija koje se prikazuju na marketplace-u:

```
previews/
├── <listingId>-preview.png
├── <listingId>-preview.jpg
└── ...
```

### 4. `/srv/thesara/storage/uploads/` - User Uploads

Sve datoteke koje korisnici uploadaju (ako se koristi lokalni storage driver):

```
uploads/
├── avatars/
├── app-assets/
└── ...
```

### 5. `/srv/thesara/storage/kv/` - Key-Value Storage

Storage za localStorage/sessionStorage bridge:

```
kv/
├── app-<appId>-default.json         # Default namespace za app
├── app-<appId>-room-<code>.json     # Room namespace
└── user-<userId>-<namespace>.json   # User-specific storage
```

### 6. `/srv/thesara/storage/cdn-cache/` - CDN Cache

Cache za NPM pakete koji se downloadaju sa esm.sh ili drugih CDN-ova:

```
cdn-cache/
├── react@18.2.0.js
├── react-dom@18.2.0.js
└── ...
```

## 📄 Ostali Važni Folderi i Datoteke

### Projekt Source Code

```
/srv/thesara/
├── apps/
│   ├── api/              # Backend API (Fastify)
│   │   ├── dist/         # Compiled JavaScript
│   │   ├── src/          # TypeScript source
│   │   ├── package.json
│   │   └── .env          # Environment variables (VAŽNO!)
│   └── web/              # Frontend (Next.js)
│       ├── .next/        # Next.js build output
│       ├── app/
│       ├── components/
│       ├── public/
│       ├── package.json
│       └── .env.production.local  # ENV za Next.js
├── packages/             # Shared packages (SDK, types)
├── storage/              # Runtime storage (vidi gore)
├── node_modules/         # Root dependencies
├── package.json          # Root package.json (workspace)
└── pnpm-lock.yaml        # Lockfile
```

### Konfiguracijske Datoteke

```
/srv/thesara/
├── ecosystem.config.cjs   # PM2 config za procese
├── nginx-thesara.conf     # Nginx config (može biti i u /etc/nginx/)
├── deploy-server.sh       # Deployment skripta
└── .env                   # Root .env (rijetko se koristi)
```

## 🔑 Tajne i Ključevi (NE U GIT-u!)

```
/srv/thesara/apps/api/
├── .env                           # Glavni API environment
├── keys/
│   └── createx-e0ccc-*.json      # Firebase service account key
└── firebase-service-account.json  # Alternativna lokacija
```

## ⚠️ Što OBAVEZNO Mora Biti Na Serveru (a možda nedostaje nakon backup/restore)

### 1. **Storage folder struktura**
Ako si radio backup pa restore, moraš provjeriti da postoje **svi runtime folderi**:

```bash
# Provjeri na serveru:
ls -la /srv/thesara/storage/

# Trebao bi vidjeti:
# - bundles/
# - previews/
# - uploads/
# - kv/
# - cdn-cache/
```

**Ako nedostaje `bundles/` ili `previews/`** - to su **APLIKACIJE I SLIKE APLIKACIJA** koje spominješ!

### 2. **Bundles folder**
```bash
# Provjeri ima li bundlanih aplikacija:
ls -la /srv/thesara/storage/bundles/

# Svaki broj/ID je jedna app verzija
```

### 3. **Previews folder**
```bash
# Provjeri ima li preview slika:
ls -la /srv/thesara/storage/previews/

# Trebao bi vidjeti PNG/JPG datoteke
```

### 4. **Environment fajlovi**
```bash
# API .env
ls -la /srv/thesara/apps/api/.env

# Web .env
ls -la /srv/thesara/apps/web/.env.production.local
```

### 5. **Build outputi**
```bash
# API dist/
ls -la /srv/thesara/apps/api/dist/

# Next.js .next/
ls -la /srv/thesara/apps/web/.next/
```

## 🚀 Kreiranje Nedostajućih Foldera

Ako ti folderi nedostaju, možeš ih kreirati:

```bash
# Osnovni storage folderi
mkdir -p /srv/thesara/storage/{bundles,previews,uploads,kv,cdn-cache}
mkdir -p /srv/thesara/storage/bundles/listing-locks

# Dodaj .gitkeep da Git prati prazne foldere
touch /srv/thesara/storage/{bundles,previews,uploads,kv,cdn-cache}/.gitkeep

# Postavi permissions (za API proces)
chown -R thesara:thesara /srv/thesara/storage
chmod -R 755 /srv/thesara/storage
```

## 📋 Quick Checklist Za Deployment

- [ ] `/srv/thesara/storage/bundles/` - **APLIKACIJE**
- [ ] `/srv/thesara/storage/previews/` - **SLIKE APLIKACIJA**
- [ ] `/srv/thesara/storage/uploads/` - User uploads
- [ ] `/srv/thesara/storage/kv/` - localStorage API storage
- [ ] `/srv/thesara/storage/cdn-cache/` - NPM package cache
- [ ] `/srv/thesara/apps/api/.env` - API environment variables
- [ ] `/srv/thesara/apps/web/.env.production.local` - Web env
- [ ] `/srv/thesara/apps/api/keys/` - Firebase credentials
- [ ] `/srv/thesara/apps/api/dist/` - Compiled API code
- [ ] `/srv/thesara/apps/web/.next/` - Next.js build
- [ ] `/srv/thesara/node_modules/` - Root dependencies
- [ ] `/srv/thesara/ecosystem.config.cjs` - PM2 config

## 💾 Backup Savjet

**Što mora biti u backup-u:**
1. ✅ `/srv/thesara/storage/` - **SVE RUNTIME PODATKE**
2. ✅ `/srv/thesara/apps/api/.env` - **KONFIGURACIJA**
3. ✅ `/srv/thesara/apps/web/.env.production.local`
4. ✅ `/srv/thesara/apps/api/keys/` - **TAJNE**
5. ✅ Firebase/Firestore podaci (ako se koristi)

**Što NE mora biti u backup-u (može se regenerirati):**
- ❌ `node_modules/` - instalira se sa `pnpm install`
- ❌ `dist/` - generira se sa build procesom
- ❌ `.next/` - generira se sa `next build`
- ❌ `cdn-cache/` - može se ponovo skinuti

## 🔍 Dijagnostika - Provjera Što Nedostaje

```bash
# SSH na server
ssh thesara@tvoj-server.com

# Provjeri strukturu
cd /srv/thesara
tree -L 2 storage/

# Broji koliko ima aplikacija
ls storage/bundles/ | wc -l

# Broji koliko ima preview slika
ls storage/previews/ | wc -l

# Provjeri veličinu storage foldera
du -sh storage/

# Provjeri environment
cat apps/api/.env | grep BUNDLE_STORAGE_PATH
cat apps/api/.env | grep PREVIEW_STORAGE_PATH
```

## 📝 Napomena

Na **lokalnom dev okruženju**, putanje su:
- `BUNDLE_STORAGE_PATH` → `<repo>/storage/bundles`
- `PREVIEW_STORAGE_PATH` → `<repo>/review/builds` (dev) ili `<repo>/storage/previews`
- `LOCAL_STORAGE_DIR` → `<repo>/storage/uploads`

Na **produkcijskom serveru**, putanje su (default):
- `BUNDLE_STORAGE_PATH` → `/srv/thesara/storage/bundles`
- `PREVIEW_STORAGE_PATH` → `/srv/thesara/storage/previews`
- `LOCAL_STORAGE_DIR` → `/srv/thesara/storage/uploads`

Provjeravaj `.env` datoteke da vidiš koje putanje koristi tvoj deployment!
