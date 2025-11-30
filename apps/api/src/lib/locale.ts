const SUPPORTED = ['hr', 'en', 'de'] as const;
type SupportedLocale = (typeof SUPPORTED)[number];

function normalize(code: string | undefined | null): SupportedLocale | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (!lower) return undefined;
  const base = lower.split(/[-_]/)[0];
  if (SUPPORTED.includes(base as SupportedLocale)) {
    return base as SupportedLocale;
  }
  return undefined;
}

export function detectPreferredLocale(value?: string | string[] | null, fallback: SupportedLocale = 'en'): SupportedLocale {
  const raw = Array.isArray(value) ? value.join(',') : value;
  if (raw) {
    const parts = raw.split(',');
    for (const part of parts) {
      const token = part.split(';')[0]?.trim();
      const locale = normalize(token);
      if (locale) return locale;
    }
  }
  return fallback;
}

export function normalizeSupportedLocale(value?: string | null, fallback: SupportedLocale = 'en'): SupportedLocale {
  return normalize(value) ?? fallback;
}

export type CreatorLocale = SupportedLocale;

