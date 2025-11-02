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
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${normalizedPath}`;
  }
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

function buildApiAssetUrl(resourcePath: string): string {
  const normalizedPath = normalizePath(resourcePath);
  
  // For static assets in SSR, use PUBLIC_SITE_URL instead of INTERNAL_API_URL
  // to avoid generating 127.0.0.1 URLs that browsers can't access
  const isStaticPath = STATIC_API_PATHS.some((prefix) =>
    normalizedPath.startsWith(prefix),
  );
  
  if (typeof window === 'undefined' && isStaticPath) {
    // SSR: Use public site URL for static assets
    const publicUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                      process.env.SITE_URL || 
                      process.env.NEXT_PUBLIC_WEB_URL || 
                      '';
    if (publicUrl && /^https?:\/\//i.test(publicUrl)) {
      try {
        const url = new URL(publicUrl);
        return `${url.origin}${normalizedPath}`;
      } catch {
        // Fall through to relative base
      }
    }
    return resolveRelativeBase(normalizedPath);
  }
  
  const base = (API_URL || '').trim();
  if (!base) {
    return resolveRelativeBase(normalizedPath);
  }

  const protocolRelativeMatch = base.startsWith('//')
    ? `https:${base}`
    : base;

  if (/^https?:\/\//i.test(protocolRelativeMatch)) {
    try {
      const api = new URL(protocolRelativeMatch);
      if (isStaticPath) {
        return `${api.origin}${normalizedPath}`;
      }
      const joinedPath = joinPath(api.pathname || '/', normalizedPath);
      return `${api.origin}${joinedPath}`;
    } catch {
      // ignore and fall through to concatenation
    }
  }

  if (base.startsWith('/')) {
    if (isStaticPath) {
      return resolveRelativeBase(normalizedPath);
    }
    const joinedPath = joinPath(base, normalizedPath);
    return resolveRelativeBase(joinedPath);
  }

  return joinPath(base, normalizedPath);
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
