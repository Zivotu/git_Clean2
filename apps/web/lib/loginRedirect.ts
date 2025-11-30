const REDIRECT_PARAM = 'next';
const REDIRECT_COOKIE = 'thesara_next_target';
const COOKIE_MAX_AGE_SECONDS = 60 * 30; // 30 minutes
const MAX_PATH_LENGTH = 8192;

export function sanitizeRedirectPath(target?: string | null): string | null {
  if (!target) return null;
  const trimmed = `${target}`.trim();
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH) return null;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

export function buildLoginUrl(target?: string | null): string {
  const safe = sanitizeRedirectPath(target);
  return safe ? `/login?${REDIRECT_PARAM}=${encodeURIComponent(safe)}` : '/login';
}

export function rememberRedirectTarget(target?: string | null): void {
  const safe = sanitizeRedirectPath(target);
  if (!safe) return;
  setRedirectCookie(safe);
}

export function consumeRedirectTarget(): string | null {
  const fromParam = readRedirectParamFromLocation();
  if (fromParam) {
    clearRedirectCookie();
    return fromParam;
  }
  const fromCookie = readRedirectCookie();
  if (fromCookie) {
    clearRedirectCookie();
    return fromCookie;
  }
  return null;
}

export function getCurrentRelativeUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const { pathname, search, hash } = window.location;
  const combined = `${pathname}${search}${hash}`;
  return sanitizeRedirectPath(combined) ?? pathname;
}

type RouterLike = { push: (href: string) => void };

export function sendToLogin(router: RouterLike, target?: string | null): void {
  const resolvedTarget = target ?? getCurrentRelativeUrl();
  router.push(buildLoginUrl(resolvedTarget));
}

function readRedirectParamFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const search = window.location.search || '';
    if (!search) return null;
    const params = new URLSearchParams(search);
    return sanitizeRedirectPath(params.get(REDIRECT_PARAM));
  } catch {
    return null;
  }
}

function readRedirectCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    if (!cookie.startsWith(`${REDIRECT_COOKIE}=`)) continue;
    const value = cookie.slice(REDIRECT_COOKIE.length + 1);
    try {
      return sanitizeRedirectPath(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
  return null;
}

function setRedirectCookie(value: string): void {
  if (typeof document === 'undefined') return;
  const encoded = encodeURIComponent(value);
  document.cookie = `${REDIRECT_COOKIE}=${encoded}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearRedirectCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REDIRECT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
