import type { Entitlements } from '@/hooks/useEntitlements';

export type AdsSettings = {
  disabled: boolean;
  updatedAt?: number;
  updatedBy?: string | null;
};

export type ConsentStatus = 'unknown' | 'granted' | 'rejected';

export function normalizeAdsSettings(input: unknown): AdsSettings {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : undefined;
  const updatedBy =
    typeof record.updatedBy === 'string' && record.updatedBy.trim()
      ? record.updatedBy.trim()
      : record.updatedBy ?? null;
  return {
    disabled: Boolean(record.disabled),
    updatedAt,
    updatedBy,
  };
}

const EXEMPT_FEATURES = new Set([
  'noads',
  'no_ads',
  'isgold',
  'gold',
  'partner',
  'ambassador',
  'ambasador',
]);

function normalize(feature: unknown): string {
  return typeof feature === 'string' ? feature.trim().toLowerCase() : '';
}

export function shouldShowAds(entitlements?: Entitlements): boolean {
  if (process.env.NEXT_PUBLIC_ADS_DISABLED === 'true') {
    return false;
  }
  if (!entitlements) return false;
  if (entitlements.noAds) return false;
  if (entitlements.gold) return false;

  return !entitlements.entitlements?.some((ent) => {
    const feature = normalize(ent?.feature);
    if (!feature) return false;
    if (EXEMPT_FEATURES.has(feature)) return true;

    const plan = normalize((ent?.data as any)?.plan ?? (ent?.data as any)?.tier);
    if (plan && EXEMPT_FEATURES.has(plan)) return true;

    const tags = Array.isArray((ent?.data as any)?.tags)
      ? ((ent?.data as any)?.tags as unknown[])
      : [];
    return tags.some((tag) => EXEMPT_FEATURES.has(normalize(tag)));
  });
}

export type AdsSlotConfig = Record<
  string,
  {
    enabled: boolean;
    updatedAt?: number;
    updatedBy?: string | null;
  }
>;

export function normalizeAdsSlots(input: unknown): AdsSlotConfig {
  if (!input || typeof input !== 'object') return {};
  const slots =
    'slots' in (input as Record<string, any>) ? (input as any).slots : input;
  if (!slots || typeof slots !== 'object') return {};
  const normalized: AdsSlotConfig = {};
  for (const [key, value] of Object.entries(slots)) {
    if (!key) continue;
    normalized[key] = {
      enabled: Boolean((value as any)?.enabled),
      updatedAt:
        typeof (value as any)?.updatedAt === 'number'
          ? (value as any).updatedAt
          : undefined,
      updatedBy:
        typeof (value as any)?.updatedBy === 'string' &&
        (value as any).updatedBy.trim()
          ? (value as any).updatedBy.trim()
          : (value as any)?.updatedBy ?? null,
    };
  }
  return normalized;
}
