import { GOLD_PRICE_ID, NOADS_PRICE_ID } from '../billing.js';
import { getConfig } from '../config.js';

export interface Package {
  id: string;
  name: string;
  description: string;
  features: string[];
  tier: string;
  priceId: string;
  price?: number;
  currency?: string;
  billingPeriod?: string;
}

const requiredPriceIds: Array<[string, string | undefined]> = [
  ['GOLD_PRICE_ID', GOLD_PRICE_ID],
  ['NOADS_PRICE_ID', NOADS_PRICE_ID],
];

const missingPriceIds = requiredPriceIds
  .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
  .map(([key]) => key);

if (missingPriceIds.length > 0) {
  const formattedKeys = missingPriceIds.join(', ');
  throw new Error(
    `[billing] Missing Stripe price IDs (${formattedKeys}). Set them in apps/api/.env or production secrets so Go Pro packages can load.`,
  );
}

const config = getConfig();
const GOLD_APP_LIMIT = config.GOLD_MAX_APPS_PER_USER;
const FREE_APP_LIMIT = config.MAX_APPS_PER_USER;

const GOLD_FEATURES = [
  `Up to ${GOLD_APP_LIMIT} active apps (Free includes ${FREE_APP_LIMIT})`,
  'Higher upload and storage quotas for bundles and assets',
  'Removes platform ads for owners and published apps',
  'Priority publish review and support channel',
];

const NO_ADS_FEATURES = [
  'Removes every THESARA.SPACE ad slot across web and published apps',
  'Focus mode for your audience (no banners or interstitials)',
];

export const PACKAGES: Package[] = [
  {
    id: 'gold',
    name: 'Gold',
    description: 'Unlock higher limits, premium storage and priority publish support.',
    features: GOLD_FEATURES,
    tier: 'pro',
    priceId: GOLD_PRICE_ID,
    billingPeriod: 'month',
  },
  {
    id: 'noads',
    name: 'No Ads',
    description: 'Remove THESARA.SPACE ads from dashboards and everyone playing your apps.',
    features: NO_ADS_FEATURES,
    tier: 'addon',
    priceId: NOADS_PRICE_ID,
    billingPeriod: 'month',
  },
].filter((p): p is Package => Boolean(p.priceId));
