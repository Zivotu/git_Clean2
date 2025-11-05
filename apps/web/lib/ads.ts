import type { Entitlements } from '@/hooks/useEntitlements';

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
