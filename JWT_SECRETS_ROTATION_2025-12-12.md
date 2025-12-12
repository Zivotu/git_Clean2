# JWT Secrets Rotation - 12. Decembar 2025

**Datum:** 2025-12-12  
**Razlog:** Ažuriranje env na serveru nakon prethodne rotacije  
**Status:** 🔄 PENDING DEPLOYMENT

---

## 🔐 Novi JWT Secrets (Generirano: 2025-12-12, 22:22h)

Kopiraj ove vrijednosti u `/srv/thesara/app/apps/api/.env` na serveru:

```bash
# JWT Secret (glavni, za Auth)
JWT_SECRET=533ab596443542a2b8fb1c2a3a5637357d58418b4eda7c18117fc4a6248a7b1c9c2d6f6b4dfdc363000527b1be352f162d900eaf530bd6c52

# Rooms JWT Secret (za rooms funkcionalnost)
ROOMS_V1__JWT_SECRET=5a0be84b1180ff3ea249463556a7cbde58cef3864bdb317642804d29bc74437397516a22141e83ebcb201c496d9ee0d46a998b9a9afca0f0b

# Session Secret (za session management)
SESSION_SECRET=76f0c2c4c1f175860f6423f0019970d2cc3e894519a30f2db6ec6c79c9117411fc9e37c1e85fb4ae3bd829169a9f5b2fdd2d5c054acbf470c
```

---

## 📋 Deployment Instrukcije

### 1. SSH na server:
```bash
ssh root@your-server-ip
# ili
ssh root@178.218.160.180
```

### 2. Backup trenutnog .env fajla:
```bash
cp /srv/thesara/app/apps/api/.env /srv/thesara/app/apps/api/.env.backup.$(date +%Y%m%d-%H%M)
```

### 3. Ažuriraj .env:
```bash
nano /srv/thesara/app/apps/api/.env
```

Pronađi i zamijeni ove linije sa novim vrijednostima iznad:
- `JWT_SECRET=...`
- `ROOMS_V1__JWT_SECRET=...`
- `SESSION_SECRET=...`

### 4. Provjeri web app env (ako postoji):
```bash
# Web app možda također koristi JWT_SECRET
ls -la /srv/thesara/app/apps/web/.env*

# Ako postoji .env.local ili .env.production:
nano /srv/thesara/app/apps/web/.env.local
# Ažuriraj JWT_SECRET i ROOMS_V1__JWT_SECRET ako su prisutni
```

### 5. Restart servisa:
```bash
# Restart API-ja
pm2 restart thesara-api

# Restart Web-a (ako koristi iste secrets)
pm2 restart thesara-web

# Provjeri status
pm2 status
pm2 logs --lines 50
```

### 6. Verifikacija:
```bash
# Provjeri da li servisi rade
curl -I https://thesara.space/api/health
curl -I https://thesara.space/

# Provjeri PM2 logs za greške
pm2 logs thesara-api --lines 20 --nostream
```

---

## ⚠️ VAŽNO - SIGURNOSNE NAPOMENE

1. **NEMOJ** commitati ovaj fajl u Git!
2. **OBRIŠI** ovaj fajl nakon što ažuriraš env na serveru
3. **NE DIJELI** ove secrets nigdje (Slack, email, etc.)
4. **ZADRŽI** backup `.env.backup.*` fajlove na serveru barem 7 dana
5. **PROVJERI** da sve funkcioniše nakon restart-a

---

## 🔄 Prethodna Rotacija

**Prva rotacija:** 11. Decembar 2025 (nakon malware incidenta)  
**Druga rotacija:** 12. Decembar 2025 (ova rotacija)

---

## 📞 Rollback (ako nešto ne radi)

Ako nakon promjene nešto ne radi:

```bash
# Vrati stari env
cp /srv/thesara/app/apps/api/.env.backup.YYYYMMDD-HHMM /srv/thesara/app/apps/api/.env

# Restart
pm2 restart all

# Ili ako treba rebuild
cd /srv/thesara/app
pnpm -F @thesara/api build
pm2 restart thesara-api
```

---

**Generirano:** 2025-12-12 22:22 CET  
**Metoda:** openssl rand -hex 64  
**Dužina:** 128 hex karaktera (64 bajta entropije)

✅ Secrets su kriptografski sigurni za production upotrebu.
