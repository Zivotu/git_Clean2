import { API_URL } from '@/lib/config';

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function joinPath(basePath: string, resourcePath: string): string {
  const left = basePath.replace(/\/+$/, '');
  const right = normalizePath(resourcePath);
  if (!left || left === '/') return right;
  return `${left}${right}`.replace(/\/{2,}/g, '/');
}

function resolveRelativeBase(normalizedPath: string): string {
  const envOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_WEB_URL ||
    '';
  if (envOrigin && /^https?:\/\//i.test(envOrigin)) {
    try {
      const url = new URL(envOrigin);
      return `${url.origin}${normalizedPath}`;
    } catch {
      // ignore and fall through
    }
  }
  return normalizedPath;
}

const STATIC_API_PATHS = ['/uploads/', '/builds/', '/public/builds/', '/review/builds/', '/play/'] as const;

function getApiOrigin(): string {
  const explicitOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || '').trim().replace(/\/+$/, '');
  if (explicitOrigin) return explicitOrigin;
  if (API_URL) {
    try {
      return new URL(API_URL).origin;
    } catch {}
  }
  return '';
}

function buildApiAssetUrl(resourcePath: string): string {
  const normalizedPath = normalizePath(resourcePath);
  const isStaticPath = STATIC_API_PATHS.some((prefix) => normalizedPath.startsWith(prefix));

  const origin = getApiOrigin();
  if (!origin) {
    return resolveRelativeBase(normalizedPath);
  }

  if (isStaticPath) {
    return `${origin}${normalizedPath}`;
  }

  let pathname = '/';
  if (API_URL) {
    try {
      const parsed = new URL(API_URL);
      pathname = parsed.pathname;
    } catch {
      pathname = '/';
    }
  }
  const joinedPath = joinPath(pathname || '/', normalizedPath);
  return `${origin}${joinedPath}`;
}

export function resolvePreviewUrl(previewUrl?: string | null): string {
  if (!previewUrl) return '';
  const trimmed = previewUrl.trim();
  if (!trimmed) return '';
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  const normalized = normalizePath(trimmed);
  if (normalized.startsWith('/preview-presets/')) return normalized;
  if (normalized.startsWith('/assets/')) return normalized;
  return buildApiAssetUrl(normalized);
}
