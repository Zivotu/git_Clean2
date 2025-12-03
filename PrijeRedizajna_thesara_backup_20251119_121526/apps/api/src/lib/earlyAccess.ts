import {
  db,
  listEntitlements,
  upsertEntitlement,
  readEarlyAccessSettings,
  type EarlyAccessSettings,
  type Entitlement,
} from '../db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type UserEarlyAccessState = {
  campaignId: string;
  startedAt: number;
  expiresAt: number;
  subscribedAt?: number;
};

type EnsureOptions = {
  uid: string;
  entitlements?: Entitlement[];
  now?: number;
};

export type EnsureEarlyAccessResult = {
  state: UserEarlyAccessState | null;
  entitlementsChanged: boolean;
  campaign: EarlyAccessSettings | null;
};

function normalizeState(value: any): UserEarlyAccessState | null {
  if (!value || typeof value !== 'object') return null;
  const campaignId =
    typeof value.campaignId === 'string' && value.campaignId.trim()
      ? value.campaignId.trim()
      : undefined;
  if (!campaignId) return null;
  const startedAt =
    typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) ? value.startedAt : null;
  const expiresAt =
    typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt) ? value.expiresAt : null;
  if (!startedAt || !expiresAt) return null;
  const subscribedAt =
    typeof value.subscribedAt === 'number' && Number.isFinite(value.subscribedAt)
      ? value.subscribedAt
      : undefined;
  return { campaignId, startedAt, expiresAt, subscribedAt };
}

function buildGoldEntitlementId(uid: string, campaignId: string): string {
  return `ea-${campaignId}-gold-${uid}`;
}

function buildNoAdsEntitlementId(uid: string, campaignId: string): string {
  return `ea-${campaignId}-noads-${uid}`;
}

function hasActiveFeature(list: Entitlement[], feature: string): boolean {
  return list.some((ent) => ent.feature === feature && (ent as any)?.active !== false);
}

export async function ensureEarlyAccessForUser({
  uid,
  entitlements: initialEntitlements,
  now: nowInput,
}: EnsureOptions): Promise<EnsureEarlyAccessResult> {
  const campaign = await readEarlyAccessSettings();
  if (!campaign || !campaign.isActive) {
    const snapshot = await db.collection('users').doc(uid).get();
    const existing = snapshot.exists ? normalizeState((snapshot.data() as any)?.earlyAccess) : null;
    return { state: existing, entitlementsChanged: false, campaign };
  }

  const durationDays = campaign.perUserDurationDays ?? campaign.durationDays ?? 30;
  const durationMs = Math.max(1, durationDays) * DAY_MS;
  const now = nowInput ?? Date.now();

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { state: null, entitlementsChanged: false, campaign };
  }
  const rawState = normalizeState((snap.data() as any)?.earlyAccess);
  let state = rawState;
  if (!state || state.campaignId !== campaign.id) {
    state = {
      campaignId: campaign.id,
      startedAt: now,
      expiresAt: now + durationMs,
    };
    await userRef.set(
      {
        earlyAccess: state,
      },
      { merge: true },
    );
  }

  let entitlements = initialEntitlements;
  if (!entitlements) {
    entitlements = await listEntitlements(uid);
  }

  const goldMissing = !hasActiveFeature(entitlements, 'isGold');
  const noAdsMissing = !hasActiveFeature(entitlements, 'noAds');
  let entitlementsChanged = false;
  if (goldMissing) {
    const ent: Entitlement = {
      id: buildGoldEntitlementId(uid, campaign.id),
      userId: uid,
      feature: 'isGold',
      active: true,
      data: {
        expiresAt: new Date(state.expiresAt).toISOString(),
      },
    } as Entitlement;
    await upsertEntitlement(ent);
    entitlementsChanged = true;
  }
  if (noAdsMissing) {
    const ent: Entitlement = {
      id: buildNoAdsEntitlementId(uid, campaign.id),
      userId: uid,
      feature: 'noAds',
      active: true,
      data: {
        expiresAt: new Date(state.expiresAt).toISOString(),
      },
    } as Entitlement;
    await upsertEntitlement(ent);
    entitlementsChanged = true;
  }

  return { state, entitlementsChanged, campaign };
}

export async function markEarlyAccessSubscribed(
  uid: string,
  campaignId: string,
  timestamp: number = Date.now(),
) {
  await db.collection('users').doc(uid).set(
    {
      'earlyAccess.campaignId': campaignId,
      'earlyAccess.subscribedAt': timestamp,
    } as any,
    { merge: true },
  );
}
