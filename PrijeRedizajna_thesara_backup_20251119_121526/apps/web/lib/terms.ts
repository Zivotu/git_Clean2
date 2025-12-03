import type { TermsPolicy } from '@thesara/policies/terms';
import { TERMS_POLICY as POLICY_DEF } from '@thesara/policies/terms';
import { apiAuthedPost, apiGet } from './api';

export interface TermsStatus {
  accepted: boolean;
  acceptedVersion?: string;
  acceptedAtMs?: number;
  requiredVersion: string;
  policy: TermsPolicy;
}

export interface AcceptTermsPayload {
  source?: string;
  metadata?: Record<string, unknown>;
}

export function fetchTermsStatus() {
  return apiGet<TermsStatus>('me/terms', { auth: true });
}

export async function acceptTerms(payload: AcceptTermsPayload = {}): Promise<TermsStatus> {
  const body: Record<string, unknown> = {};
  if (payload.source) body.source = payload.source;
  if (payload.metadata) body.metadata = payload.metadata;
  const res = await apiAuthedPost<{ ok: boolean; status: TermsStatus }>('me/terms/accept', body);
  return res.status;
}

export const TERMS_POLICY = POLICY_DEF;
