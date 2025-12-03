import { API_URL } from './config';

export type DonationEntry = {
  id: string;
  alias: string;
  aliasStatus: 'pending' | 'confirmed' | 'anonymous';
  campaignId: string;
  createdAt: number;
};

type DonationListResponse = {
  donations?: DonationEntry[];
};

type AliasResponse = {
  ok: boolean;
  alias: string;
  aliasStatus: DonationEntry['aliasStatus'];
};

const API_BASE = (API_URL || '').replace(/\/+$/, '');

function buildApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) {
    return normalized;
  }
  return `${API_BASE}${normalized}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: init?.credentials ?? 'include',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = (data as any)?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchDonations(limit = 200): Promise<DonationEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const data = await requestJson<DonationListResponse>(`/donations?${params.toString()}`);
  return Array.isArray(data.donations) ? data.donations : [];
}

export async function fetchDonationByPaymentIntent(
  paymentIntentId: string,
): Promise<DonationEntry | null> {
  if (!paymentIntentId) return null;
  const params = new URLSearchParams({
    paymentIntentId,
    limit: '1',
  });
  const data = await requestJson<DonationListResponse>(`/donations?${params.toString()}`);
  return Array.isArray(data.donations) && data.donations.length ? data.donations[0] : null;
}

export async function submitDonationAlias(
  paymentIntentId: string,
  alias: string,
): Promise<AliasResponse> {
  if (!paymentIntentId) {
    throw new Error('missing_payment_intent');
  }
  return requestJson<AliasResponse>('/donations/alias', {
    method: 'POST',
    body: JSON.stringify({ paymentIntentId, alias }),
  });
}

export async function resolvePaymentIntentFromSession(
  sessionId: string,
): Promise<string> {
  if (!sessionId) {
    throw new Error('missing_session_id');
  }
  const params = new URLSearchParams({ sessionId });
  const data = await requestJson<{ paymentIntentId: string }>(
    `/donations/resolve-session?${params.toString()}`,
  );
  if (!data.paymentIntentId) {
    throw new Error('payment_intent_not_found');
  }
  return data.paymentIntentId;
}
