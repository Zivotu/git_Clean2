export { prisma } from './db/prisma.js';
import path from 'node:path';
import fs from 'node:fs';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { ARCHIVE_TTL_MS } from './lib/versioning.js';
import admin from './firebase.js';
import type { AppRecord } from './types.js';
import type { Oglas } from './models/Oglas.js';
import type { EntitlementType } from '@loopyway/entitlements';
import type { ServiceAccount } from 'firebase-admin';

export type { AppRecord } from './types.js';
export { FieldValue, Timestamp };

function getFirebaseInitOptions(): admin.AppOptions {
  const projectIdFromEnv =
    process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

  // When the Firestore emulator is enabled we don't need real credentials. Instead we only
  // provide a projectId so firebase-admin talks to the emulator endpoint. This lets local
  // development proceed without placing service account files on disk.
  if (process.env.FIREBASE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    return {
      projectId: projectIdFromEnv || 'thesara-local',
    } satisfies admin.AppOptions;
  }

  const tried: string[] = [];
  const logSource = (label: string) => {
    console.info(`[firebase] Using credentials from ${label}`);
  };

  const buildFromRaw = (raw: any, label: string): admin.AppOptions => {
    const serviceAccount: ServiceAccount = {
      projectId: raw.project_id || raw.projectId || projectIdFromEnv,
      clientEmail: raw.client_email || raw.clientEmail,
      privateKey: ((raw.private_key || raw.privateKey || '') as string).replace(/\\n/g, '\n'),
    };
    if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
      throw new Error('missing private_key or client_email');
    }
    logSource(label);
    return {
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.projectId || projectIdFromEnv,
    };
  };

  const tryServiceAccount = (value: string, label: string, parser: () => any) => {
    tried.push(label);
    try {
      const raw = parser();
      return buildFromRaw(raw, label);
    } catch (error: any) {
      console.warn(`[firebase] Failed to use ${label}: ${error?.message || error}`);
      return undefined;
    }
  };

  const fromBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (fromBase64) {
    const parsed = () =>
      JSON.parse(Buffer.from(fromBase64, 'base64').toString('utf8')) as Record<string, unknown>;
    const appOptions = tryServiceAccount(fromBase64, 'FIREBASE_SERVICE_ACCOUNT_BASE64', parsed);
    if (appOptions) return appOptions;
  }

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inlineJson) {
    const parsed = () => JSON.parse(inlineJson) as Record<string, unknown>;
    const appOptions = tryServiceAccount(inlineJson, 'FIREBASE_SERVICE_ACCOUNT', parsed);
    if (appOptions) return appOptions;
  }

  const credentialPaths = new Set<string>();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credentialPaths.add(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }
  credentialPaths.add(path.resolve(process.cwd(), 'keys', 'firebase-sa.json'));

  const keysDir = path.resolve(process.cwd(), 'keys');
  if (fs.existsSync(keysDir)) {
    const firstJson =
      fs
        .readdirSync(keysDir)
        .find((file) => file.toLowerCase().endsWith('.json'));
    if (firstJson) {
      credentialPaths.add(path.resolve(keysDir, firstJson));
    }
  }
  credentialPaths.add('/etc/thesara/creds/firebase-sa.json');

  for (const candidate of credentialPaths) {
    const label = `file:${candidate}`;
    tried.push(label);
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, unknown>;
      return buildFromRaw(raw, label);
    } catch (error: any) {
      console.warn(`[firebase] Failed to read ${label}: ${error?.message || error}`);
    }
  }

  const pemCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PEM &&
      path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PEM),
    path.join(keysDir, 'firebase-sa.pem'),
    '/etc/thesara/creds/firebase-sa.pem',
  ].filter(Boolean) as string[];

  for (const pemPath of pemCandidates) {
    const label = `pem:${pemPath}`;
    tried.push(label);
    if (!fs.existsSync(pemPath)) continue;
    const clientEmail =
      process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL_ADDRESS;
    const projectId = projectIdFromEnv || process.env.FIREBASE_PROJECT_ID;
    if (!clientEmail || !projectId) {
      console.warn(
        `[firebase] Skipping ${label}: set FIREBASE_CLIENT_EMAIL and FIREBASE_PROJECT_ID to use PEM credentials.`, 
      );
      continue;
    }
    const privateKey = fs.readFileSync(pemPath, 'utf8');
    logSource(label);
    return {
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    };
  }

  throw new Error(
    `No Firebase credentials found. Tried: ${tried.join(
      ', ',
    )}. Set FIREBASE_SERVICE_ACCOUNT(_BASE64) or GOOGLE_APPLICATION_CREDENTIALS.`, 
  );
}

import { db as firestore } from './firebase.js';
export { firestore as db };
const db = firestore;

export type Creator = {
  id: string;
  handle: string;
  bio?: string;
  plan?: string;
  allAccessPrice?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  stripeAllAccessProductId?: string;
  stripeAllAccessPriceId?: string;
  stripeAccountId?: string;
  [key: string]: any;
};

export type App = AppRecord;

export type Entitlement = {
  id: string;
  userId: string;
  feature: EntitlementType;
  active?: boolean;
  data?: Record<string, any>;
};

export type Metric = {
  plays: number;
  likes: number;
};

// Firestore collections structure mirrors former SQLite tables:
// creators/{creatorId}
// apps/{appId}
//   kv/{key} => { value }
//   likes/{uid} => { liked: true }
// entitlements/{entitlementId}
// metrics/{appId}
// stripe_customers/{userId}

const DEFAULT_COLLECTIONS = [
  'entitlements',
  'billing_events',
  'billing_events_unmapped',
  'subscriptions',
  'stripe_accounts',
  'stripe_customers',
  'stripe_events',
  'payments',
  'users',
  'creators',
  'donations',
];

let dbInitialization: Promise<void> | undefined;

async function runDbInitialization(): Promise<void> {
  await ensureCollections(DEFAULT_COLLECTIONS);
  await ensureAmirSerbicCreator();
}

export function ensureDbInitialized(): Promise<void> {
  if (!dbInitialization) {
    dbInitialization = runDbInitialization().catch((err) => {
      dbInitialization = undefined;
      throw err;
    });
  }
  return dbInitialization;
}

void ensureDbInitialized();
const OGLASI_COLLECTION = 'oglasi';
const OGLASI_SEED_DOC = 'seed_state';

// Utility helpers -----------------------------------------------------------

/**
 * Ensure the 'oglasi' collection exists. If it doesn't, a placeholder document
 * is created so subsequent reads won't fail.
 */
async function ensureOglasiCollection(): Promise<CollectionReference> {
  const col = db.collection(OGLASI_COLLECTION);
  const cols = await db.listCollections();
  const exists = cols.some((c) => c.id === OGLASI_COLLECTION);
  if (!exists) {
    await col.doc(OGLASI_SEED_DOC).set({ createdAt: Date.now(), seed: true });
    console.log('seed:done');
    return col;
  }
  const seedDoc = await col.doc(OGLASI_SEED_DOC).get();
  if (!seedDoc.exists) {
    await col.doc(OGLASI_SEED_DOC).set({ createdAt: Date.now(), seed: true });
    console.log('seed:done');
  } else {
    console.log('seed:skip');
  }
  return col;
}

/**
 * Ensure the given top level collection already exists. This guards against
 * accidental writes to misspelled paths which would otherwise create new
 * collections implicitly.
 */
async function getExistingCollection(name: string): Promise<CollectionReference> {
  const cols = await db.listCollections();
  const found = cols.find((c) => c.id === name);
  if (!found) {
    throw new Error(`Missing collection: ${name}`);
  }
  return db.collection(name);
}

export async function ensureCollections(names: string[]): Promise<void> {
  const existing = await db.listCollections();
  const existingNames = new Set(existing.map((c) => c.id));
  for (const name of names) {
    if (!existingNames.has(name)) {
      await db
        .collection(name)
        .doc('_init')
        .set({ createdAt: Timestamp.now() });
      console.log(`Created collection '${name}'`);
    }
  }
}

/**
 * Return a reference to a subcollection under a document. The parent document
 * must exist; if the subcollection hasn't been created yet it will be created on
 * first write. This function merely ensures the path is valid and avoids
 * duplicates by checking the existing list of subcollections.
 */
async function getSubcollection(
  docRef: DocumentReference,
  name: string,
): Promise<CollectionReference> {
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error(`Missing document for subcollection '${name}'`);
  }
  const cols = await docRef.listCollections();
  const exists = cols.some((c) => c.id === name);
  if (!exists) {
    // Firestore creates subcollections on first write; nothing to do other than
    // returning the reference so callers can perform that write.
  }
  return docRef.collection(name);
}

function attachMetrics(data: any, m?: Metric): App {
  return {
    // spread to retain arbitrary fields like updatedAt and publishedAt
    ...data,
    likesCount: m?.likes ?? 0,
    playsCount: m?.plays ?? 0,
  } as App;
}

export async function readCreators(fields?: string[]): Promise<Creator[]> {
  const col = await getExistingCollection('creators');
  let query: any = col;
  if (fields && fields.length) {
    query = query.select(...fields);
  }
  const snap = await query.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Creator);
}

export async function writeCreators(items: Creator[]): Promise<void> {
  const col = await getExistingCollection('creators');
  const existing = await col.get();
  const batch = db.batch();
  existing.docs.forEach((d: any) => batch.delete(d.ref));
  items.forEach((it) => batch.set(col.doc(it.id), it));
  await batch.commit();
}

export async function getCreatorByHandle(handle: string): Promise<Creator | undefined> {
  const snap = await (await getExistingCollection('creators'))
    .where('handle', '==', handle)
    .limit(1)
    .get();
  if (!snap.empty) {
    return snap.docs[0].data() as Creator;
  }

  // Fallback: search users collection by handle
  const userSnap = await db
    .collection('users')
    .where('handle', '==', handle)
    .limit(1)
    .get();
  if (userSnap.empty) return undefined;
  const doc = userSnap.docs[0];
  const data = doc.data() as any;
  const creator: Creator = {
    id: doc.id,
    handle: data.handle || handle,
    allAccessPrice: data.allAccessPrice,
    displayName: data.displayName,
    photoURL: data.photoURL,
  };
  // Persist minimal creator record for future lookups
  try {
    await upsertCreator({ id: creator.id, handle: creator.handle, allAccessPrice: creator.allAccessPrice });
  } catch {}
  return creator;
}

export async function getCreatorById(uid: string): Promise<Creator | undefined> {
  if (!uid) return undefined;
  try {
    const col = await getExistingCollection('creators');
    const snap = await col.doc(uid).get();
    if (snap.exists) {
      const data = snap.data() as Creator;
      return { ...data, id: data.id ?? snap.id };
    }
  } catch {}
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return undefined;
    const data = userDoc.data() as any;
    const fullName = [data.firstName, data.lastName]
      .map((part: any) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    const creator: Creator = {
      id: uid,
      handle: data.handle || data.username || data.slug || uid,
      displayName: data.displayName || fullName || data.name || data.handle || data.username || uid,
      photoURL: data.photoURL || data.photo || data.avatarUrl || undefined,
      bio: data.bio,
    } as Creator;
    try {
      await upsertCreator({
        id: creator.id,
        handle: creator.handle,
        displayName: creator.displayName,
        photoURL: creator.photoURL,
        bio: creator.bio,
      });
    } catch {}
    return creator;
  } catch {
    return undefined;
  }
}

export async function upsertCreator(it: Creator): Promise<void> {
  await (await getExistingCollection('creators')).doc(it.id).set(it);
}

export async function readApps(fields?: string[]): Promise<App[]> {
  // Ensure base collections exist on first boot to avoid 500s
  await ensureCollections(['apps', 'metrics']);
  const appsCol = await getExistingCollection('apps');
  if (fields && fields.length) {
    const snap = await appsCol.select(...fields).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as App);
  }
  const appsSnap = await appsCol.get();
  const metricsSnap = await (await getExistingCollection('metrics')).get();
  const metrics = new Map<string, Metric>(
    metricsSnap.docs.map((d: any) => [d.id, d.data() as Metric]),
  );
  const now = Date.now();
  const updates: Promise<any>[] = [];
  const results = appsSnap.docs.map((d: any) => {
    const data = d.data();
    data.reports = data.reports ?? [];
    data.domainsSeen = data.domainsSeen ?? [];
    const origLen = (data.archivedVersions ?? []).length;
    const expiry = now - ARCHIVE_TTL_MS;
    data.archivedVersions = (data.archivedVersions ?? []).filter(
      (v: any) => v.archivedAt >= expiry,
    );
    if (origLen !== data.archivedVersions.length) {
      // Use set(..., { merge: true }) instead of update() so this is safe
      // if the document doesn't exist yet (avoids NOT_FOUND errors).
      updates.push(appsCol.doc(d.id).set({ archivedVersions: data.archivedVersions }, { merge: true }));
    }
    return attachMetrics(data, metrics.get(d.id));
  });
  if (updates.length) {
    await Promise.all(updates);
  }
  return results;
}

/**
 * Fetch a single app either by its document ID or slug without scanning the
 * entire collection. Throws an error if multiple apps share the same slug.
 *
 * @param idOrSlug - Application document ID or slug
 * @throws Error with message 'app_slug_not_unique' if slug is not unique
 */
export async function getAppByIdOrSlug(
  idOrSlug: string,
): Promise<App | undefined> {
  await ensureCollections(['apps', 'metrics']);
  const appsCol = await getExistingCollection('apps');
  const metricsCol = await getExistingCollection('metrics');

  let doc = await appsCol.doc(idOrSlug).get();
  let ref: DocumentReference = appsCol.doc(idOrSlug);

  if (!doc.exists) {
    const snap = await appsCol.where('slug', '==', idOrSlug).limit(2).get();
    if (snap.empty) return undefined;
    if (snap.size > 1) {
      throw new Error('app_slug_not_unique');
    }
    doc = snap.docs[0];
    ref = doc.ref;
  }

  const data = doc.data() as any;
  data.reports = data.reports ?? [];
  data.domainsSeen = data.domainsSeen ?? [];
  const origLen = (data.archivedVersions ?? []).length;
  const expiry = Date.now() - ARCHIVE_TTL_MS;
  data.archivedVersions = (data.archivedVersions ?? []).filter(
    (v: any) => v.archivedAt >= expiry,
  );
  if (origLen !== data.archivedVersions.length) {
    // Use set with merge to tolerate missing docs.
    await ref.set({ archivedVersions: data.archivedVersions }, { merge: true });
  }

  const metricDoc = await metricsCol.doc(doc.id).get();
  return attachMetrics(
    data,
    metricDoc.exists ? (metricDoc.data() as Metric) : undefined,
  );
}

export async function writeApps(items: App[]): Promise<void> {
  // Verify top level collections exist before performing batch writes
  const appsCol = await getExistingCollection('apps');
  const metricsCol = await getExistingCollection('metrics');
  const appsSnap = await appsCol.get();
  const metricsSnap = await metricsCol.get();
  const batch = db.batch();
  appsSnap.docs.forEach((d: any) => batch.delete(d.ref));
  metricsSnap.docs.forEach((d: any) => batch.delete(d.ref));
  for (const it of items) {
    const { likesCount, playsCount, ...rest } = it as any;
    // rest contains timestamps such as updatedAt and publishedAt which
    // should be stored alongside other listing data
    batch.set(appsCol.doc(it.id), rest);
    batch.set(metricsCol.doc(it.id), {
      plays: likesCount ?? 0,
      likes: playsCount ?? 0,
    });
  }
  await batch.commit();
}

export async function updateApp(appId: string, payload: Partial<App>): Promise<void> {
  const appsCol = await getExistingCollection('apps');
  const { likesCount, playsCount, ...rest } = payload as any;

  // DEBUG: Log buildId before Firestore write
  if (rest.buildId) {
    console.log('[updateApp] Writing buildId to Firestore:', {
      appId,
      buildId: rest.buildId,
      buildIdType: typeof rest.buildId,
      buildIdLength: rest.buildId.length,
      buildIdChars: rest.buildId.split(''),
      fullPayload: rest
    });
  }

  const batch = db.batch();

  // Use set(..., { merge: true }) instead of update() so that writes are
  // idempotent and won't fail with NOT_FOUND if the document doesn't exist.
  // This matches the semantics used elsewhere in the codebase where we
  // tolerate creating missing documents on first write.
  batch.set(appsCol.doc(appId), rest, { merge: true });

  if (likesCount !== undefined || playsCount !== undefined) {
    const metricsCol = await getExistingCollection('metrics');
    const metricsPayload: Partial<Metric> = {};
    if (likesCount !== undefined) metricsPayload.likes = likesCount;
    if (playsCount !== undefined) metricsPayload.plays = playsCount;
    // Metrics should also be merged to avoid NOT_FOUND for new apps
    batch.set(metricsCol.doc(appId), metricsPayload, { merge: true });
  }

  await batch.commit();
}

export async function getListingByBuildId(buildId: string): Promise<App | undefined> {
  const apps = await readApps();
  return apps.find((a) => a.buildId === buildId);
}

export async function readOglasi(): Promise<Oglas[]> {
  const col = await ensureOglasiCollection();
  const snap = await col.get();
  return snap.docs
    .filter((d: any) => d.id !== OGLASI_SEED_DOC)
    .map((d: any) => {
      const data = d.data() as Oglas;
      data.reports = data.reports ?? [];
      return data;
    });
}

export async function writeOglasi(items: Oglas[]): Promise<void> {
  const col = await ensureOglasiCollection();
  const snap = await col.get();
  const batch = db.batch();
  snap.docs.forEach((d: any) => batch.delete(d.ref));
  items.forEach((it) =>
    batch.set(col.doc(String(it.id)), { ...it, reports: it.reports ?? [] })
  );
  if (items.length === 0) {
    batch.set(col.doc(OGLASI_SEED_DOC), { createdAt: Date.now(), seed: true });
  }
  await batch.commit();
}

export async function listAppsByOwner(uid: string): Promise<App[]> {
  const appsSnap = await (await getExistingCollection('apps')).where('ownerUid', '==', uid).get();
  const results: App[] = [];
  for (const doc of appsSnap.docs) {
    const metricDoc = await (await getExistingCollection('metrics')).doc(doc.id).get();
    results.push(
      attachMetrics(doc.data(), metricDoc.exists ? (metricDoc.data() as Metric) : undefined)
    );
  }
  return results;
}

export async function readAppKv(appId: string): Promise<Record<string, any>> {
  const col = await getSubcollection(db.collection('apps').doc(appId), 'kv');
  const snap = await col.get();
  const obj: Record<string, any> = {};
  snap.docs.forEach((d: any) => {
    obj[d.id] = d.data().value;
  });
  return obj;
}

export async function writeAppKv(appId: string, data: Record<string, any>): Promise<void> {
  // Only create the 'kv' subcollection if it doesn't yet exist under the app
  const col = await getSubcollection(db.collection('apps').doc(appId), 'kv');
  const snap = await col.get();
  const batch = db.batch();
  snap.docs.forEach((d: any) => batch.delete(d.ref));
  for (const [k, v] of Object.entries(data)) {
    batch.set(col.doc(k), { value: v });
  }
  await batch.commit();
}

export async function listEntitlements(userId?: string): Promise<Entitlement[]> {
  const col = await getExistingCollection('entitlements');
  const snap = userId
    ? await col.where('userId', '==', userId).get()
    : await col.get();
  return snap.docs.map((d: any) => d.data() as Entitlement);
}

export async function hasAppSubscription(
  userId: string,
  appId: string,
): Promise<boolean> {
  const snap = await (
    await getExistingCollection('entitlements')
  )
    .where('userId', '==', userId)
    .where('feature', '==', 'app-subscription')
    .where('data.appId', '==', appId)
    .get();
  const subIds = new Set<string>();
  for (const d of snap.docs) {
    const ent = d.data() as Entitlement;
    if (ent.active === false) continue;
    const subId = ent.data?.stripeSubscriptionId as string | undefined;
    if (subId) subIds.add(subId);
  }
  if (!subIds.size) return false;
  const subs = await Promise.all(
    [...subIds].map((id) => getSubscription(id)),
  );
  return subs.some(
    (sub) =>
      sub &&
      ['active', 'trialing', 'past_due'].includes(sub.status) &&
      sub.currentPeriodEnd > Date.now(),
  );
}

export async function hasCreatorAllAccess(
  userId: string,
  creatorId: string,
): Promise<boolean> {
  const snap = await (
    await getExistingCollection('entitlements')
  )
    .where('userId', '==', userId)
    .where('feature', '==', 'creator-all-access')
    .where('data.creatorId', '==', creatorId)
    .get();
  const subIds = new Set<string>();
  for (const d of snap.docs) {
    const ent = d.data() as Entitlement;
    if (ent.active === false) continue;
    const subId = ent.data?.stripeSubscriptionId as string | undefined;
    if (subId) subIds.add(subId);
  }
  if (!subIds.size) return false;
  const subs = await Promise.all(
    [...subIds].map((id) => getSubscription(id)),
  );
  return subs.some(
    (sub) =>
      sub &&
      ['active', 'trialing', 'past_due'].includes(sub.status) &&
      sub.currentPeriodEnd > Date.now(),
  );
}

export async function getEntitlement(id: string): Promise<Entitlement | undefined> {
  const doc = await (await getExistingCollection('entitlements')).doc(id).get();
  return doc.exists ? (doc.data() as Entitlement) : undefined;
}

export async function upsertEntitlement(it: Entitlement): Promise<void> {
  const entRef = (await getExistingCollection('entitlements')).doc(it.id);
  const userRef = db.collection('users').doc(it.userId).collection('entitlements').doc(it.id);
  const batch = db.batch();
  batch.set(entRef, it);
  batch.set(userRef, it);
  await batch.commit();
}

export async function removeEntitlement(id: string, userId: string): Promise<void> {
  const entRef = (await getExistingCollection('entitlements')).doc(id);
  const userRef = db.collection('users').doc(userId).collection('entitlements').doc(id);
  const batch = db.batch();
  batch.delete(entRef);
  batch.delete(userRef);
  await batch.commit();
}

export async function writeEntitlements(items: Entitlement[]): Promise<void> {
  const col = await getExistingCollection('entitlements');
  const snap = await col.get();
  const batch = db.batch();
  snap.docs.forEach((d: any) => batch.delete(d.ref));
  items.forEach((it) => batch.set(col.doc(it.id), it));
  await batch.commit();
}

export type AdsSettings = {
  disabled: boolean;
  updatedAt?: number;
  updatedBy?: string | null;
};

const ADS_SETTINGS_DOC = 'ads';

function resolveDefaultAdsDisabled(): boolean {
  if (process.env.ADS_DISABLED_DEFAULT === 'true') return true;
  if (process.env.NEXT_PUBLIC_ADS_DISABLED === 'true') return true;
  return false;
}

export async function readAdsSettings(): Promise<AdsSettings> {
  const doc = await db.collection('settings').doc(ADS_SETTINGS_DOC).get();
  if (!doc.exists) {
    return { disabled: resolveDefaultAdsDisabled() };
  }
  const data = doc.data() as Record<string, any>;
  const updatedByRaw = data?.updatedBy;
  return {
    disabled: Boolean(data?.disabled),
    updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : undefined,
    updatedBy:
      typeof updatedByRaw === 'string' && updatedByRaw.trim()
        ? updatedByRaw.trim()
        : updatedByRaw ?? null,
  };
}

export async function writeAdsSettings(
  update: { disabled: boolean; updatedBy?: string | null },
): Promise<AdsSettings> {
  const next: AdsSettings = {
    disabled: Boolean(update.disabled),
    updatedAt: Date.now(),
    updatedBy: update.updatedBy ?? null,
  };
  await db.collection('settings').doc(ADS_SETTINGS_DOC).set(next, { merge: true });
  return next;
}

export type AdsSlotEntry = {
  enabled: boolean;
  updatedAt?: number;
  updatedBy?: string | null;
};

const ADS_SLOTS_DOC = 'adsSlots';

function normalizeSlotRecord(value: any): AdsSlotEntry {
  return {
    enabled: Boolean(value?.enabled),
    updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : undefined,
    updatedBy:
      typeof value?.updatedBy === 'string' && value.updatedBy.trim()
        ? value.updatedBy.trim()
        : value?.updatedBy ?? null,
  };
}

export async function readAdsSlotConfig(): Promise<Record<string, AdsSlotEntry>> {
  const doc = await db.collection('settings').doc(ADS_SLOTS_DOC).get();
  if (!doc.exists) return {};
  const rawSlots = (doc.data() as any)?.slots;
  if (!rawSlots || typeof rawSlots !== 'object') return {};
  const normalized: Record<string, AdsSlotEntry> = {};
  for (const [key, value] of Object.entries(rawSlots)) {
    if (!key) continue;
    normalized[key] = normalizeSlotRecord(value);
  }
  return normalized;
}

export async function writeAdsSlotConfig(
  updates: Record<string, { enabled: boolean; updatedBy?: string | null }>,
): Promise<Record<string, AdsSlotEntry>> {
  const docRef = db.collection('settings').doc(ADS_SLOTS_DOC);
  const nextSlots = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const currentSlots =
      (snap.exists && (snap.data() as any)?.slots && typeof (snap.data() as any).slots === 'object'
        ? (snap.data() as any).slots
        : {}) ?? {};
    const merged: Record<string, AdsSlotEntry> = {};
    for (const [key, value] of Object.entries(currentSlots)) {
      merged[key] = normalizeSlotRecord(value);
    }
    const timestamp = Date.now();
    for (const [key, update] of Object.entries(updates)) {
      if (!key) continue;
      merged[key] = {
        enabled: Boolean(update.enabled),
        updatedAt: timestamp,
        updatedBy: update.updatedBy ?? null,
      };
    }
    tx.set(docRef, { slots: merged }, { merge: true });
    return merged;
  });
  return nextSlots;
}

export type EarlyAccessSettings = {
  id: string;
  isActive: boolean;
  startsAt?: number;
  durationDays?: number;
  perUserDurationDays?: number;
  updatedAt?: number;
  updatedBy?: string | null;
};

const EARLY_ACCESS_SETTINGS_DOC = 'earlyAccess';
const MIN_DURATION_DAYS = 1;

function toMillis(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate) && asDate > 0) {
      return asDate;
    }
  }
  return undefined;
}

function toPositiveInteger(value: unknown, fallback?: number): number | undefined {
  if (value == null) return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.max(0, Math.floor(num));
  return rounded > 0 ? rounded : fallback;
}

function normalizeEarlyAccessDoc(data: Record<string, any> | undefined | null): EarlyAccessSettings | null {
  if (!data) return null;
  const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : undefined;
  if (!id) return null;
  const isActive = Boolean(data.isActive);
  const startsAt = toMillis(data.startsAt);
  const durationDays = toPositiveInteger(data.durationDays, undefined);
  const perUserDurationDays = toPositiveInteger(data.perUserDurationDays, durationDays);
  const updatedAt =
    typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt) ? data.updatedAt : undefined;
  const updatedBy =
    typeof data.updatedBy === 'string' && data.updatedBy.trim()
      ? data.updatedBy.trim()
      : data.updatedBy ?? null;
  return {
    id,
    isActive,
    startsAt,
    durationDays,
    perUserDurationDays,
    updatedAt,
    updatedBy,
  };
}

export async function readEarlyAccessSettings(): Promise<EarlyAccessSettings | null> {
  const doc = await db.collection('settings').doc(EARLY_ACCESS_SETTINGS_DOC).get();
  if (!doc.exists) return null;
  return normalizeEarlyAccessDoc(doc.data() as Record<string, any>);
}

export async function writeEarlyAccessSettings(
  input: {
    id: string;
    isActive: boolean;
    startsAt?: number;
    durationDays?: number;
    perUserDurationDays?: number;
    updatedBy?: string | null;
  },
): Promise<EarlyAccessSettings> {
  const id = input.id.trim();
  if (!id) {
    throw new Error('early_access_id_required');
  }
  const durationDays = toPositiveInteger(
    input.durationDays,
    input.isActive ? MIN_DURATION_DAYS : undefined,
  );
  const perUserDurationDays = toPositiveInteger(
    input.perUserDurationDays,
    durationDays ?? MIN_DURATION_DAYS,
  );
  const startsAt = toMillis(input.startsAt) ?? Date.now();
  const payload = {
    id,
    isActive: Boolean(input.isActive),
    startsAt,
    durationDays: durationDays ?? MIN_DURATION_DAYS,
    perUserDurationDays: perUserDurationDays ?? durationDays ?? MIN_DURATION_DAYS,
    updatedAt: Date.now(),
    updatedBy: input.updatedBy ?? null,
  };
  await db.collection('settings').doc(EARLY_ACCESS_SETTINGS_DOC).set(payload, { merge: true });
  return payload;
}

type AdsTelemetryEventInput = {
  type: string;
  slotKey?: string | null;
  placement?: string | null;
  surface?: string | null;
};

function sanitizeTelemetryKey(value?: string | null): string | null {
  if (!value) return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || null;
}

export async function recordAdsTelemetryEvents(
  events: AdsTelemetryEventInput[],
): Promise<void> {
  if (!Array.isArray(events) || events.length === 0) return;
  const valid = events.filter((evt) => evt && typeof evt.type === 'string');
  if (!valid.length) return;
  const now = Date.now();
  const dateId = new Date(now).toISOString().slice(0, 10);
  const docRef = db.collection('telemetry').doc('ads').collection('daily').doc(dateId);

  const counters = new Map<string, number>();
  const bump = (field: string, value = 1) => {
    if (!field) return;
    counters.set(field, (counters.get(field) ?? 0) + value);
  };

  bump('totalEvents', valid.length);

  for (const event of valid) {
    const typeKey = sanitizeTelemetryKey(event.type) ?? 'unknown';
    bump(`events.${typeKey}`);
    const slotKey = sanitizeTelemetryKey(event.slotKey);
    if (slotKey) {
      bump(`slots.${slotKey}.total`);
      bump(`slots.${slotKey}.${typeKey}`);
    }
    const placementKey = sanitizeTelemetryKey(event.placement || event.surface);
    if (placementKey) {
      bump(`placements.${placementKey}.total`);
      bump(`placements.${placementKey}.${typeKey}`);
    }
  }

  await db.runTransaction(async (tx) => {
    const update: Record<string, any> = { updatedAt: now, dateId };
    for (const [field, value] of counters.entries()) {
      update[field] = FieldValue.increment(value);
    }
    tx.set(docRef, update, { merge: true });
  });
}

export type AdsTelemetryCounts = Record<string, number>;

export type AdsTelemetryPerKey = Record<string, AdsTelemetryCounts & { total?: number }>;

export type AdsTelemetryDailyDoc = {
  dateId: string;
  totalEvents: number;
  events: AdsTelemetryCounts;
  slots: AdsTelemetryPerKey;
  placements: AdsTelemetryPerKey;
};

function sanitizeCounts(value: any): AdsTelemetryCounts {
  if (!value || typeof value !== 'object') return {};
  const out: AdsTelemetryCounts = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = raw;
    }
  }
  return out;
}

function sanitizePerKey(value: any): AdsTelemetryPerKey {
  if (!value || typeof value !== 'object') return {};
  const out: AdsTelemetryPerKey = {};
  for (const [key, bucket] of Object.entries(value)) {
    if (!bucket || typeof bucket !== 'object') continue;
    out[key] = sanitizeCounts(bucket);
  }
  return out;
}

export async function readAdsTelemetryDays(limit = 7): Promise<AdsTelemetryDailyDoc[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 30);
  const snap = await db
    .collection('telemetry')
    .doc('ads')
    .collection('daily')
    .orderBy('dateId', 'desc')
    .limit(safeLimit)
    .get();
  const days: AdsTelemetryDailyDoc[] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() as Record<string, any>) ?? {};
    const dateId =
      typeof data.dateId === 'string' && data.dateId.trim().length > 0
        ? data.dateId.trim()
        : doc.id;
    days.push({
      dateId,
      totalEvents: typeof data.totalEvents === 'number' ? data.totalEvents : 0,
      events: sanitizeCounts(data.events),
      slots: sanitizePerKey(data.slots),
      placements: sanitizePerKey(data.placements),
    });
  }
  return days;
}

export async function incrementAppPlay(appId: string): Promise<void> {
  const ref = (await getExistingCollection('metrics')).doc(appId);
  await ref.set({ plays: FieldValue.increment(1) }, { merge: true });
}

export async function setAppLike(appId: string, uid: string, like: boolean): Promise<void> {
  // Lazily create 'likes' subcollection if necessary
  const likeRef = (await getSubcollection(db.collection('apps').doc(appId), 'likes')).doc(uid);
  const metricRef = (await getExistingCollection('metrics')).doc(appId);
  await db.runTransaction(async (t: any) => {
    const likeDoc = await t.get(likeRef);
    if (like) {
      if (!likeDoc.exists) {
        t.set(likeRef, { liked: true });
        t.set(metricRef, { likes: FieldValue.increment(1) }, { merge: true });
      }
    } else {
      if (likeDoc.exists) {
        t.delete(likeRef);
        t.set(metricRef, { likes: FieldValue.increment(-1) }, { merge: true });
      }
    }
  });
}

export async function hasUserLikedApp(appId: string, uid: string): Promise<boolean> {
  if (!uid) return false;
  const doc = await db.collection('apps').doc(appId).collection('likes').doc(uid).get();
  return doc.exists;
}

export async function getUserLikesForApps(
  appIds: string[],
  uid: string,
): Promise<Set<string>> {
  const liked = new Set<string>();
  if (!uid || !appIds.length) return liked;
  await Promise.all(
    appIds.map(async (appId) => {
      try {
        const doc = await db.collection('apps').doc(appId).collection('likes').doc(uid).get();
        if (doc.exists) liked.add(appId);
      } catch (err) {
        console.warn('[likes] failed_to_check_user_like', { appId, uid, err });
      }
    }),
  );
  return liked;
}

export async function writeScore(
  appId: string,
  uid: string,
  score: number
): Promise<void> {
  // Scores subcollection is created on first write if absent
  const scores = await getSubcollection(db.collection('apps').doc(appId), 'scores');
  await scores.doc(uid).set({ score, ts: Date.now() });
}

export async function readTopScores(
  appId: string,
  limit = 10
): Promise<Array<{ uid: string; score: number }>> {
  const snap = await db
    .collection('apps')
    .doc(appId)
    .collection('scores')
    .orderBy('score', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d: any) => ({ uid: d.id, ...(d.data() as any) }));
}

export async function getStripeCustomerIdForUser(
  userId: string
): Promise<string | undefined> {
  const doc = await (await getExistingCollection('stripe_customers')).doc(userId).get();
  return doc.exists ? (doc.data() as any).stripeCustomerId : undefined;
}

export async function setStripeCustomerIdForUser(
  userId: string,
  customerId: string
): Promise<void> {
  await (await getExistingCollection('stripe_customers')).doc(userId).set({ stripeCustomerId: customerId });
}

export async function getUserIdByStripeCustomerId(
  customerId: string,
): Promise<string | undefined> {
  const snap = await (
    await getExistingCollection('stripe_customers')
  )
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();
  return snap.empty ? undefined : snap.docs[0].id;
}

export async function getStripeAccountId(
  creatorId: string,
): Promise<string | undefined> {
  const doc = await (await getExistingCollection('stripe_accounts')).doc(creatorId).get();
  return doc.exists ? (doc.data() as any).accountId : undefined;
}

export async function setStripeAccountId(
  creatorId: string,
  accountId: string,
): Promise<void> {
  await (await getExistingCollection('stripe_accounts')).doc(creatorId).set({ accountId });
}

export type PaymentRecord = {
  id: string;
  userId?: string;
  eventType?: string;
  timestamp?: number;
  [key: string]: any;
};

export async function addPaymentRecord(data: PaymentRecord): Promise<void> {
  await (await getExistingCollection('payments')).doc(data.id).set(data, { merge: true });
}

export type DonationAliasStatus = 'pending' | 'confirmed' | 'anonymous';

export type DonationRecord = {
  id: string;
  campaignId: string;
  amount: number;
  currency: string;
  email?: string | null;
  alias?: string | null;
  aliasStatus: DonationAliasStatus;
  aliasSetAt?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
};

type DonationPaymentInput = {
  paymentIntentId: string;
  campaignId: string;
  amount: number;
  currency: string;
  email?: string | null;
  metadata?: Record<string, any>;
};

export async function recordDonationPayment(
  data: DonationPaymentInput,
): Promise<DonationRecord> {
  const col = await getExistingCollection('donations');
  const ref = col.doc(data.paymentIntentId);
  let record: DonationRecord | undefined;
  await db.runTransaction(async (t: any) => {
    const snap = await t.get(ref);
    const now = Date.now();
    if (!snap.exists) {
      const fresh: DonationRecord = {
        id: data.paymentIntentId,
        campaignId: data.campaignId,
        amount: data.amount,
        currency: data.currency,
        email: data.email ?? null,
        alias: null,
        aliasStatus: 'pending',
        createdAt: now,
        updatedAt: now,
        metadata: data.metadata,
      };
      t.set(ref, fresh);
      record = fresh;
      return;
    }
    const existing = snap.data() as DonationRecord;
    const patch: Record<string, any> = {
      campaignId: data.campaignId,
      amount: data.amount,
      currency: data.currency,
      updatedAt: now,
    };
    if (data.email !== undefined) {
      patch.email = data.email;
    }
    if (data.metadata) {
      patch.metadata = data.metadata;
    }
    if (!existing.createdAt) {
      patch.createdAt = now;
    }
    if (!existing.id) {
      patch.id = data.paymentIntentId;
    }
    t.set(ref, patch, { merge: true });
    record = {
      ...existing,
      ...patch,
      id: existing.id || data.paymentIntentId,
      createdAt: existing.createdAt || now,
    };
  });
  if (!record) {
    throw new Error('donation_record_failed');
  }
  return record;
}

export async function updateDonationAlias(
  paymentIntentId: string,
  aliasValue: string | null,
  status: DonationAliasStatus,
): Promise<DonationRecord> {
  const ref = (await getExistingCollection('donations')).doc(paymentIntentId);
  let record: DonationRecord | undefined;
  await db.runTransaction(async (t: any) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      throw new Error('donation_not_found');
    }
    const now = Date.now();
    const existing = snap.data() as DonationRecord;
    const patch: Record<string, any> = {
      alias: aliasValue,
      aliasStatus: status,
      aliasSetAt: now,
      updatedAt: now,
    };
    t.update(ref, patch);
    record = { ...existing, ...patch };
  });
  if (!record) {
    throw new Error('donation_alias_update_failed');
  }
  return record;
}

export async function getDonationByPaymentIntent(
  paymentIntentId: string,
): Promise<DonationRecord | undefined> {
  const doc = await (await getExistingCollection('donations')).doc(paymentIntentId).get();
  if (!doc.exists) return undefined;
  const data = doc.data() as DonationRecord;
  return { ...data, id: data.id ?? doc.id };
}

export async function listDonations(
  options: { limit?: number; campaignId?: string } = {},
): Promise<DonationRecord[]> {
  const { limit = 500, campaignId } = options;
  const col = await getExistingCollection('donations');
  let query: any = col.orderBy('createdAt', 'desc');
  if (campaignId) {
    query = query.where('campaignId', '==', campaignId);
  }
  const snap = await query.limit(limit).get();
  return snap.docs.map((doc: any) => {
    const data = doc.data() as DonationRecord;
    return { ...data, id: data.id ?? doc.id };
  });
}

export type BillingEvent = {
  userId?: string;
  eventType: string;
  subscriptionId?: string | null;
  amount?: number;
  ts: number;
  status?: string;
  details?: any;
};

export async function logBillingEvent(data: BillingEvent): Promise<void> {
  await (await getExistingCollection('billing_events')).add(data);
}

export async function logUnmappedBillingEvent(data: any): Promise<void> {
  await (await getExistingCollection('billing_events_unmapped')).add(data);
}

export async function listBillingEventsForUser(
  userId: string,
): Promise<BillingEvent[]> {
  const snap = await (
    await getExistingCollection('billing_events')
  )
    .where('userId', '==', userId)
    .orderBy('ts', 'desc')
    .get();
  return snap.docs.map((d: any) => d.data() as BillingEvent);
}

export type SubscriptionRecord = {
  id: string;
  userId: string;
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  customerId?: string;
  priceId?: string | null;
};

export async function upsertSubscription(
  data: SubscriptionRecord,
): Promise<void> {
  const { id, userId, ...rest } = data;
  await (await getExistingCollection('subscriptions'))
    .doc(id)
    .set({ userId, ...rest }, { merge: true });
}

export async function upsertUserSubscription(
  userId: string,
  data: SubscriptionRecord,
): Promise<void> {
  const { id, userId: _userId, ...rest } = data; // Destrukturiramo i userId da ne bude u 'rest'
  const col = await getSubcollection(
    (await getExistingCollection('users')).doc(userId),
    'subscriptions',
  );
  await col.doc(id).set({ userId, ...rest }, { merge: true });
}

export async function getSubscription(
  id: string,
): Promise<SubscriptionRecord | undefined> {
  const doc = await (await getExistingCollection('subscriptions')).doc(id).get();
  return doc.exists ? (doc.data() as SubscriptionRecord) : undefined;
}

export async function hasSubscriptionByPriceId(
  userId: string,
  priceId: string,
): Promise<boolean> {
  const snap = await (await getExistingCollection('subscriptions'))
    .where('userId', '==', userId)
    .where('priceId', '==', priceId)
    .where('status', 'in', ['active', 'trialing', 'past_due'])
    .limit(1)
    .get();
  if (snap.empty) return false;
  const sub = snap.docs[0].data() as SubscriptionRecord;
  if (sub.currentPeriodEnd <= Date.now()) {
    return false;
  }
  return true;
}

const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function hasProcessedEvent(eventId: string): Promise<boolean> {
  const doc = await (await getExistingCollection('stripe_events'))
    .doc(eventId)
    .get();
  if (!doc.exists) return false;
  const data = doc.data() as any;
  const ts = data.ts instanceof Timestamp ? data.ts.toMillis() : data.ts;
  if (!ts || Date.now() - ts > EVENT_TTL_MS) {
    return false;
  }
  return true;
}

export async function markEventProcessed(eventId: string): Promise<void> {
  await (await getExistingCollection('stripe_events'))
    .doc(eventId)
    .set({
      processed: true,
      ts: Date.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + EVENT_TTL_MS),
    });
}

// Seed a default creator so profile pages load during development and tests
async function ensureAmirSerbicCreator(): Promise<void> {
  try {
    await ensureCollections(['creators']);
    const col = await getExistingCollection('creators');
    const docRef = col.doc('amir.serbic');
    const data = {
      id: 'amir.serbic',
      handle: 'amir.serbic',
      displayName: 'Amir Serbic',
      photoURL: 'https://avatars.githubusercontent.com/u/583231?v=4',
      allAccessPrice: 0,
    };
    const doc = await docRef.get();
    if (!doc.exists || doc.data()?.photoURL !== data.photoURL) {
      await docRef.set(data, { merge: true });
    }
  } catch {}
}
