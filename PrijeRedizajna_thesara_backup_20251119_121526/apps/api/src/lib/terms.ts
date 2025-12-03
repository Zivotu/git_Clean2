import { CURRENT_TERMS_VERSION, TERMS_POLICY } from '@thesara/policies/terms';
import { db, FieldValue, Timestamp } from '../db.js';

export interface TermsStatus {
  accepted: boolean;
  acceptedVersion?: string;
  acceptedAtMs?: number;
  requiredVersion: string;
  policy: typeof TERMS_POLICY;
}

export class TermsNotAcceptedError extends Error {
  status: TermsStatus;
  constructor(status: TermsStatus) {
    super('terms_not_accepted');
    this.status = status;
  }
}

function toMillis(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === 'object' && typeof (value as any).toMillis === 'function') {
    try {
      return (value as any).toMillis();
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractAcceptedVersion(data: any): { version?: string; acceptedAtMs?: number } {
  const versions = data?.terms?.versions;
  if (versions && typeof versions === 'object') {
    const currentEntry = versions[CURRENT_TERMS_VERSION];
    if (currentEntry && typeof currentEntry === 'object') {
      return {
        version: CURRENT_TERMS_VERSION,
        acceptedAtMs:
          toMillis(currentEntry.acceptedAtMs) ??
          toMillis(currentEntry.acceptedAt) ??
          (typeof currentEntry.acceptedAtMs === 'number' ? currentEntry.acceptedAtMs : undefined),
      };
    }
  }

  const directVersion =
    data?.terms?.latestVersion ?? data?.terms?.version ?? data?.termsAcceptedVersion ?? undefined;
  if (typeof directVersion === 'string' && directVersion.trim()) {
    const acceptedAtMs =
      toMillis(data?.terms?.latestAcceptedAtMs) ??
      toMillis(data?.terms?.latestAcceptedAt) ??
      toMillis(data?.termsAcceptedAtMs) ??
      toMillis(data?.termsAcceptedAt) ??
      undefined;
    return { version: directVersion, acceptedAtMs: acceptedAtMs ?? undefined };
  }

  if (versions && typeof versions === 'object') {
    for (const [version, entry] of Object.entries(versions)) {
      if (typeof version !== 'string' || !entry || typeof entry !== 'object') continue;
      const acceptedAtMs =
        toMillis((entry as any).acceptedAtMs) ?? toMillis((entry as any).acceptedAt) ?? undefined;
      return { version, acceptedAtMs };
    }
  }

  return {};
}

export async function readTermsStatus(uid: string): Promise<TermsStatus> {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? (snap.data() as any) : undefined;
  const { version, acceptedAtMs } = extractAcceptedVersion(data);
  const accepted =
    typeof version === 'string' && version.trim() === CURRENT_TERMS_VERSION;
  return {
    accepted,
    acceptedVersion: version,
    acceptedAtMs,
    requiredVersion: CURRENT_TERMS_VERSION,
    policy: TERMS_POLICY,
  };
}

export async function ensureTermsAccepted(uid: string): Promise<TermsStatus> {
  const status = await readTermsStatus(uid);
  if (!status.accepted) {
    throw new TermsNotAcceptedError(status);
  }
  return status;
}

export interface RecordTermsOptions {
  source?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordTermsAcceptance(
  uid: string,
  opts: RecordTermsOptions = {},
): Promise<TermsStatus> {
  const userRef = db.collection('users').doc(uid);
  const now = Date.now();
  const source = typeof opts.source === 'string' && opts.source.trim() ? opts.source.trim() : 'unspecified';
  const metadata =
    opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : undefined;

  const payload: Record<string, any> = {
    'terms.latestVersion': CURRENT_TERMS_VERSION,
    'terms.latestAcceptedAt': FieldValue.serverTimestamp(),
    'terms.latestAcceptedAtMs': now,
    'terms.latestSource': source,
    [`terms.versions.${CURRENT_TERMS_VERSION}`]: {
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedAtMs: now,
      source,
      metadata: metadata ?? null,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
    },
    termsAcceptedVersion: CURRENT_TERMS_VERSION,
    termsAcceptedAt: FieldValue.serverTimestamp(),
    termsAcceptedAtMs: now,
  };

  await userRef.set(payload, { merge: true });
  return readTermsStatus(uid);
}
