# Server Transfer & IR Sažetak
- Vrijeme: 2025-12-18 14:21 +01:00
- Lokalni workspace: C:\thesara_RollBack
- Novi remote: https://github.com/Zivotu/git_Clean2.git

## 1. Status lokalnog repozitorija
- IOC fajlovi (pps/web/{config,network,proc,utils,watcher}.js) **ne postoje**.
- scripts/ir_scan.mjs + rucni g pretražili su cijeli workspace (ukljucivo storage/ i build artefakte); jedini pogoci su u runbook/dokumentaciji.
- .git/hooks sadrži samo audited pre-commit; core.hooksPath NIJE postavljen.
- ir_local_report/ sadrži sve detaljne nalaze (IOC, hooks, dependency audit, Next runtime analiza, remediation plan, hash manifest).

## 2. Što još provjeriti (po želji)
1. pnpm run ir:report – ponovi IOC + hooks audit i generiraj svjež report.
2. pnpm install --ignore-scripts && pnpm -r run build – potvrdi da build prolazi bez dodatnih skripti.
3. Get-FileHash storage -Algorithm SHA256 -Recurse ili usporedba ir_local_report/tracked_hash_manifest.sha256 – validacija storage sadržaja prije deploya.

## 3. Kako pushati u novi cisti repo
`ash
git remote set-url origin https://github.com/Zivotu/git_Clean2.git
git push -u origin main
`
*(po potrebi kreiraj origin-old referencu prije promjene URL-a)*

## 4. Moj prijedlog za server
1. **Rebuild (cisti OS)** – zatraži reinstalaciju VPS-a, instaliraj Node 20.11.x (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -).
2. **Kloniraj novi repo** i pokreni:
   `ash
   pnpm install --ignore-scripts
   pnpm run ir:report
   pnpm --filter @thesara/web run build
   pnpm --filter @thesara/api run build
   `
3. **Provjeri storage podatke** – kopiraj uilds/, uploads/, storage/ s provjerenog backup diska i prije mountanja pokreni sha256sum -c ir_local_report/tracked_hash_manifest.sha256 (ili barem ind storage -type f | wc -l).
4. **Rotiraj sve tajne** (JWT, Stripe, Firebase, SMTP) prije pokretanja API-ja.
5. **CI/guardrails** – u CI-u i na serveru pokreci pnpm run ir:report + pnpm audit --prod prije svakog deploya.
6. **PM2/systemd** – ažuriraj unit fajlove da koriste /usr/bin/node20 i ne postavljaju dodatne NODE_OPTIONS (osim --openssl-legacy-provider za API dok je potrebno).
7. **Firewall** – UFW dopušta samo {2222,80,443}; outbound whitelist prema poznatim SaaS domenama (Stripe, Firebase, OpenAI).

## 5. Nakon deploya
- Pokreni curl -I https://thesara.space/api/health i pnpm run ir:report direktno na serveru.
- Cuvaj ir_local_report/ (ili eksportiraj u docs/IR/) za buduce reference.
- Dugorocno: razmotri object storage za build artefakte (S3/Wasabi) uz hash monitoring.

Ako treba dodatni forenzicki korak (npr. detaljan pregled storage/bundles), samo javi prioritet.
