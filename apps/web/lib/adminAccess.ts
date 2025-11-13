'use client';

import { apiGet, apiPost } from '@/lib/api';

const CACHE_MS = 60_000;

let cachedEmails: { value: string[]; fetchedAt: number } | null = null;

type AllowedEmailsResponse = { emails: string[] };
type UnlockResponse = { ok: boolean; admin: boolean; requiresRefresh?: boolean };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestAdminUnlock(pin: string): Promise<UnlockResponse> {
  return apiPost<UnlockResponse>('/admin/access/unlock', { pin }, { auth: true });
}

export async function fetchAllowedAdminEmails(force = false): Promise<string[]> {
  const now = Date.now();
  if (!force && cachedEmails && now - cachedEmails.fetchedAt < CACHE_MS) {
    return cachedEmails.value;
  }
  const { emails } = await apiGet<AllowedEmailsResponse>('/admin/access/allowed', { auth: true });
  const normalized = emails.map((entry) => normalizeEmail(String(entry)));
  cachedEmails = { value: normalized, fetchedAt: now };
  return normalized;
}

export async function saveAllowedAdminEmails(emails: string[]): Promise<string[]> {
  const normalized = emails.map((e) => normalizeEmail(e));
  const res = await apiPost<AllowedEmailsResponse>(
    '/admin/access/allowed',
    { emails: normalized },
    { auth: true },
  );
  const sorted = res.emails.map((entry) => normalizeEmail(String(entry)));
  cachedEmails = { value: sorted, fetchedAt: Date.now() };
  return sorted;
}
