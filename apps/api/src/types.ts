import { z } from 'zod';

export const AccessModeSchema = z.enum(['public', 'pin', 'invite', 'private']);
export type AccessMode = z.infer<typeof AccessModeSchema>;

export interface Author {
  uid?: string;
  name?: string;
  handle?: string;
  photo?: string;
}

export type RoomsMode = 'off' | 'optional' | 'required';

export interface AppCapabilities {
  permissions?: {
    camera?: boolean;
    microphone?: boolean;
    webgl?: boolean;
    fileDownload?: boolean;
    [key: string]: any;
  };
  network?: {
    access?: 'no-net' | 'media-only' | 'proxy-net' | 'open-net' | 'reviewed-open-net';
    mediaDomains?: string[];
    domains?: string[];
    [key: string]: any;
  };
  storage?: {
    enabled?: boolean;
    roomsMode?: RoomsMode;
    roomsDemoPin?: string;
    roomsDemoName?: string;
    [key: string]: any;
  };
  features?: string[];
  [key: string]: any;
}

export interface AppRecord {
  id: string;
  slug: string;
  buildId?: string;
  pendingBuildId?: string;
  pendingVersion?: number;
  title: string;
  description: string;
  tags: string[];
  visibility: 'public' | 'unlisted';
  accessMode: AccessMode;
  author?: Author;
  allowlist?: string[];
  capabilities?: AppCapabilities;
  securityPolicy?: AppSecurityPolicy;
  createdAt: number;
  updatedAt?: number;
  publishedAt?: number;
  deletedAt?: number;
  playUrl: string;
  previewUrl?: string | null;
  likesCount?: number;
  playsCount?: number;
  // Localized fields stored per locale: { [locale]: { title, description } }
  translations?: Record<string, { title?: string; description?: string }>;
  status?: 'draft' | 'published' | 'pending-review' | 'rejected';
  state?: 'draft' | 'active' | 'inactive' | 'quarantined';
  moderation?: { by?: string; reasons?: string[]; status?: string; at?: number; notes?: string };
  reports?: { by: string; reason?: string; at: number }[];
  appeals?: { by: string; reason?: string; at: number }[];
  domainsSeen?: string[];
  version?: number;
  archivedVersions?: ArchivedVersion[];
  [key: string]: any;
}

export interface AppSecurityPolicy {
  network: {
    mode: 'strict' | 'proxy' | 'direct+proxy';
    allowlist?: string[];
    rateLimit?: {
      rps: number;
      burst: number;
      maxBodyMB: number;
    };
  };
  sandbox: {
    allowForms?: boolean;
    allowModals?: boolean;
  };
}

export interface ArchivedVersion {
  buildId: string;
  version: number;
  archivedAt: number;
}

// --- AMBASSADOR PROGRAM TYPES ---

export type AmbassadorApplicationStatus = 'pending' | 'approved' | 'rejected';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'rejected';

/**
 * Represents the 'ambassador' object nested within a user document.
 */
export interface AmbassadorInfo {
  status: AmbassadorApplicationStatus;
  promoCode?: string;
  socialLinks?: Record<string, string>;
  motivation?: string;
  primaryPlatform?: string;
  audienceSize?: string;
  appliedAt: number;
  approvedAt?: number;
  rejectedAt?: number;
  adminNotes?: string;
  marketingKitUrl?: string;
  dashboardUrl?: string;
  payoutEmail?: string;
  earnings: {
    currentBalance: number;
    totalEarned: number;
  };
}

/**
 * Represents the 'referredBy' object nested within a user document.
 */
export interface ReferredByInfo {
  ambassadorUid: string;
  promoCode: string;
  redeemedAt: number;
}

/**
 * Represents the main user model in the 'users' collection.
 */
export interface User {
  uid: string;
  handle?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  ambassador?: AmbassadorInfo;
  referredBy?: ReferredByInfo;
  [key: string]: any;
}

/**
 * Represents a document in the 'promoCodes' collection.
 */
export interface PromoCode {
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
}

/**
 * Represents a document in the 'payouts' collection.
 */
export interface Payout {
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
}

/**
 * Represents a social proof submission by an ambassador.
 */
export interface AmbassadorPost {
  id: string;
  ambassadorUid: string;
  url: string;
  platform?: string;
  caption?: string;
  postedAt?: number; // optional if ambassador can't provide exact time
  submittedAt: number;
  monthKey: string; // e.g. '2025-11'
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: number;
  rejectedAt?: number;
  adminNote?: string;
}
