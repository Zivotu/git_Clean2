import {
  GOLD_MAX_APPS_PER_USER,
  MAX_APPS_PER_USER,
} from '@/lib/config';
import type { BillingPackage } from '@/types/billing';

type MessagesDict = Record<string, string>;

type TemplateEntry = {
  descriptionKey?: string;
  descriptionValues?: Record<string, string | number>;
  featureKeys?: Array<{ key: string; values?: Record<string, string | number> }>;
};

const PACKAGE_COPY: Record<string, TemplateEntry> = {
  gold: {
    descriptionKey: 'goldDescription',
    featureKeys: [
      {
        key: 'goldFeatureApps',
        values: { goldLimit: GOLD_MAX_APPS_PER_USER, freeLimit: MAX_APPS_PER_USER },
      },
      { key: 'goldFeatureStorage' },
      { key: 'goldFeatureAds' },
      { key: 'goldFeatureSupport' },
    ],
  },
  noads: {
    descriptionKey: 'noAdsDescription',
    featureKeys: [
      { key: 'noAdsFeatureRemoval' },
      { key: 'noAdsFeatureFocus' },
    ],
  },
};

function interpolate(
  input: string,
  values?: Record<string, string | number>,
  locale?: string,
): string {
  if (!values) return input;
  let output = input;
  for (const [k, v] of Object.entries(values)) {
    const formattedValue =
      typeof v === 'number'
        ? new Intl.NumberFormat(locale || 'en-US').format(v)
        : v;
    output = output.replaceAll(`{${k}}`, String(formattedValue));
  }
  return output;
}

function resolveMessage(
  messages: MessagesDict,
  key: string,
  values?: Record<string, string | number>,
  locale?: string,
): string {
  const raw = messages[`Pro.${key}`] ?? key;
  return interpolate(raw, values, locale);
}

export function applyPackageCopy(
  pkg: BillingPackage,
  messages: MessagesDict,
  locale?: string,
): BillingPackage {
  const template = PACKAGE_COPY[pkg.id];
  if (!template) {
    return pkg;
  }
  const description = template.descriptionKey
    ? resolveMessage(messages, template.descriptionKey, template.descriptionValues, locale)
    : pkg.description;
  const features = template.featureKeys
    ? template.featureKeys.map((entry) =>
        resolveMessage(messages, entry.key, entry.values, locale),
      )
    : pkg.features;

  return {
    ...pkg,
    description,
    features,
  };
}

