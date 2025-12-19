// apps/web/lib/apiBase.ts

const THESARA_API_HOST = 'api.thesara.space';

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

export function normalizeApiUrl(raw?: string | null): string {
  const fallback = '/api';
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const withoutSlash = stripTrailingSlash(trimmed);
  try {
    const parsed = new URL(withoutSlash);
    const isThesaraApiHost = parsed.hostname === THESARA_API_HOST;
    if (isThesaraApiHost) {
      const path = stripTrailingSlash(parsed.pathname || '/');
      if (path === '' || path === '/') {
        return `${parsed.origin}/api`;
      }
      if (path === '/api') {
        return `${parsed.origin}/api`;
      }
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/+$/, '');
  } catch {
    return withoutSlash || fallback;
  }
}

/**
 * Vrati bazni API URL iz public env varijabli ili '/api'.
 * Uvijek bez završne kose crte.
 */
export function getApiBase(): string {
  // Public base for client; on server we'll still prefer INTERNAL_API_URL below.
  const raw =
    (typeof window !== 'undefined' ? undefined : process.env.INTERNAL_API_URL) ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    '/api';
  return stripTrailingSlash(raw);
}

/**
 * Interni (moguće relativni) API URL — npr. "/api".
 */
export const INTERNAL_API_URL: string = stripTrailingSlash(
  // Prefer server-only INTERNAL_API_URL when on the server
  (typeof window === 'undefined' ? (process.env.INTERNAL_API_URL || '') : '') ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    '/api'
);

/**
 * Rezolvirani (apsolutni u browseru) API URL.
 * Na serveru ostaje kakav jest (može biti relativan).
 */
export const RESOLVED_INTERNAL_API_URL: string =
  typeof window === 'undefined'
    ? INTERNAL_API_URL
    : INTERNAL_API_URL.startsWith('/')
      ? `${window.location.origin}${INTERNAL_API_URL}`
      : INTERNAL_API_URL;

/**
 * Glavni export koji koristi layout.tsx (named export).
 * Također ga izvozimo i kao default radi kompatibilnosti.
 */
export const API_URL: string = RESOLVED_INTERNAL_API_URL;

export default API_URL;
