# Thesara - Deploy Instructions

> Practical checklist for shipping web (Next.js) and API (Fastify) without breaking routing again.

---

## Fast Path Deploy (WEB + API on same host)

```
cd /srv/thesara/app
git pull --ff-only
pnpm install --frozen-lockfile
pnpm -C apps/api build
pnpm -C apps/web build
pm2 restart thesara-api --update-env
pm2 restart thesara-web --update-env
```

Keep `.env.production` files in place for both apps and make sure PM2 points API at `apps/api/dist/server.cjs`.

---

## Standard nginx config (thesara.space)

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

Keeping `/play`, `/builds`, `/uploads`, and `/previews` on the same origin stops CORP issues in the player; `/api/jwt` must stay on web because it is a Next route handler.

---

## Next.js URL Normalisation

- `/api/listing/<slug>` is canonical; `/api/listing?slug=` is handled by `apps/web/app/api/listing/route.ts` returning a 307 redirect.
- `/play/<appId>/` is canonical; `apps/web/app/play/(legacy)/route.ts` issues a 308 redirect from query-only links.
- The canonical page lives in `apps/web/app/play/[appId]/page.tsx` and defers to `ClientPlayPage`.
- Listing details should show publicly only when `item.status === "published"`; owners and admins may see draft banners.

### Shared helper

`apps/web/lib/urls.ts` exports `playHref(appId, params?)` so every CTA generates the same path-style link. Use it in client components and disable `prefetch` on Next `Link` to avoid RSC churn.

```
import { playHref } from '@/lib/urls';
<Link href={playHref(item.id, { run: 1 })} prefetch={false}>Play</Link>
```

---

## Admin Review API snippets

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

---

## Smoke tests (post-deploy)

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

---

## Troubleshooting

- **Play 404 or assets blocked**: confirm legacy Next redirects are deployed, nginx proxies `/play/` and `/builds/` to 8788, and CTAs use `playHref` without query-only links (`prefetch={false}` on `Link`).
- **Listing shows HTML 404**: make sure clients call `/api/listing/<slug>`, the redirect handler exists, and the API returns `item.status === "published"` for public visibility.
- **PM2 cannot find module dist/server.cjs**: build the API (`pnpm -C apps/api build`) and verify the PM2 script path.
- **JWT route returns 404**: nginx must keep `/api/jwt` on port 3000; reload after editing config.
- **Review endpoints 401**: request a fresh token with the snippet above and verify `JWT_SECRET` matches in both `.env.production` files.

Document changes here whenever routing or proxying is touched.
