export function getApiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    '/api';
  return raw.replace(/\/+$/, '');
}

export const INTERNAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '/api'
).replace(/\/+$/, '');

export const RESOLVED_INTERNAL_API_URL =
  typeof window === 'undefined'
    ? INTERNAL_API_URL
    : INTERNAL_API_URL.startsWith('/')
      ? `${window.location.origin}${INTERNAL_API_URL}`
      : INTERNAL_API_URL;
