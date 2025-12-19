import { joinUrl } from './url';
import { getApiBase, INTERNAL_API_URL as RESOLVED_INTERNAL_API_URL } from './apiBase';

export interface GoldenBookConfig {
  enabled: boolean;
  paymentLink?: string;
  campaignId: string;
  campaignStartMs?: number;
  campaignEndMs?: number;
  aliasGraceMs?: number;
}

export interface GoldenBookCountdown {
  daysRemaining: number;
  daysTotal?: number;
}

const isTestEnv = process.env.NODE_ENV === 'test';

export interface WebConfig {
  API_URL: string;
  SAFE_PUBLISH_ENABLED: boolean;
  SANDBOX_SUBDOMAIN_ENABLED: boolean;
  ROOMS_ENABLED: boolean;
  SITE_NAME: string;
  MAX_APPS_PER_USER: number;
  GOLD_MAX_APPS_PER_USER: number;
  MAX_ROOMS_PER_APP: number;
  MAX_PLAYERS_PER_ROOM: number;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    storageBucket: string;
    messagingSenderId: string;
  };
  goldenBook: GoldenBookConfig;
}

function must(value: string | undefined, key: string): string {
  if (value === undefined || value === '') {
    if (isTestEnv) {
      return `test-${key.toLowerCase()}`;
    }
    throw new Error(`Missing environment variable ${key}`);
  }
  return value;
}

function resolveApiUrl(apiUrlStr?: string): string {
  const s = (apiUrlStr ?? '').trim();
  if (!s) return '';
  if (typeof window !== 'undefined' && s.startsWith('/')) {
    return `${window.location.origin}${s}`;
  }
  return s;
}

function normalizePublicApiUrl(raw: string): string {
  const resolved = resolveApiUrl(raw);
  return resolved === '/' ? resolved : resolved.replace(/\/$/, '');
}

function parseOptionalNumber(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  '/api';

const PUBLIC_API_URL = normalizePublicApiUrl(PUBLIC_API_BASE);

function normalizeHost(value: string): string {
  if (!value) return value;
  return value === '/' ? '/' : value.replace(/\/+$/, '');
}

const rawAppsHost = normalizeHost(process.env.NEXT_PUBLIC_APPS_HOST ?? '');
const fallbackApiBaseRaw =
  (process.env.NEXT_PUBLIC_LOCAL_API_URL ?? PUBLIC_API_URL ?? '/api').trim() || '/api';
const fallbackApiBase =
  fallbackApiBaseRaw === '/' ? '/' : fallbackApiBaseRaw.replace(/\/+$/, '');
const fallbackAppsHost =
  rawAppsHost ||
  (fallbackApiBase === '/' ? '/public/builds' : joinUrl(fallbackApiBase, 'public', 'builds'));

const PUBLIC_APPS_HOST = normalizeHost(rawAppsHost || fallbackAppsHost);
export async function isFirebaseConfiguredClient(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return true;
  }
  const { getMissingFirebaseEnv } = await import('./env');
  return getMissingFirebaseEnv().length === 0;
}

export function getConfig(): WebConfig | null {
  try {
    const rawApiUrl =
      typeof window === 'undefined' ? RESOLVED_INTERNAL_API_URL : getApiBase();
    const API_URL = resolveApiUrl(rawApiUrl).replace(/\/$/, '');
    const goldenBookConfig: GoldenBookConfig = {
      enabled: process.env.NEXT_PUBLIC_GOLDEN_BOOK_ENABLED !== 'false',
      paymentLink: (process.env.NEXT_PUBLIC_GOLDEN_BOOK_PAYMENT_LINK || '').trim() || undefined,
      campaignId: process.env.NEXT_PUBLIC_GOLDEN_BOOK_CAMPAIGN_ID?.trim() || 'goldenbook-default',
      campaignStartMs: parseOptionalNumber(process.env.NEXT_PUBLIC_GOLDEN_BOOK_CAMPAIGN_START_MS),
      campaignEndMs: parseOptionalNumber(process.env.NEXT_PUBLIC_GOLDEN_BOOK_CAMPAIGN_END_MS),
      aliasGraceMs: parseOptionalNumber(process.env.NEXT_PUBLIC_GOLDEN_BOOK_ALIAS_GRACE_MS),
    };
    return {
      API_URL,
      SAFE_PUBLISH_ENABLED: process.env.SAFE_PUBLISH_ENABLED === 'true',
      SANDBOX_SUBDOMAIN_ENABLED: process.env.SANDBOX_SUBDOMAIN_ENABLED !== 'false',
      ROOMS_ENABLED: process.env.ROOMS_ENABLED === 'true',
      SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME || 'THESARA.SPACE',
      MAX_APPS_PER_USER: Number(process.env.NEXT_PUBLIC_MAX_APPS_PER_USER || '2'),
      GOLD_MAX_APPS_PER_USER: Number(
        process.env.NEXT_PUBLIC_GOLD_MAX_APPS_PER_USER || '10',
      ),
      MAX_ROOMS_PER_APP: Number(process.env.NEXT_PUBLIC_MAX_ROOMS_PER_APP || '10'),
      MAX_PLAYERS_PER_ROOM: Number(process.env.NEXT_PUBLIC_MAX_PLAYERS_PER_ROOM || '100'),
      firebase: {
        apiKey: must(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, 'NEXT_PUBLIC_FIREBASE_API_KEY'),
        authDomain: must(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
        projectId: must(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
        appId: must(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, 'NEXT_PUBLIC_FIREBASE_APP_ID'),
        storageBucket: must(
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
        ),
        messagingSenderId: must(
          process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
        ),
      },
      goldenBook: goldenBookConfig,
    };
  } catch (err) {
    if (typeof window === 'undefined') {
      throw err;
    }
    console.error(err);
    return null;
  }
}

let API_URL = '';
let SAFE_PUBLISH_ENABLED = false;
let SANDBOX_SUBDOMAIN_ENABLED = true;
let ROOMS_ENABLED = false;
let SITE_NAME = 'THESARA.SPACE';
let MAX_APPS_PER_USER = 2;
let GOLD_MAX_APPS_PER_USER = 10;
let MAX_ROOMS_PER_APP = 10;
let MAX_PLAYERS_PER_ROOM = 100;
let GOLDEN_BOOK: GoldenBookConfig = {
  enabled: false,
  campaignId: 'goldenbook-default',
};

try {
  const cfg = getConfig();
  if (!cfg) {
    throw new Error('Missing Firebase configuration');
  }
  ({
    API_URL,
    SAFE_PUBLISH_ENABLED,
    SANDBOX_SUBDOMAIN_ENABLED,
    ROOMS_ENABLED,
    SITE_NAME,
    MAX_APPS_PER_USER,
    GOLD_MAX_APPS_PER_USER,
    MAX_ROOMS_PER_APP,
    MAX_PLAYERS_PER_ROOM,
    goldenBook: GOLDEN_BOOK,
  } = cfg);
} catch (err) {
  if (typeof window === 'undefined') {
    throw err;
  }
  console.error(err);
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '<div class="p-4">Configuration error. Please check environment settings.</div>';
  }
}

export {
  API_URL,
  SAFE_PUBLISH_ENABLED,
  SANDBOX_SUBDOMAIN_ENABLED,
  ROOMS_ENABLED,
  SITE_NAME,
  MAX_APPS_PER_USER,
  GOLD_MAX_APPS_PER_USER,
  MAX_ROOMS_PER_APP,
  MAX_PLAYERS_PER_ROOM,
  GOLDEN_BOOK,
  PUBLIC_API_URL,
  PUBLIC_APPS_HOST,
};

export function getGoldenBookCountdown(now: number = Date.now()): GoldenBookCountdown | null {
  if (!GOLDEN_BOOK.enabled || !GOLDEN_BOOK.campaignEndMs) {
    return null;
  }
  const end = GOLDEN_BOOK.campaignEndMs;
  if (end <= now) {
    return null;
  }
  const remainingMs = end - now;
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  const start = GOLDEN_BOOK.campaignStartMs;
  const daysTotal =
    start && start < end ? Math.ceil((end - start) / (24 * 60 * 60 * 1000)) : undefined;
  return { daysRemaining, daysTotal };
}

export function isGoldenBookCampaignActive(now: number = Date.now()): boolean {
  if (!GOLDEN_BOOK.enabled) return false;
  const { campaignStartMs, campaignEndMs } = GOLDEN_BOOK;
  if (campaignStartMs && now < campaignStartMs) {
    return false;
  }
  if (campaignEndMs && now > campaignEndMs) {
    return false;
  }
  return true;
}

export async function checkApiUrlReachability(baseUrl: string = API_URL): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  const probeUrl = toAbsolute(joinUrl(baseUrl, '/healthz'));
  try {
    const r = await fetch(probeUrl, { method: 'HEAD', credentials: 'include' });
    if (!r.ok) throw new Error('bad status');
    return true;
  } catch {
    try {
      const r2 = await fetch(probeUrl, { method: 'GET', credentials: 'include' });
      return r2.ok;
    } catch {
      return false;
    }
  }
}

function toAbsolute(u: string): string {
  if (/^https?:\/\//.test(u)) return u;
  if (typeof window !== 'undefined') return new URL(u, window.location.origin).toString();
  return u;
}

export { INTERNAL_API_URL } from './apiBase';
