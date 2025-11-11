export type AccessMode = 'public' | 'pin' | 'invite' | 'private';

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

export interface AppRecord {
  id: string;
  slug: string;
  buildId?: string;
  name?: string;  
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

/**
 * Minimalni tip koji koristi HomeClient i listing stranice.
 * Ako kasnije neki dio koda treba dodatna polja, lako ćemo proširiti ovaj Pick.
 */
export type Listing = Pick<
  AppRecord,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'tags'
  | 'playUrl'
  | 'previewUrl'
  | 'author'
  | 'likesCount'
  | 'playsCount'
  | 'translations'
  | 'visibility'
> & {
  featured?: boolean;
  // Dodano radi HomeClient.tsx:
  createdAt?: number | string | Date;
  // (opcionalno korisno, ako se negdje koristi)
  updatedAt?: number | string | Date;
  likedByMe?: boolean;
};
