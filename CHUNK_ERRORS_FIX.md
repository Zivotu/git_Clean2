# Rješavanje Next.js Chunk Loading Errors

## Problem

Greška koja se pojavljuje:
```
GET https://thesara.space/_next/static/chunks/app/ambassador/page-525b7e172100721b.js 
net::ERR_ABORTED 400 (Bad Request)

Refused to execute script because its MIME type ('text/html') is not executable
```

## Uzrok

Ova greška se događa kada:
1. **Deployujete novu verziju** web aplikacije
2. **Browser ima cache-iranu HTML stranicu** koja referencira stare chunk datoteke
3. **Server nema te stare chunk-ove** jer su zamijenjeni novim (sa novim hashevima)
4. Server vraća **404 error stranicu (HTML)** umjesto JavaScript datoteke

## Rješenja

### 1. Trenutno rješenje (za testiranje)

**Hard refresh u browseru:**
- **Chrome/Edge**: `Ctrl + Shift + R` ili `Ctrl + F5`
- **Firefox**: `Ctrl + Shift + R`

### 2. Trajno rješenje - Nginx konfiguracija

Kopirajte `nginx-thesara.conf` u `/etc/nginx/sites-available/thesara`:

```bash
# Na serveru
sudo cp /srv/thesara/app/nginx-thesara.conf /etc/nginx/sites-available/thesara

# Testirajte konfiguraciju
sudo nginx -t

# Ako je OK, reload nginx
sudo systemctl reload nginx
```

**Ključne promjene u nginx konfiguraciji:**

1. **Next.js static chunks** (`/_next/static/`) - cache 1 godinu (immutable)
2. **HTML stranice** (`/`) - **NE cache-iraju se** (no-cache)
3. **Next.js data files** (`/_next/data/`) - cache 1 sat

Ovo osigurava da:
- ✅ JavaScript chunks se cache-iraju (brže učitavanje)
- ✅ HTML stranice se uvijek učitavaju svježe (sa novim referencama na chunks)
- ✅ Nakon deploya, browser će dobiti novu HTML stranicu sa ispravnim chunk hashevima

### 3. Poboljšani deployment script

Koristite `deploy-server.sh` umjesto starog:

```bash
# Na serveru, napravite executable
chmod +x /srv/thesara/app/deploy-server.sh

# Pokrenite deployment
cd /srv/thesara/app
./deploy-server.sh
```

**Ključne izmjene:**
- ✅ Briše `.next` folder prije build-a (sprječava konflikte)
- ✅ Postavlja production environment varijable
- ✅ Čeka da se servisi stabiliziraju
- ✅ Provjerava health endpoints

## Workflow za deployment

### Lokalno (Windows)

```powershell
# 1. Commitajte promjene
git add .
git commit -m "Vaša poruka"

# 2. Push na main
git push origin main
```

### Na serveru (Linux)

```bash
# 3. SSH na server
ssh your-user@thesara.space

# 4. Pokrenite deployment
cd /srv/thesara/app
./deploy-server.sh
```

### Nakon deploya

1. **Pričekajte 5-10 sekundi** da se servisi restartaju
2. **Hard refresh** u browseru: `Ctrl + Shift + R`
3. Provjerite konzolu - ne bi trebalo biti grešaka

## Dodatne provjere

### Provjerite PM2 status

```bash
pm2 status
pm2 logs thesara-web --lines 50
pm2 logs thesara-api --lines 50
```

### Provjerite nginx

```bash
# Test konfiguracije
sudo nginx -t

# Reload ako je potrebno
sudo systemctl reload nginx

# Status
sudo systemctl status nginx
```

### Provjerite build

```bash
# Provjerite da .next folder postoji
ls -la /srv/thesara/app/apps/web/.next

# Provjerite static chunks
ls -la /srv/thesara/app/apps/web/.next/static/chunks/
```

## Troubleshooting

### Problem: I dalje vidim chunk errors

**Rješenje:**
1. Očistite browser cache potpuno (Settings → Privacy → Clear browsing data)
2. Otvorite incognito/private window
3. Provjerite da li nginx koristi novu konfiguraciju: `sudo nginx -t`

### Problem: 502 Bad Gateway

**Rješenje:**
```bash
# Provjerite da li Next.js radi
pm2 logs thesara-web --lines 100

# Restart ako je potrebno
pm2 restart thesara-web
```

### Problem: Stari chunks se i dalje učitavaju

**Rješenje:**
```bash
# Očistite nginx cache (ako postoji)
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx

# Rebuild web aplikacije
cd /srv/thesara/app/apps/web
rm -rf .next
pnpm build
pm2 restart thesara-web
```

## Prevencija u budućnosti

1. **Uvijek koristite deployment script** - automatski čisti stare build-ove
2. **Provjerite nginx konfiguraciju** - osigurava pravilno cache-iranje
3. **Hard refresh nakon deploya** - osigurava da dobivate najnoviju verziju
4. **Monitorirajte PM2 logs** - rano otkrivanje problema

## Dodatne informacije

- **Nginx config**: `/etc/nginx/sites-available/thesara`
- **PM2 config**: `/srv/thesara/app/ecosystem.config.cjs`
- **Web build**: `/srv/thesara/app/apps/web/.next`
- **Logs**: `pm2 logs` ili `/root/.pm2/logs/`
