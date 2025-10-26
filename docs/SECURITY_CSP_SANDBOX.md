# Security: CSP & Sandbox

This document outlines the security policies applied to the Play route and the iframes that host applications.

## Parent Page CSP

The Play route (`/play/:appId`) ships hardened response headers via `next.config.mjs`:

- `Content-Security-Policy`:  
  `default-src 'self'; script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''}; connect-src 'self' https://api.thesara.space ...; frame-src https://apps.thesara.space; img-src 'self' data: https:; frame-ancestors 'none'`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Referrer-Policy: no-referrer`

This ensures the parent cannot be embedded elsewhere and only talks to the official API origin (plus explicit dev overrides).

## Iframe Sandbox

`PlayPageClient.tsx` always renders:

```
sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
```

- `allow-same-origin` is **never** added in production.  
- With the opaque origin, the child cannot touch parent `localStorage`, cookies, or DOM, nor can it use existing credentials for XHR/fetch.
- Every storage mutation flows through the parent via `postMessage`, where the JWT lives exclusively in memory.

## Iframe meta-CSP (Defense in Depth)

The parent now injects the application via `srcDoc`, which first loads `/shim.js` and then the remote bundle. A `<meta http-equiv="Content-Security-Policy">` is included inside the `srcDoc`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'self' https://apps.thesara.space 'unsafe-inline';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: https:;
               font-src 'self' data:;
               connect-src 'none';
               frame-src 'none';">
```

### Rationale

The document can only execute bundled scripts from the trusted Apps host, cannot reach arbitrary network targets (`connect-src 'none'`), and cannot spawn additional frames. The inline allowance is limited to bootstrap glue; all API calls still originate from the parent.

## JWT Isolation & Proxy

- The parent fetches the JWT (`GET /api/jwt`) and the initial snapshot **before** the iframe is created.
- The iframe never receives the JWT (no query params, no localStorage, no cookies).
- `/shim.js` replaces `window.localStorage`/`sessionStorage` with in-memory facades and batches writes via `postMessage`.
- The parent validates message origin + capability token, calls `PATCH /api/storage` with `If-Match`, retries on `412`, and rebroadcasts state via `BroadcastChannel`.

## Reverse Proxies & CORS

- Fastify responds with `Access-Control-Allow-Headers: Authorization, If-Match, Content-Type, X-Thesara-App-Id`.
- `Authorization` headers are preserved end-to-end (Nginx + Fastify) so the parent can authenticate while staying in control of tokens.

## Faza 5 — Enforcement

Checklist enforced in production:

- [x] Parent CSP restricts origins and forbids framing (`frame-ancestors 'none'`).
- [x] iframe sandbox excludes `allow-same-origin`.
- [x] srcDoc meta-CSP blocks child network access (`connect-src 'none'`).
- [x] JWT never reaches the iframe; all API calls are executed by the parent proxy.
- [x] Reverse proxies preserve `Authorization`, `If-Match`, and `X-Thesara-App-Id`.

## Production Build CSP (`/builds/*`)

To ensure a secure environment for published applications, all assets served from the `/builds/` directory (e.g., `/builds/<buildId>/build/app.bundle.js`) are delivered with a strict Content-Security-Policy (CSP).

This policy is non-dynamic and enforces the following rules:

- `default-src 'self'`: By default, all content must be loaded from the same origin as the document.
- `script-src 'self'`: All scripts must be loaded from the same origin. This prevents the execution of scripts from external domains.
- `style-src 'self' 'unsafe-inline'`: Stylesheets must be from the same origin. `'unsafe-inline'` is included to support components that inject styles directly.
- `img-src 'self' data: blob:`: Images can be loaded from the same origin, as data URIs, or from blob URLs.
- `connect-src 'self'`: Limits network requests (XHR, Fetch, etc.) to the same origin.
- `frame-ancestors 'self' http://localhost:3000`: Allows the build to be embedded within the main Thesara application (`thesara.space`) or in a local development environment.
- `base-uri 'none'`: Prevents attacks that involve changing the base URL of the page.
- `object-src 'none'`: Disables the use of plugins like Flash.

This hardened CSP ensures that published applications run in a tightly controlled environment, minimizing the risk of cross-site scripting (XSS) and other injection attacks.