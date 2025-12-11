import { apiGet, apiPost } from './api';

export type AmbassadorEarnings = {
  currentBalance: number;
  totalEarned: number;
};

export type AmbassadorInfo = {
  status: 'pending' | 'approved' | 'rejected';
  promoCode: string | null;
  commissionModel?: 'turbo' | 'partner';
  socialLinks: Record<string, string>;
  motivation: string;
  earnings: AmbassadorEarnings;
  dashboardUrl?: string | null;
  marketingKitUrl?: string | null;
  payoutEmail?: string | null;
  appliedAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
  primaryPlatform?: string | null;
  audienceSize?: string | null;
};

export type PromoCodeStats = {
  code: string;
  ambassadorUid: string;
  benefit: {
    type: 'free_gold_trial';
    durationDays: number;
  };
  isActive: boolean;
  usageCount: number;
  paidConversionsCount: number;
  totalRevenueGenerated: number;
};

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'rejected';

export type PayoutRecord = {
  payoutId: string;
  ambassadorUid: string;
  amount: number;
  status: PayoutStatus;
  requestedAt: number;
  paidAt?: number;
  method: 'PayPal';
  transactionId?: string;
  note?: string;
  rejectedAt?: number;
  paypalEmail?: string;
};

export type AmbassadorDashboardResponse = {
  ambassador: AmbassadorInfo;
  promoCode: PromoCodeStats | null;
  payouts: PayoutRecord[];
  payoutThreshold: number;
  activity?: {
    minPostsPerMonth: number;
    monthKey: string;
    submitted: number;
    verified: number;
    recentPosts: Array<AmbassadorPost>;
  };
};

export type AmbassadorPost = {
  id: string;
  ambassadorUid: string;
  url: string;
  platform?: string;
  caption?: string;
  postedAt?: number;
  submittedAt: number;
  monthKey: string;
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: number;
  rejectedAt?: number;
  adminNote?: string;
};

export type AmbassadorApplicationPayload = {
  socialLinks: Record<string, string>;
  motivation: string;
  audienceSize?: string;
  primaryPlatform?: string;
  commissionModel?: 'turbo' | 'partner';
};

export type AmbassadorApplicationItem = {
  uid: string;
  email: string | null;
  displayName: string | null;
  handle: string | null;
  photoURL?: string | null;
  ambassador: AmbassadorInfo;
};

export type AmbassadorApplicationResponse = {
  items: AmbassadorApplicationItem[];
};

export type PayoutListResponse = {
  items: PayoutRecord[];
};

export function fetchAmbassadorDashboard() {
  return apiGet<AmbassadorDashboardResponse>('/ambassador/dashboard');
}

export function requestAmbassadorPayout(input: { amount?: number; paypalEmail?: string }) {
  return apiPost<{ status: string; payoutId: string }>('/ambassador/payout-request', input);
}

export function applyToAmbassadorProgram(payload: AmbassadorApplicationPayload) {
  return apiPost<{ status: string }>('/ambassador/apply', payload);
}

export function fetchAmbassadorApplications(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending') {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  return apiGet<AmbassadorApplicationResponse>(`/admin/ambassadors/applications?${query.toString()}`);
}

export function approveAmbassador(uid: string) {
  return apiPost<{ status: string; promoCode: string }>(`/admin/ambassadors/approve`, { uid });
}

export function rejectAmbassador(uid: string, reason?: string) {
  return apiPost<{ status: string }>(`/admin/ambassadors/reject`, { uid, reason });
}

export function fetchPayouts(status: 'pending' | 'processing' | 'paid' | 'rejected' | 'all' = 'pending') {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  return apiGet<PayoutListResponse>(`/admin/payouts?${query.toString()}`);
}

export function processPayout(payload: { payoutId: string; status: 'processing' | 'paid' | 'rejected'; transactionId?: string; note?: string }) {
  return apiPost<{ status: string; payoutId: string; newStatus: string }>(
    `/admin/payouts/process`,
    payload
  );
}

export function redeemPromoCode(code: string) {
  return apiPost<{ status: string; message?: string; error?: string }>(`/promo-codes/redeem`, { code });
}

export function submitAmbassadorPost(input: { url: string; platform?: string; caption?: string; postedAt?: number }) {
  return apiPost<{ status: string; id: string }>(`/ambassador/content-submit`, input);
}

export function fetchAmbassadorPosts(params: { status?: 'pending' | 'verified' | 'rejected' | 'all'; month?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.month) query.set('month', params.month);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  return apiGet<{ items: AmbassadorPost[] }>(`/admin/ambassador/posts?${query.toString()}`);
}

export function verifyAmbassadorPost(payload: { id: string; status: 'verified' | 'rejected'; adminNote?: string }) {
  return apiPost<{ status: string; id: string }>(`/admin/ambassador/posts/verify`, payload);
}
