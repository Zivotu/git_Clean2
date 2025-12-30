# Sigurnosno Ažuriranje - 30.12.2025.

## 1. Pregled
Dana 30.12.2025. implementirane su ključne sigurnosne promjene kako bi se spriječilo izvršavanje zlonamjernog koda (RCE) i napadi uskraćivanjem usluge (DoS) na build sustavu. Fokus je bio na "hardeningu" procesa instalacije paketa i ograničavanju osjetljivih ruta.

## 2. Ključne Izmjene

### A. Blokiranje izvršavanja skripti (`--ignore-scripts`)
*   **Gdje:** `apps/api/src/workers/createxBuildWorker.ts` i `apps/api/src/workers/bundleBuildWorker.ts`.
*   **Što:** Svim naredbama za instalaciju (`npm install`, `pnpm install`, `yarn`, `bun`) dodana je zastavica `--ignore-scripts`.
*   **Zašto:** Ovo sprječava automatsko izvršavanje `postinstall` skripti iz `node_modules` paketa. To je bio glavni vektor napada za kripto-rudare i malware. Čak i ako korisnik ili napadač pokuša instalirati zlonamjerni paket, njegova skripta se neće pokrenuti.

### B. Ograničenje pristupa ZIP uploadu (Admin Only)
*   **Gdje:** `apps/api/src/routes/publish-bundle.ts`.
*   **Što:** Ruta `/api/publish/bundle` sada je strogo ograničena samo na administratore.
*   **Pozicija provjere:** Provjera prava (`isAdmin`) premještena je na sam početak rute, **prije** učitavanja datoteke (`req.file()`).
*   **Zašto:**
    1.  **RCE Prevencija:** Iako smo blokirali `postinstall`, korisnici i dalje mogu definirati `build` skriptu u `package.json`. Budući da trenutno nemamo potpunu izolaciju (Docker/VM) za build proces, jedini siguran način je dopustiti upload proizvoljnog koda samo provjerenim administratorima.
    2.  **DoS Zaštita:** Odbijanjem zahtjeva prije učitavanja datoteke sprječavamo napadače da zaguše server slanjem masivnih datoteka na tu rutu.

### C. Poboljšanja stabilnosti i sigurnosti "Spawn" procesa
*   **Gdje:** `createxBuildWorker.ts`.
*   **Što:**
    *   Uklonjena je zastavica `--no-bin-links` jer je uzrokovala probleme s alatima koji ovise o `.bin` (npr. Vite, Next.js).
    *   Dodana je opcija `shell: process.platform === 'win32'`.
*   **Zašto:** Omogućava ispravan rad build alata na Linuxu bez rizika od "shell injection" napada koji su mogući kada je `shell: true` aktiviran nepotrebno.

### D. Ograničenje veličine inline koda
*   **Gdje:** `apps/api/src/routes/publish.ts`.
*   **Što:** Postavljen limit od 1MB za `inlineCode`.
*   **Zašto:** Sprječava zloupotrebu baze podataka i mrežnih resursa slanjem prevelikih komada koda.

## 3. Upute za Deployment
Za primjenu ovih promjena na VPS-u potrebno je izvršiti:

```bash
# 1. Povlačenje promjena
cd /srv/thesara/app
git pull origin main

# 2. Rebuild API-ja
npm ci
npm run build --workspace=apps/api

# 3. Restart servisa
sudo systemctl restart thesara-api
```

## 4. Napomena za budućnost
Trenutna zaštita oslanja se na povjerenje u administratore (za ZIP upload) i blokiranje skripti. Za potpunu sigurnost koja bi omogućila upload ZIP-ova od strane *bilo kojeg* korisnika, potrebno je implementirati izolirani "sandbox" (npr. Docker, Firecracker ili gVisor) u kojem bi se vrtio build proces.
