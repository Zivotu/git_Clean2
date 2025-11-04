import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getCreatorByHandle, readApps, readCreators, type Creator } from '../db.js';
import type { AppRecord } from '../types.js';

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
    const creators = await readCreators();
    const match = creators.find((c) => c.id === uid);
    let payload: any;
    let appsCount = 0;
    if (match) {
      const apps = await readApps();
      const owned = apps.filter((app) => matchesCreator(app, match));
      appsCount = owned.length;
      payload = cleanupCreator(match, appsCount);
    } else {
      payload = cleanupCreator(
        {
          id: uid,
          handle: uid,
        } as Creator,
        0,
      );
    }
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

  // Primary routes
  app.route({ method: ['GET', 'HEAD'], url: '/creators/id/:uid', handler: byIdHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/creators/:handle/apps', handler: appsHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/creators/:handle', handler: byHandleHandler });

  // Defensive aliases when '/api' prefix stripping isn't applied by upstream proxy
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/id/:uid', handler: byIdHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/:handle/apps', handler: appsHandler });
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/:handle', handler: byHandleHandler });
}
