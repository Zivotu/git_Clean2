THESARA - PRODUCTION DEPLOY (API + WEB)
======================================

What runs where
---------------
| Component | Host binding | Notes |
| --------- | ------------ | ----- |
| Next.js web (`apps/web`) | 127.0.0.1:3000 | Served through nginx, PM2 app `thesara-web` |
| Fastify API (`apps/api`) | 127.0.0.1:8788 | PM2 app `thesara-api`, serves bundles/uploads |
| nginx (`thesara.space`) | 443/80         | Fronts both services and static storage passthrough |

Standard nginx config
---------------------

````nginx
# =========================
# HTTPS vhost: thesara.space (WEB)
# =========================
server {
  listen 443 ssl http2;
  server_name thesara.space;

  # TLS
  ssl_certificate     /etc/letsencrypt/live/thesara.space/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/thesara.space/privkey.pem;
  include             /etc/letsencrypt/options-ssl-nginx.conf;

  # 1) Next.js route handler - stays on WEB (not API)
  location = /api/jwt {
    proxy_pass http://127.0.0.1:3000/api/jwt;
    proxy_http_version 1.1;
    proxy_set_header Host              thesara.space;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }

  # 2) All other /api/ -> API vhost (or 127.0.0.1:8788 if co-hosted)
  location ^~ /api/ {
    proxy_pass https://api.thesara.space; # or http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host              api.thesara.space; # preserve vhost
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
    proxy_connect_timeout 15s;
    client_max_body_size 50m;
  }

  # 3) Runtime mini-apps & bundles - API 8788
  location ^~ /play/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1; proxy_set_header Connection "";
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
  }

  location ^~ /builds/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1; proxy_set_header Connection "";
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
    # If upstream does not set it, uncomment the next line:
    # add_header Cross-Origin-Resource-Policy "cross-origin" always;
    expires 7d; access_log off;
  }

  location ^~ /uploads/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1; proxy_set_header Connection "";
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
    expires 7d; access_log off;
  }

  location ^~ /previews/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1; proxy_set_header Connection "";
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
    expires 7d; access_log off;
  }

  # 4) Next.js frontend (everything else)
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_cache_bypass          $http_upgrade;
  }

  # Optional: longer cache for static via Next
  location ~* \.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)$ {
    proxy_pass http://127.0.0.1:3000;
    expires 30d;
    access_log off;
  }
}

# HTTP -> HTTPS redirect
server {
  listen 80;
  server_name thesara.space;
  location ^~ /.well-known/acme-challenge/ { root /var/www/html; }
  return 301 https://$host$request_uri;
}
````

Keep `/play`, `/builds`, `/uploads`, and `/previews` on the web origin so the player can fetch assets without CORP errors. `/api/jwt` must terminate on port 3000 because it is implemented in Next.

Routing updates inside Next.js
------------------------------
- `/api/listing?slug=` redirect lives in `apps/web/app/api/listing/route.ts` and normalises to `/api/listing/<slug>`.
- `/play?appId=` redirect lives in `apps/web/app/play/(legacy)/route.ts` and normalises to `/play/<appId>/`.
- Canonical play page is `apps/web/app/play/[appId]/page.tsx`; it consumes props from `ClientPlayPage`.
- Use `playHref` from `apps/web/lib/urls.ts` for every CTA. Example: `playHref(item.id, { run: 1 })` and `prefetch={false}` on `<Link>`.
- Listing details render publicly only when `item.status === "published"`; owners/admins see unpublished banners.

PM2 build gotchas
-----------------
- `Cannot find module .../apps/api/dist/server.cjs` -> run `pnpm -C apps/api build` and confirm the PM2 script path.
- Play 404s -> check legacy redirects exist, nginx proxy targets `/play/` and `/builds/`, and UI calls `playHref` (no query-only links, prefetch disabled).
- Listing detail 404 -> ensure clients call `/api/listing/<slug>` and the redirect handler is present in the deployed web build.

Admin review API snippets
-------------------------

````bash
# Fresh admin token (web route handler)
TOK=$(curl -s http://127.0.0.1:3000/api/jwt -X POST \
  -H 'content-type: application/json' -d '{"userId":"debug","role":"admin"}' | jq -r .token)

# Approve
ID=<BUILD_ID>
curl -i -X POST https://api.thesara.space/review/approve/$ID \
  -H "Authorization: Bearer $TOK"

# Reject with reason
curl -i -X POST https://api.thesara.space/review/reject/$ID \
  -H "Authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"reason":"manual test"}'

# Filter review queue
curl -s 'https://api.thesara.space/review/builds?status=approved' \
  -H "Authorization: Bearer $TOK" | jq '.items | length'
````

Smoke tests (post deploy)
-------------------------

````bash
# 1) Listing detail (published -> 200 JSON)
curl -s https://thesara.space/api/listing/image-compressor | jq '.item | {slug,status,title}'

# 2) Legacy listing endpoint redirects (307)
curl -I -s 'https://thesara.space/api/listing?slug=image-compressor' | grep -i '307\|location'

# 3) Play legacy redirect (308)
curl -I -s 'https://thesara.space/play?appId=4' | grep -i '308\|location'

# 4) Canonical play (200 HTML)
curl -I -s 'https://thesara.space/play/4/' | grep -i '200\|content-type'

# 5) Bundle HTML + first JS asset (200)
BID=$(curl -s https://thesara.space/api/listing/image-compressor | jq -r '.item.buildId')
curl -I -s "https://thesara.space/builds/$BID/bundle/" | grep -i '200\|content-type'
curl -I -s "https://thesara.space/builds/$BID/bundle/inline-*.js" | head -n1
````

Troubleshooting quick list
--------------------------
- nginx 404 on `/api/jwt` -> confirm exact `location = /api/jwt` block and reload nginx.
- Review endpoints 401 -> refresh token with the snippet above; both apps must share `JWT_SECRET`.
- Player fails to boot -> ensure `/play/` and `/builds/` proxy to port 8788 and response includes assets under `/builds/<id>/`.
- API not starting -> rebuild (`pnpm -C apps/api build`), then `pm2 restart thesara-api --update-env`.
