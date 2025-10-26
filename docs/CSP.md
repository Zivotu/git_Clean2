# CSP Sanity & Policies

This document outlines the Content Security Policy (CSP) applied to Thesara Play apps, covering both modern **Bundled Mode** and **Legacy Mode**. The system uses a combination of the HTTP `Content-Security-Policy` header (served on `/builds/*` assets) and the `<meta http-equiv="Content-Security-Policy">` tag (in the `about:srcdoc` iframe) to enforce security.

## TL;DR

- **Bundled Mode**: Strict, uses SRI for integrity, and nonces for inline styles. No `unsafe-inline` or `unsafe-eval`.
- **Legacy Mode**: Slightly relaxed to support older apps that might have inline scripts. Avoids `unsafe-eval` where possible.
- **Alignment**: The HTTP `Content-Security-Policy` header and the `<meta>` tag are kept in sync to avoid contradictions.

---

## 1. Bundled Mode

This is the default and recommended mode for all new apps. It is activated when the build process successfully generates an `app.bundle.js` with a Subresource Integrity (SRI) hash in `manifest_v1.json`.

**Key Directives:**

- **`script-src`**: `'self'` `appOrigin`. Allows scripts only from the same origin (e.g., `https://apps.thesara.space`) and the app's origin. The use of an SRI hash on the script tag ensures integrity. **`'unsafe-inline'` and `'unsafe-eval'` are strictly forbidden.**
- **`style-src`**: `'self'` `appOrigin` and a `'nonce-...'`. A unique nonce is generated for each request to allow safe execution of minimal inline styles required by some UI libraries, without resorting to a global `'unsafe-inline'`. The parent origin is not included here as styles should come from the app's assets.
- **`connect-src`**: `'self'` `appOrigin`. Limits network requests (`fetch`, WebSocket) to the parent origin (for the Storage API) and the app's origin. If the manifest defines `networkPolicy: 'OPEN_NET'`, any domains listed in `networkDomains` are also added.
- **`img-src`**: `'self'` `appOrigin` `data:` `blob:`. Allows images from the same origin, the app's origin, and `data:` or `blob:` URLs.
- **`base-uri`**: `'none'`. Prevents base tag hijacking attacks.
- **`object-src`**: `'none'`. Disables plugins like Flash.
- **`frame-ancestors`**: Restricted to `'self'` and the main web app's origin (e.g., `https://thesara.space`) to prevent clickjacking.

**Example (Meta Tag in `srcdoc`):**
```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self' https://apps.thesara.space; style-src 'self' 'nonce-...'; connect-src 'self' https://apps.thesara.space; ...">
```

## 2. Legacy Mode

This mode is a fallback for older apps or builds that failed to bundle correctly, resulting in a plain `app.js` entry point without an SRI hash.

**Key Directives & Relaxations:**

- `script-src`: `'self'`. Since there is no bundle hash, we cannot use SRI. We avoid `'unsafe-inline'` for scripts where possible, but some legacy apps might require it. `'unsafe-eval'` is strongly discouraged and blocked unless absolutely necessary and explicitly declared.
- `style-src`: `'self' 'unsafe-inline'`. Legacy apps often rely on inline styles, so this is currently permitted.
- Other directives (`connect-src`, `img-src`, etc.) follow the same principles as bundled mode, respecting the manifest's `networkDomains`.

## 3. Alignment & Verification

- **HTTP Header vs. Meta Tag**: The same core CSP directives are generated for both the HTTP header served with the build assets and the `<meta>` tag injected into the sandboxed `iframe`. This ensures consistent security posture.
- **Automated Test**: The `tests/publish-legacy.spec.ts` E2E test verifies the legacy scenario. It programmatically creates a legacy-style build, loads it in the Play sandbox, and asserts that no CSP errors are logged to the browser console, confirming that the relaxed policy is correctly applied and sufficient for the app to run.
