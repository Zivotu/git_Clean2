import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  db,
  getCreatorByHandle,
  getCreatorById,
  readApps,
  readCreators,
  upsertCreator,
  type Creator,
} from '../db.js';
import type { AppRecord } from '../types.js';
import { requireRole } from '../middleware/auth.js';
import { ensureCreatorAllAccessProductPrice } from '../billing/products.js';
import { getConnectStatus, getCreatorSubscriptionMetrics } from '../billing/service.js';

function toStringId(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return undefined;
}

function normalizeLang(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const norm = value.trim().toLowerCase();
  if (!norm) return undefined;
  return norm.slice(0, 2);
}

function localizeApp(record: AppRecord, lang?: string): AppRecord {
  if (!lang) return record;
  const translations = (record as any).translations as
    | Record<string, { title?: string; description?: string }>
    | undefined;
  if (!translations) return record;
  const tr = translations[lang];
  if (!tr) return record;
  const next: AppRecord = {
    ...record,
    title: tr.title ?? record.title,
    description: tr.description ?? record.description,
  };
  return next;
}

function matchesCreator(app: AppRecord, creator: Creator): boolean {
  const ownerUid =
    toStringId(app.author?.uid) ??
    toStringId((app as any).ownerUid) ??
    toStringId((app as any).authorUid);
  if (ownerUid && ownerUid === creator.id) return true;
  const handle =
    toStringId((app.author as any)?.handle) ??
    toStringId((app.author as any)?.username) ??
    toStringId((app as any).creatorHandle);
  if (handle && handle.toLowerCase() === creator.handle.toLowerCase()) return true;
  return false;
}

function normalizePreview(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

const HANDLE_REGEX = /^[a-z0-9_-]{3,30}$/;

function normalizeHandleInput(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!HANDLE_REGEX.test(trimmed)) return undefined;
  return trimmed;
}

function mapAppPayload(app: AppRecord): Record<string, any> {
  return {
    id: app.id,
    slug: app.slug,
    title: app.title,
    description: app.description,
    previewUrl:
      normalizePreview((app as any).previewUrl) ??
      normalizePreview((app as any).preview_url) ??
      normalizePreview((app as any).previewImage),
    playUrl: (app as any).playUrl ?? (app as any).play_url ?? (app as any).playLink,
    author: app.author,
    visibility: app.visibility,
    status: (app as any).status,
    state: (app as any).state,
    likesCount: (app as any).likesCount ?? 0,
    playsCount: (app as any).playsCount ?? 0,
    createdAt: (app as any).createdAt,
    updatedAt: (app as any).updatedAt,
  };
}

function cleanupCreator(data: Creator | undefined, appsCount: number): any {
  if (!data) return undefined;
  const photo =
    (data as any).photoURL ??
    (data as any).photoUrl ??
    (data as any).photo ??
    (data as any).avatarUrl ??
    (data as any).avatar ??
    undefined;
  return {
    id: data.id,
    handle: data.handle,
    displayName: (data as any).displayName ?? (data as any).name ?? data.handle,
    bio: (data as any).bio,
    allAccessPrice: (data as any).allAccessPrice,
    stats: {
      apps: appsCount,
      followers: (data as any).followers ?? (data as any).followersCount ?? 0,
    },
    photoURL: photo,
    avatarUrl: photo,
  };
}

export default async function creatorsRoutes(app: FastifyInstance) {
  const byIdHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as { uid: string };
    let creator = await getCreatorById(uid);
    if (!creator) {
      const creators = await readCreators();
      creator = creators.find((c) => c.id === uid);
    }
    if (!creator) {
      creator = { id: uid, handle: uid } as Creator;
    }
    const apps = await readApps();
    const owned = apps.filter((app) => matchesCreator(app, creator!));
    const appsCount = owned.length;
    const payload = cleanupCreator(creator, appsCount);
    return reply.send({
      ...payload,
      handle: payload?.handle ?? uid,
      stats: {
        ...(payload?.stats ?? {}),
        apps: appsCount,
      },
    });
  };

  const appsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { handle } = req.params as { handle: string };
    const lang = normalizeLang((req.query as any)?.lang);
    let creator = await getCreatorByHandle(handle);
    let stub = false;
    if (!creator) {
      const creators = await readCreators();
      creator = creators.find((c) => c.id === handle);
    }
    if (!creator) {
      creator = { id: handle, handle } as Creator;
      stub = true;
    }
    const apps = await readApps();
    const filtered = apps
      .filter((app) => matchesCreator(app, creator))
      .filter((app) => !(app as any).deletedAt)
      .filter((app) => {
        const state = (app as any).state;
        const status = (app as any).status;
        return state === 'active' || status === 'published';
      })
      .map((app) => localizeApp(app, lang))
      .map(mapAppPayload);
    if (!filtered.length && stub) {
      // If this was a stub creator and we have no apps, mirror previous behaviour with 404.
      return reply.code(404).send({ error: 'creator_not_found' });
    }
    return reply.send({ items: filtered, count: filtered.length });
  };

  const byHandleHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { handle } = req.params as { handle: string };
    let creator = await getCreatorByHandle(handle);
    if (!creator) {
      const creators = await readCreators();
      creator = creators.find((c) => c.id === handle);
    }
    if (!creator) {
      creator = { id: handle, handle } as Creator;
    }
    const apps = await readApps();
    const owned = apps.filter((app) => matchesCreator(app, creator));
    return reply.send(cleanupCreator(creator, owned.length));
  };

  const updateByHandleHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const handle = ((req.params as any)?.handle ?? '').toString().trim();
    if (!handle) {
      return reply.code(400).send({ error: 'invalid_handle' });
    }
    const uid = req.authUser?.uid;
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    let creator = await getCreatorByHandle(handle);
    if (!creator) {
      return reply.code(404).send({ error: 'creator_not_found' });
    }
    const body = (req.body as any) ?? {};
    const ownerId = creator.id || (creator as any)?.uid || (creator as any)?.ownerUid;
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser?.claims as any)?.admin === true;
    const isOwner = ownerId && uid === ownerId;
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    let mutated = false;
    const now = Date.now();
    if (Object.prototype.hasOwnProperty.call(body, 'allAccessPrice')) {
      const priceCandidate = body.allAccessPrice;
      if (typeof priceCandidate !== 'number' || !Number.isFinite(priceCandidate) || priceCandidate < 0) {
        return reply.code(400).send({ error: 'invalid_price' });
      }
      if (!ownerId) {
        return reply.code(400).send({ error: 'creator_missing_id' });
      }
      if (priceCandidate > 0) {
        try {
          const status = await getConnectStatus(ownerId);
          if (!status.payouts_enabled || (status.requirements_due ?? 0) > 0) {
            return reply.code(403).send({ error: 'creator_not_onboarded' });
          }
        } catch (err) {
          req.log.error({ err, creatorId: ownerId }, 'creator_connect_status_failed');
          return reply.code(500).send({ error: 'connect_status_failed' });
        }
      }
      creator = { ...creator, allAccessPrice: priceCandidate, allAccessPriceUpdatedAt: now } as Creator;
      if (priceCandidate <= 0) {
        delete (creator as any).stripeAllAccessPriceId;
        delete (creator as any).stripeAllAccessProductId;
      }
      mutated = true;
    }
    if (!mutated) {
      return reply.code(400).send({ error: 'no_changes' });
    }
    let saved = creator;
    try {
      await upsertCreator(saved);
      if (typeof saved.allAccessPrice === 'number' && saved.allAccessPrice > 0) {
        saved = await ensureCreatorAllAccessProductPrice(saved);
      }
    } catch (err) {
      req.log.error({ err, handle, creatorId: ownerId }, 'creator_update_failed');
      return reply.code(500).send({ error: 'creator_update_failed' });
    }
    const apps = await readApps();
    const owned = apps.filter((app) => matchesCreator(app, saved));
    return reply.send({ ok: true, creator: cleanupCreator(saved, owned.length) });
  };

  const updateMyHandleHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid;
    if (!uid) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const body = (req.body as any) ?? {};
    const normalized = normalizeHandleInput(body.handle);
    if (!normalized) {
      return reply.code(400).send({ error: 'invalid_handle' });
    }
    const existing = await getCreatorByHandle(normalized);
    if (existing && existing.id && existing.id !== uid) {
      return reply.code(409).send({ error: 'handle_taken' });
    }
    let creator = await getCreatorById(uid);
    if (!creator) {
      creator = { id: uid, handle: normalized } as Creator;
    } else {
      creator = { ...creator, id: uid, handle: normalized };
    }
    try {
      await upsertCreator(creator);
    } catch (err) {
      req.log.error({ err, uid, handle: normalized }, 'creator_handle_upsert_failed');
      return reply.code(500).send({ error: 'handle_update_failed' });
    }
    try {
      await db.collection('users').doc(uid).set({ handle: normalized }, { merge: true });
    } catch (err) {
      req.log.error({ err, uid }, 'user_handle_update_failed');
      return reply.code(500).send({ error: 'handle_update_failed' });
    }
    return reply.send({ ok: true, handle: normalized });
  };

  // Primary routes
  app.route({ method: ['GET', 'HEAD'], url: '/creators/id/:uid', handler: byIdHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/creators/:handle/apps', handler: appsHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/creators/:handle', handler: byHandleHandler });
  app.route({
    method: 'PATCH',
    url: '/creators/:handle',
    handler: updateByHandleHandler,
    preHandler: requireRole(['user', 'admin']),
  });
  app.route({
    method: 'PATCH',
    url: '/creators/me/handle',
    handler: updateMyHandleHandler,
    preHandler: requireRole(['user', 'admin']),
  });

  const metricsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { handle } = req.params as { handle: string };
    let creator = await getCreatorByHandle(handle);
    if (!creator) {
      const creators = await readCreators();
      creator = creators.find((c) => c.id === handle);
    }
    if (!creator) {
      return reply.code(404).send({ error: 'creator_not_found' });
    }
    try {
      const metrics = await getCreatorSubscriptionMetrics(creator.id);
      return reply.send({ metrics });
    } catch (err) {
      (req.log as any)?.error?.({ err, handle }, 'creator_metrics_failed');
      return reply.code(500).send({ error: 'creator_metrics_failed' });
    }
  };

  // Defensive aliases when '/api' prefix stripping isn't applied by upstream proxy
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/id/:uid', handler: byIdHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/:handle/apps', handler: appsHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/:handle', handler: byHandleHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/:handle/metrics', handler: metricsHandler });
  app.route({
    method: 'PATCH',
    url: '/api/creators/:handle',
    handler: updateByHandleHandler,
    preHandler: requireRole(['user', 'admin']),
  });
  app.route({
    method: 'PATCH',
    url: '/api/creators/me/handle',
    handler: updateMyHandleHandler,
    preHandler: requireRole(['user', 'admin']),
  });

  // Metrics endpoint (defensive alias without /api)
  app.route({ method: ['GET', 'HEAD'], url: '/creators/:handle/metrics', handler: metricsHandler });
}
