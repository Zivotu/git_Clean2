# Redesign Server Deploy Instructions

This document explains the current state of the Thesara redesign (storage + rooms)
stack, what components are expected to run in production, and the concrete steps
needed to deploy the system on a fresh VPS. Treat it as an end-to-end guide: follow
the environment notes, copy the configuration, then work through the deployment and
smoke-test checklists.

---

## 1. Components & Runtime Overview

- **API service** (`apps/api`, Fastify 5, Node 20)
  - Exposes REST/SSE endpoints for publishing, reviewing, storage access, rooms, etc.
  - Serves static bundles under `/builds/:id/build/*` and review previews under
    `/review/builds/:id/`.
  - Publishes builds to the filesystem (local driver) and runs the BullMQ worker for
    Createx build jobs.

- **Web service** (`apps/web`, Next.js 15)
  - Hosts the creator UI (publish flow, dashboards, play pages).
  - Proxies API calls through Next rewrites; in production it talks to the API via
    `INTERNAL_API_URL=http://127.0.0.1:8788/api`.

- **Storage layout** (filesystem backed)
  - `/srv/thesara/storage/bundles` – bundles produced by publish pipeline and worker.
  - `/srv/thesara/storage/previews` – review artifacts when preview access is enabled.
  - `/srv/thesara/storage/uploads` – uploaded assets served directly via nginx alias.

- **Reverse proxy** (`nginx`)
  - Terminates HTTPS and routes `/api`, `/play`, `/builds`, `/public/builds`,
    `/review/builds` to the API service.
  - Serves `/uploads/` directly from the filesystem.
  - Proxies all other requests to the Next.js service on port 3000.

- **Process manager** (`pm2`)
  - `thesara-api`: runs compiled API with `dotenv/config` so `.env` values apply.
  - `thesara-web`: runs Next.js server via `pnpm start`.

---

## 2. Prerequisites on the Server

1. **OS & packages**
   - Ubuntu 22.04+ with nginx, Node.js 20.x, pnpm 9.x (or latest compatible).
   - Install build essentials (git, build tools) for native dependencies (argon2).

2. **Node & pnpm**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   npm install -g pnpm
   ```

3. **Directory layout**
```
/srv/thesara/app        # repo clone
/srv/thesara/storage/   # persistent bundles, previews, uploads
```
Ensure the storage directories exist and are writable by the user running pm2:
```bash
sudo mkdir -p /srv/thesara/storage/{bundles,previews,uploads}
sudo chown -R deploy:deploy /srv/thesara/storage
```
If you are using a different deploy account, substitute that user/group. To repair
permissions later, rerun `sudo chown -R <user>:<group> /srv/thesara/storage /srv/thesara/app`.

4. **SSL certificates**
- Use Let’s Encrypt (certbot) to issue `thesara.space` certificates.
- Place them under `/etc/letsencrypt/live/thesara.space/`.

5. **SSL auto-renewal**
Set up automated renewal so certbot refreshes certificates without manual steps.
Sample systemd timer (recommended) or cron job:

_Systemd timer (preferred):_
```bash
sudo tee /etc/systemd/system/certbot-renew.service <<'EOF'
[Unit]
Description=Certbot Renewal
Documentation=https://eff.org/letsencrypt

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
EOF

sudo tee /etc/systemd/system/certbot-renew.timer <<'EOF'
[Unit]
Description=Twice daily Certbot renewal check

[Timer]
OnCalendar=*-*-* 00,12:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renew.timer
```

_Cron alternative (if timers unavailable):_
```bash
sudo crontab -e
# Add:
0 3 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

---

## 3. Environment Configuration

### 3.1 API (`/srv/thesara/app/apps/api/.env`)

Key values (mirror local working setup):

```env
NODE_ENV=production
PORT=8788
BUNDLE_STORAGE_PATH=/srv/thesara/storage/bundles
PREVIEW_STORAGE_PATH=/srv/thesara/storage/previews
STORAGE_DRIVER=local
STORAGE_BACKEND=local
ALLOW_REVIEW_PREVIEW=true

ROOMS_ENABLED=true
ROOMS_V1__JWT_SECRET=<long random secret>
ROOMS_V1__JWT_ISSUER=thesara-api
ROOMS_V1__JWT_AUDIENCE=rooms

CREATEX_WORKER_ENABLED=true
JWT_SECRET=<prod secret>        # already provisioned
WEB_BASE=https://thesara.space
THESARA_PUBLIC_BASE=https://thesara.space
```

Other values (Stripe, Firestore, etc.) carry over from the existing production file.
`DOTENV_CONFIG_PATH` points to this file inside the PM2 config so the build worker
and API share the same environment.

### 3.2 Web (`/srv/thesara/app/apps/web/.env.production`)

```env
NODE_ENV=production
PORT=3000
INTERNAL_API_URL=http://127.0.0.1:8788/api
NEXT_PUBLIC_API_BASE_URL=https://thesara.space/api
NEXT_PUBLIC_API_URL=https://thesara.space/api
NEXT_PUBLIC_APPS_HOST=https://thesara.space
```

These ensure SSR and browser code both hit the API through nginx while local
inter-service calls use the loopback port.

### 3.3 Secret management & storage

- **Source of truth**: keep production secrets in `/srv/thesara/CREDS/` (root-owned,
  `chmod 600`) and symlink or template them into `.env` files during deployment.
  Example:
  ```bash
  sudo mkdir -p /srv/thesara/CREDS
  sudo chown root:root /srv/thesara/CREDS
  sudo chmod 700 /srv/thesara/CREDS
  sudo tee /srv/thesara/CREDS/api.env > /dev/null
  sudo chmod 600 /srv/thesara/CREDS/api.env
  ln -sf /srv/thesara/CREDS/api.env /srv/thesara/app/apps/api/.env
  ```
- **Secrets to provision**:
  - `JWT_SECRET`, `ROOMS_V1__JWT_SECRET`: generate with `openssl rand -hex 64`.
  - Stripe keys, Firebase credentials, any third-party API keys.
  - Google service account JSON: store under `/srv/thesara/CREDS/keys/` with
    restrictive permissions and reference the path in `.env`.
- **Version control policy**: `.env`, `.env.production`, and secret files stay out of git.
  Commit only sanitized templates (e.g., `apps/api/.env.example`) for reference.
- **Rotation**: when rotating a secret, update the secret file, redeploy (`pm2 restart …`)
  and record the change (date + reason) in an ops log or password manager entry.

---

## 4. Nginx Configuration

Install config at `/etc/nginx/sites-available/thesara` (symlink to `sites-enabled`).
Key sections:

- Redirect `http` → `https`.
- Proxy `/api/` to `http://localhost:8788/api/` with upgrade headers for websockets/SSE.
- Proxy `/play/`, `/builds/`, `/public/builds/`, `/review/builds/` to the API
  (port 8788) so Fastify can serve bundles and previews.
- Serve `/uploads/` via `alias /srv/thesara/storage/uploads/`.
- Proxy `/` (everything else) to `http://localhost:3000`.

An example configuration lives in `deploy/nginx/thesara.space.example`. Copy it to the
server and adjust `server_name`, certificate paths, and upstream hostnames if the
infrastructure changes.

Reload nginx after changes:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Deploy Steps

1. **Pull latest code / copy changes**
   ```bash
   cd /srv/thesara/app
   git pull
   pnpm install
   ```

2. **Build API + Web artifacts**
   ```bash
   pnpm -F @thesara/api build   # produces dist/server.cjs
   pnpm -F @thesara/web build   # regenerates .next
   ```

3. **Restart services (pick up new env + builds)**
   ```bash
   pm2 restart thesara-api --update-env
   pm2 restart thesara-web
   ```

4. **Verify logs**
   ```bash
   pm2 logs thesara-api --lines 100
   pm2 logs thesara-web --lines 50
   ```
   Confirm createx worker started (`Queue initialized`, `Processing build job`).

---

## 6. Post-Deploy Smoke Tests

1. **Health checks**
   ```bash
   curl -I https://thesara.space/api/health
   curl -I http://127.0.0.1:8788/health
   ```

2. **Publish flow**
   - Publish a sample mini app via the web UI.
   - Observe SSE at `https://thesara.space/api/build/<buildId>/events` – should emit
     `queued → bundling → success` with `final` payload.
  - Confirm Play loads the new build (`/play/<listingId>?run=1`) and the iframe source
    points to `/builds/<buildId>/build/index.html`.
  - U DevTools → Network provjeri da završni `/builds/.../build` zahtjev i dalje sadrži `?token=` parametar.

3. **Rooms & storage smoke test**
   - Create a room via UI; join from another browser window.
   - Interact with storage-backed features (ensure data persists across reloads).

4. **Review preview**
   - Visit `/review/builds/<buildId>/` as an authenticated admin and check assets load.

5. **Static assets**
   - Make sure `/uploads/...` files serve with `200` and `Cache-Control: immutable`.

---

## 7. Troubleshooting Notes

- If builds stall at 0 % or 80 %, ensure:
  - PM2 environment exposes `CREATEX_WORKER_ENABLED=true`.
  - `apps/api/src/routes/buildEvents.ts` and `/publish.ts` updates are deployed (SSE fix).
  - File permissions on `/srv/thesara/storage/bundles` allow the API user to write.
- Ako storage pozivi i dalje vraćaju 401 nakon deploya, provjeri da svi redirecti (`/play/:id`, `/builds/:id/bundle/*`, `/builds/:id/build/`) zadržavaju `?token=` u odredišnom URL-u.

- For 404s on `/builds/:id/build/*`:
  - Check nginx proxy paths – they must forward to the API, not serve static files.
  - Confirm bundle directory exists under `BUNDLE_STORAGE_PATH`.

- For storage/rooms failures:
  - Verify JWT secrets and env flags in `.env`.
  - Confirm Next.js env exposes `NEXT_PUBLIC_APPS_HOST` pointing to the public origin.
  - Podrazumijevano su submitovi dopušteni; dodaj `data-thesara-prevent-submit="true"` na `<form>` ako želiš da ih shim blokira.

---

## 8. Maintenance Commands

```bash
# PM2
pm2 status
pm2 restart thesara-api --update-env
pm2 restart thesara-web
pm2 logs thesara-api --lines 200

# Rebuild only API or web
pnpm -F @thesara/api build
pnpm -F @thesara/web build

# Diagnostics
curl -I http://127.0.0.1:8788/review/builds/<buildId>/
curl -I https://thesara.space/builds/<buildId>/build/index.html
```

---

## 9. Backups, log rotation & storage monitoring

- **Data to back up**
  - `/srv/thesara/storage/bundles` (published artifacts).
- `/srv/thesara/storage/previews` (optional; can be regenerated).
- `/srv/thesara/storage/uploads` (user-generated content).
- SQLite/Prisma database file (if using the default `storage/data.db`).
- Secret files under `/srv/thesara/CREDS/`.

  Example rsync job (run from a privileged cron/systemd unit):
  ```bash
  rsync -az --delete /srv/thesara/storage/ backup@backup-host:/backups/thesara/storage/
  rsync -az /srv/thesara/CREDS/ backup@backup-host:/backups/thesara/CREDS/
  ```

- **Log rotation**
  - PM2 stores logs under `~/.pm2/logs`. Install logrotate rules so they don’t grow
    unbounded:
    ```bash
    sudo tee /etc/logrotate.d/pm2-thesara <<'EOF'
    /home/deploy/.pm2/logs/*.log {
      daily
      rotate 14
      compress
      missingok
      notifempty
      copytruncate
    }
    EOF
    ```
    Adjust username/path if the deploy account differs.

- **Storage monitoring**
  - Set up a simple cron to alert when storage exceeds a threshold, e.g.:
    ```bash
    0 7 * * * df -h /srv/thesara/storage | awk 'NR==2 {if ($5+0 > 80) system("echo Thesara storage >80% | mail -s \"Storage warning\" ops@example.com")}'
    ```
  - Periodically prune old preview folders to reclaim space.

---

Keep this document updated after each major change (new env flags, infrastructure
alterations, etc.) so future deploys remain repeatable.
