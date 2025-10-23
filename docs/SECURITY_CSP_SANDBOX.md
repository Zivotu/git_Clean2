# Security: CSP & Sandbox

This document outlines the security policies applied to the Play route and the iframes that host applications.

## Parent Page CSP

The main page that hosts the application iframe (`/play/:path*`) is served with a set of restrictive HTTP headers, configured in `next.config.mjs`, to protect the user and the platform.

- `Content-Security-Policy`: This policy locks down the resources that can be loaded and executed. It allows connections only to the Thesara API (`connect-src 'self' https://api.thesara.space`) and prevents the page from being framed by other sites (`frame-ancestors 'self'`).
- `X-Frame-Options: SAMEORIGIN`: Prevents the Play page from being embedded in other websites (clickjacking protection).
- `Referrer-Policy: no-referrer`: Prevents leaking URL information to other sites.
- `Permissions-Policy`: Disables potentially sensitive APIs like camera, microphone, and geolocation by default.

## Iframe Sandbox

The `<iframe>` element uses the `sandbox` attribute to create a highly restricted environment for the hosted application.

- `sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"`: This configuration allows the application to execute JavaScript and use common UI features like forms and popups, but it critically **omits** `allow-same-origin`.
- **No `allow-same-origin`**: This is the most important security decision. Without it, the iframe is treated as being from a unique, opaque origin. This means it cannot access the parent window's `localStorage`, cookies, or DOM, and it cannot make API requests to the Thesara API on its own. All communication must go through the `postMessage` proxy.

## Iframe meta-CSP (Defense in Depth)

In addition to the parent page's CSP and the iframe sandbox, the document loaded into the iframe via `srcDoc` contains its own `Content-Security-Policy` delivered via a `<meta>` tag. This provides a second layer of defense.

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' ${APPS_HOST}; img-src data:; style-src 'self'; connect-src 'none';">
```

### Rationale

This meta-CSP provides a second layer of defense (defense in depth) that applies specifically to the content within the iframe.

- `default-src 'none'`: By default, nothing is allowed.
- `script-src 'self' ${APPS_HOST}`: Scripts can only be loaded from the same origin as the iframe content itself (which is the `srcDoc`'s unique origin) or from the trusted application host.
- `connect-src 'none'`: This is a critical rule that explicitly forbids the application inside the iframe from making any network requests (e.g., via `fetch` or `XMLHttpRequest`). This reinforces the sandbox policy and ensures that all data access must go through the parent window's `postMessage` proxy, which controls access to the Thesara API.
- `img-src data:` and `style-src 'self'`: Allows images (including data URIs) and stylesheets, which are generally low-risk.

This layered approach ensures that even if an application finds a way to bypass one security measure, another is in place to prevent unauthorized access or behavior.

## Faza 5 — Enforcement

As of 2025-10-23, all previously documented security policies have been strictly enforced in the production environment.

- **Parent CSP**: `frame-ancestors` is now set to `'none'`.
- **Iframe Sandbox**: The `sandbox` attribute is enforced with `allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox` and no `allow-same-origin`.
- **Iframe meta-CSP**: A strict `connect-src 'none'` policy is injected into the iframe `srcDoc`.
- **Nginx**: HSTS is enabled (`max-age=31536000`) and the `Authorization` header is preserved for API requests.