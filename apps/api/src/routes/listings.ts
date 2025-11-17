import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  readApps,
  writeApps,
  type AppRecord,
  setAppLike,
  getUserLikesForApps,
  hasUserLikedApp,
  incrementAppPlay,
} from '../db.js';
import { notifyAdmins, sendEmail } from '../notifier.js';
import { z } from 'zod';
import { ensureAppProductPrice } from '../billing/products.js';
import { getConnectStatus } from '../billing/service.js';
import { getBuildDir } from '../paths.js';
import { getBucket } from '../storage.js';
import { ensureListingTranslations } from '../lib/translate.js';
import { ensureListingPreview, saveListingPreviewFile, removeExistingPreviewFile } from '../lib/preview.js';
import { normalizeRoomsMode } from '../lib/rooms.js';

const SUPPORTED_LOCALES = ['en', 'hr', 'de'] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];
const SCREENSHOT_URL_LIMIT = 1024;
const SCREENSHOT_SLOT_COUNT = 2;
const MAX_SCREENSHOT_SIZE_BYTES = 1 * 1024 * 1024;

const sanitizeScreenshotUrl = (raw?: unknown) => {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().slice(0, SCREENSHOT_URL_LIMIT);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z]+:\/\//i.test(trimmed)) return '';
  return `https://${trimmed}`;
};

const normalizeScreenshotList = (raw?: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => sanitizeScreenshotUrl(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, SCREENSHOT_SLOT_COUNT);
};

const expandScreenshotSlots = (record: AppRecord | { screenshotUrls?: unknown }): string[] => {
  const normalized = normalizeScreenshotList(record.screenshotUrls);
  return Array.from({ length: SCREENSHOT_SLOT_COUNT }, (_, index) => normalized[index] || '');
};

const isImageMimeType = (mime?: string) => typeof mime === 'string' && /^image\//i.test(mime);

function pickLang(req: FastifyRequest): SupportedLocale | undefined {
  const q = (req.query as any)?.lang as string | undefined;
  const hdr = (req.headers['accept-language'] || '').toString();
  const candidate = (q || hdr.split(',')[0] || '').toLowerCase();
  const norm = candidate.replace(/;.*/, '').slice(0, 2);
  return (SUPPORTED_LOCALES as readonly string[]).includes(norm) ? (norm as SupportedLocale) : undefined;
}

export default async function listingsRoutes(app: FastifyInstance) {
  const listHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { owner, ownerUid } = (req.query as { owner?: string; ownerUid?: string }) || {};
    const ownerId = owner || ownerUid;

    let items: AppRecord[] = await readApps();
    let mutated = false;
    items = items.map((it) => {
      const { next, changed } = ensureListingPreview(it);
      if (changed) mutated = true;
      return next;
    });
    if (mutated) {
      try {
        await writeApps(items);
      } catch (err) {
        req.log?.warn?.({ err }, 'listings_preview_update_failed');
      }
    }

    items = items.filter((a) => !a.deletedAt);

    if (ownerId) {
      items = items.filter(
        (a) => a.author?.uid === ownerId || (a as any).ownerUid === ownerId,
      );
      const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
      const isOwner = req.authUser?.uid === ownerId;
      if (!isOwner && !isAdmin) {
        items = items.filter((a) => a.status === 'published' || a.state === 'active');
      }
    } else {
      items = items.filter((a) => a.status === 'published' || a.state === 'active');
    }

    const viewerUid = req.authUser?.uid;
    let likedByMe: Set<string> | undefined;
    if (viewerUid) {
      try {
        likedByMe = await getUserLikesForApps(
          items.map((it) => it.id),
          viewerUid,
        );
      } catch (err) {
        req.log?.warn?.({ err, viewerUid }, 'listings_like_lookup_failed');
      }
    }

    const itemsWithLikes =
      likedByMe && likedByMe.size
        ? items.map((it) => (likedByMe!.has(it.id) ? { ...it, likedByMe: true } : it))
        : items;

    const lang = pickLang(req);
    if (!lang) return reply.send({ items: itemsWithLikes });
    // Best-effort translate missing items for the requested language
    const out = await Promise.all(
      itemsWithLikes.map(async (it) => {
        try {
          const tr = it.translations?.[lang];
          if (!tr?.title) {
            await ensureListingTranslations(it, [lang]);
          }
          const next = tr?.title ? { ...it, title: tr.title, description: tr.description } : it;
          return next;
        } catch {
          return it;
        }
      }),
    );
    return reply.send({ items: out });
  };

  // Primarna ruta
  app.route({ method: ['GET','HEAD'], url: '/listings', handler: listHandler });

  // Alias za rad iza /api prefiksa (obrambeno, iako hook rješava većinu slučajeva)
  app.route({ method: ['GET','HEAD'], url: '/api/listings', handler: listHandler });

  const DEBUG_LISTING_AUTH = process.env.DEBUG_LISTING_AUTH === '1';

  const getListingHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const apps = await readApps();
    const idx = apps.findIndex(
      (a) => a.slug === slug || String(a.id) === slug,
    );
    if (idx < 0) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    const item = apps[idx];
    if (item.deletedAt) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    const { next: normalizedItem, changed: previewChanged } = ensureListingPreview(item);
    if (previewChanged) {
      apps[idx] = normalizedItem;
      try {
        await writeApps(apps);
      } catch (err) {
        req.log?.warn?.({ err, slug }, 'listing_preview_update_failed');
      }
    }

    const uid = (req.authUser?.uid || (req.query as any)?.uid) as string | undefined;
    const viewerUid = req.authUser?.uid;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isModerator = Boolean(uid && item.moderation?.by === uid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    const isPublic = item.status === 'published' || item.state === 'active';

    if (!isOwner && !isModerator && !isAdmin && !isPublic) {
      return DEBUG_LISTING_AUTH
        ? reply.code(403).send({ ok: false, error: 'not_owner' })
        : reply.code(404).send({ ok: false, error: 'not_found' });
    }

    const result: any = { ...normalizedItem };
    if (viewerUid) {
      try {
        result.likedByMe = await hasUserLikedApp(item.id, viewerUid);
      } catch (err) {
        req.log?.warn?.({ err, slug, uid: viewerUid }, 'listing_like_status_failed');
      }
    }
    // Localize title/description if requested
    const lang = pickLang(req);
    if (lang) {
      try {
        const tr = normalizedItem.translations?.[lang];
        if (!tr?.title) {
          await ensureListingTranslations(normalizedItem, [lang]);
        }
        if (tr?.title) {
          result.title = tr.title;
          result.description = tr.description;
        }
      } catch {}
    }
    if (!isOwner && !isModerator) {
      delete result.moderation;
    }
    return { ok: true, item: result };
  };

  app.get('/listing/:slug', getListingHandler);
  app.route({ method: ['GET', 'HEAD'], url: '/api/listing/:slug', handler: getListingHandler });

  // Upload or replace preview image (owner or admin only)
  const previewUploadHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    const item = apps[idx];
    if (item.deletedAt) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }

    const uid = (req.authUser?.uid || (req.query as any)?.uid) as string | undefined;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return DEBUG_LISTING_AUTH
        ? reply.code(403).send({ ok: false, error: 'not_owner' })
        : reply.code(404).send({ ok: false, error: 'not_found' });
    }

  try {
      const ct = (req.headers['content-type'] || '').toString();
      // Support preset application via JSON body { path: '/preview-presets/..' | '/assets/..' }
      if (/^application\/json/i.test(ct)) {
        const body = (req.body || {}) as any;
        const rawPath = (body?.path || '').toString().trim();
        const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        const allowed = normalized.startsWith('/preview-presets/') || normalized.startsWith('/assets/');
        if (!allowed) {
          return reply.code(400).send({ ok: false, error: 'invalid_preview_path' });
        }
        // Clean up prior uploaded file if it lived under /uploads
        try {
          await removeExistingPreviewFile(item.previewUrl);
        } catch {}
        const next: AppRecord = {
          ...item,
          previewUrl: normalized,
          updatedAt: Date.now(),
        };
        apps[idx] = next;
        await writeApps(apps);
        return reply.send({ ok: true, previewUrl: normalized });
      }

      // Default: multipart upload of a custom file
      if (!/^multipart\/form-data/i.test(ct)) {
        return reply.code(400).send({ ok: false, error: 'preview_upload_required' });
      }
      const file = await (req as any).file?.();
      if (!file) return reply.code(400).send({ ok: false, error: 'no_file' });
      const buf = await file.toBuffer();
      if (!buf.length) return reply.code(400).send({ ok: false, error: 'empty_file' });

      const previewUrl = await saveListingPreviewFile({
        listingId: String(item.id),
        slug: item.slug,
        buffer: buf,
        mimeType: file.mimetype,
        previousUrl: item.previewUrl,
      });

      const next: AppRecord = {
        ...item,
        previewUrl,
        updatedAt: Date.now(),
      };
      apps[idx] = next;
      await writeApps(apps);
      return reply.send({ ok: true, previewUrl });
    } catch (err) {
      // Log full stack to tmp for easier debugging when terminal output is unavailable
      try {
        const p = path.join(process.cwd(), 'tmp', 'preview-upload-errors.log');
        const entry = { ts: new Date().toISOString(), slug, err: (err as any)?.stack || String(err) };
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.appendFile(p, JSON.stringify(entry) + '\n', 'utf8');
      } catch {}
      req.log.error({ err, slug }, 'preview_upload_failed');
      return reply.code(500).send({ ok: false, error: 'preview_failed' });
    }
  };

  // Delete listing (owner or admin). Supports soft delete (default) and hard delete via ?hard=true
  const deleteListingHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const hardParam = (req.query as any)?.hard;
    const hard = String(hardParam || '').toLowerCase() === 'true' || hardParam === true;

    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }

    const item = apps[idx];
    if (item.deletedAt) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    const uid = req.authUser?.uid;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }

    if (hard) {
      const buildId = (item as any).buildId as string | undefined;
      // Remove the app from the list and persist
      const next = apps.filter((_, i) => i !== idx);
      await writeApps(next);

      // Best-effort cleanup of local artifacts
      try {
        if (buildId) {
          const dir = getBuildDir(buildId);
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch (err) {
        req.log.warn({ err, slug, buildId }, 'hard_delete_local_failed');
      }

      // Best-effort cleanup of bucket artifacts
      try {
        if (buildId) {
          const bucket = getBucket();
          await bucket.deleteFiles({ prefix: `builds/${buildId}/` });
        }
      } catch (err) {
        req.log.warn({ err, slug, buildId }, 'hard_delete_bucket_failed');
      }

      return reply.send({ ok: true, hard: true });
    } else {
      // Soft delete: make app non-public and inactive
      const now = Date.now();
      const updated = { ...item, status: 'draft', state: 'inactive', updatedAt: now } as any;
      apps[idx] = updated;
      await writeApps(apps);
      return reply.send({ ok: true, hard: false, item: updated });
    }
  };

  // Toggle like for a listing (auth required)
  const likeHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const uid = req.authUser?.uid;
    if (!uid) return reply.code(401).send({ ok: false, error: 'unauthenticated' });

    const apps = await readApps();
    const appRec = apps.find((a) => a.slug === slug || String(a.id) === slug);
    if (!appRec) return reply.code(404).send({ ok: false, error: 'not_found' });
    if (appRec.deletedAt) return reply.code(404).send({ ok: false, error: 'not_found' });

    const like = Boolean((req.body as any)?.like);
  try {
      await setAppLike(appRec.id, uid, like);
      return reply.send({ ok: true, like });
    } catch (err) {
      req.log.error({ err, slug, uid }, 'like_toggle_failed');
      return reply.code(500).send({ ok: false, error: 'like_failed' });
    }
  };
  app.post('/listing/:slug/like', likeHandler);
  app.post('/api/listing/:slug/like', likeHandler);

  const playCountHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const apps = await readApps();
    const appRec = apps.find((a) => a.slug === slug || String(a.id) === slug);
    if (!appRec || appRec.deletedAt) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    try {
      await incrementAppPlay(appRec.id);
      return reply.send({ ok: true });
    } catch (err) {
      req.log.warn({ err, slug }, 'play_count_increment_failed');
      return reply.code(500).send({ ok: false, error: 'play_increment_failed' });
    }
  };
  app.post('/listing/:slug/play', playCountHandler);
  app.post('/api/listing/:slug/play', playCountHandler);
  app.post('/listing/:slug/preview', previewUploadHandler);
  // Alias to support clients that POST to /api/ prefixed paths
  app.post('/api/listing/:slug/preview', previewUploadHandler);

  const screenshotUploadHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const slotParam = Number((req.params as any).slot ?? (req.params as any).index);
    if (!Number.isFinite(slotParam) || slotParam < 0 || slotParam >= SCREENSHOT_SLOT_COUNT) {
      return reply.code(400).send({ ok: false, error: 'invalid_slot' });
    }

    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    const item = apps[idx];
    if (item.deletedAt) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }

    const uid = (req.authUser?.uid || (req.query as any)?.uid) as string | undefined;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return DEBUG_LISTING_AUTH
        ? reply.code(403).send({ ok: false, error: 'not_owner' })
        : reply.code(404).send({ ok: false, error: 'not_found' });
    }

    try {
      const ct = (req.headers['content-type'] || '').toString();
      if (!/^multipart\/form-data/i.test(ct)) {
        return reply.code(400).send({ ok: false, error: 'screenshot_upload_required' });
      }
      const file = await (req as any).file?.();
      if (!file) return reply.code(400).send({ ok: false, error: 'no_file' });
      if (!isImageMimeType(file.mimetype)) {
        return reply.code(400).send({ ok: false, error: 'unsupported_type' });
      }
      const buf = await file.toBuffer();
      if (!buf.length) return reply.code(400).send({ ok: false, error: 'empty_file' });
      if (buf.length > MAX_SCREENSHOT_SIZE_BYTES) {
        return reply
          .code(413)
          .send({ ok: false, error: 'screenshot_too_large', maxBytes: MAX_SCREENSHOT_SIZE_BYTES });
      }

      const slots = expandScreenshotSlots(item);
      const previousUrl = slots[slotParam];
      const screenshotUrl = await saveListingPreviewFile({
        listingId: String(item.id),
        slug: item.slug,
        buffer: buf,
        mimeType: file.mimetype,
        previousUrl,
      });
      slots[slotParam] = screenshotUrl;
      const screenshotUrls = slots.map((url) => sanitizeScreenshotUrl(url)).filter(Boolean);
      const next: AppRecord = {
        ...item,
        screenshotUrls,
        updatedAt: Date.now(),
      };
      apps[idx] = next;
      await writeApps(apps);
      return reply.send({ ok: true, screenshotUrls, slot: slotParam, screenshotUrl });
    } catch (err) {
      try {
        const p = path.join(process.cwd(), 'tmp', 'screenshot-upload-errors.log');
        const entry = { ts: new Date().toISOString(), slug, err: (err as any)?.stack || String(err) };
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.appendFile(p, JSON.stringify(entry) + '\n', 'utf8');
      } catch {}
      req.log.error({ err, slug }, 'screenshot_upload_failed');
      return reply.code(500).send({ ok: false, error: 'screenshot_failed' });
    }
  };

  const screenshotDeleteHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const slotParam = Number((req.params as any).slot ?? (req.params as any).index);
    if (!Number.isFinite(slotParam) || slotParam < 0 || slotParam >= SCREENSHOT_SLOT_COUNT) {
      return reply.code(400).send({ ok: false, error: 'invalid_slot' });
    }

    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }
    const item = apps[idx];
    if (item.deletedAt) {
      return reply.code(404).send({ ok: false, error: 'not_found' });
    }

    const uid = (req.authUser?.uid || (req.query as any)?.uid) as string | undefined;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return DEBUG_LISTING_AUTH
        ? reply.code(403).send({ ok: false, error: 'not_owner' })
        : reply.code(404).send({ ok: false, error: 'not_found' });
    }

    const slots = expandScreenshotSlots(item);
    const previousUrl = slots[slotParam];
    if (!previousUrl) {
      return reply.send({ ok: true, screenshotUrls: slots.filter(Boolean), slot: slotParam });
    }
    slots[slotParam] = '';
    const screenshotUrls = slots.map((url) => sanitizeScreenshotUrl(url)).filter(Boolean);
    const next: AppRecord = {
      ...item,
      screenshotUrls,
      updatedAt: Date.now(),
    };
    apps[idx] = next;
    await writeApps(apps);
    try {
      await removeExistingPreviewFile(previousUrl);
    } catch {}
    return reply.send({ ok: true, screenshotUrls, slot: slotParam });
  };

  app.post('/listing/:slug/screenshot/:slot', screenshotUploadHandler);
  app.post('/api/listing/:slug/screenshot/:slot', screenshotUploadHandler);
  app.delete('/listing/:slug/screenshot/:slot', screenshotDeleteHandler);
  app.delete('/api/listing/:slug/screenshot/:slot', screenshotDeleteHandler);

  // Update listing fields (owner or admin). Allows title/description/tags/visibility/accessMode/price/maxConcurrentPins
  const patchListingHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) return reply.code(404).send({ ok: false, error: 'not_found' });
    const item = apps[idx];
    if (item.deletedAt) return reply.code(404).send({ ok: false, error: 'not_found' });

    const uid = req.authUser?.uid;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }

    const body = (req.body as any) || {};
    const next = { ...item } as any;

    const titleEdited = typeof body.title === 'string';
    const descriptionEdited = typeof body.description === 'string';

    if (titleEdited) next.title = String(body.title);
    if (descriptionEdited) {
      // Enforce a sane limit and normalize type
      const desc = String(body.description);
      next.description = desc.length > 500 ? desc.slice(0, 500) : desc;
    }
    if (typeof body.longDescription === 'string') {
      const longDesc = body.longDescription.toString().trim();
      next.longDescription = longDesc.length > 5000 ? longDesc.slice(0, 5000) : longDesc;
    }
    if (Array.isArray(body.screenshotUrls)) {
      next.screenshotUrls = normalizeScreenshotList(body.screenshotUrls);
    }
    if (Array.isArray(body.tags)) next.tags = body.tags.filter((t: any) => typeof t === 'string');
    if (body.visibility === 'public' || body.visibility === 'unlisted') next.visibility = body.visibility;
    if (typeof body.accessMode === 'string') next.accessMode = body.accessMode;
    if (typeof body.price === 'number') next.price = body.price;
    if (typeof body.maxConcurrentPins === 'number' && Number.isFinite(body.maxConcurrentPins)) {
      next.maxConcurrentPins = Math.max(1, Math.min(1000, Math.floor(body.maxConcurrentPins)));
    }
    // Merge provided manual translations
    const sanitizeTranslations = (input?: Record<string, { title?: string; description?: string }>) => {
      const out: Record<string, { title?: string; description?: string }> = {} as any;
      for (const [loc, obj] of Object.entries(input || {})) {
        const l = String(loc).toLowerCase().slice(0, 2);
        if (!['en','hr','de'].includes(l)) continue;
        const t = (obj?.title ?? '').toString().trim();
        const d = (obj?.description ?? '').toString().trim();
        if (!t && !d) continue;
        out[l] = {} as any;
        if (t) out[l].title = t;
        if (d) out[l].description = d;
      }
      return out;
    };
    const providedTr = sanitizeTranslations(body.translations);
    if (Object.keys(providedTr).length) {
      const current = (next.translations || {}) as Record<string, any>;
      const merged: Record<string, any> = { ...current };
      for (const [k, v] of Object.entries(providedTr)) {
        merged[k] = { ...(merged[k] || {}), ...v };
      }
      next.translations = merged;
    }
    // If base title/description changed and no manual translations provided, invalidate cache
    if ((titleEdited || descriptionEdited) && Object.keys(providedTr).length === 0) {
      delete next.translations;
    }

    const capabilitiesPatch = body?.capabilities;
    if (capabilitiesPatch && typeof capabilitiesPatch === 'object') {
      const currentCapabilities = { ...(next.capabilities || {}) } as Record<string, any>;
      let capabilitiesMutated = false;
      const storagePatch = capabilitiesPatch.storage;
      if (storagePatch && typeof storagePatch === 'object') {
        const currentStorage = { ...(currentCapabilities.storage || {}) };
        let storageMutated = false;
        if (Object.prototype.hasOwnProperty.call(storagePatch, 'enabled') && typeof storagePatch.enabled === 'boolean') {
          currentStorage.enabled = storagePatch.enabled;
          storageMutated = true;
        }
        if (Object.prototype.hasOwnProperty.call(storagePatch, 'roomsMode')) {
          currentStorage.roomsMode = normalizeRoomsMode(storagePatch.roomsMode);
          storageMutated = true;
        }
        if (storageMutated) {
          currentCapabilities.storage = currentStorage;
          capabilitiesMutated = true;
        }
      }
      if (capabilitiesMutated) {
        next.capabilities = currentCapabilities;
      }
    }

    next.updatedAt = Date.now();
    // Support updating preview via PATCH body
    try {
      const previewBody = (body.preview || {}) as any;
      // JSON path selection: { path: '/preview-presets/...' }
      if (typeof previewBody.path === 'string' && previewBody.path.trim()) {
        const rawPath = previewBody.path.toString().trim();
        const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        const allowed = normalized.startsWith('/preview-presets/') || normalized.startsWith('/assets/');
        if (!allowed) {
          return reply.code(400).send({ ok: false, error: 'invalid_preview_path' });
        }
        try {
          await removeExistingPreviewFile(item.previewUrl);
        } catch {}
        next.previewUrl = normalized;
        next.updatedAt = Date.now();
      }
      // Data URL upload: { dataUrl: 'data:image/png;base64,...' }
      else if (typeof previewBody.dataUrl === 'string' && /^data:[^;]+;base64,/.test(previewBody.dataUrl.trim())) {
        try {
          const m = /^data:([^;]+);base64,(.+)$/i.exec(previewBody.dataUrl.trim());
          if (m) {
            const buffer = Buffer.from(m[2], 'base64');
            const mimeType = m[1] || 'image/png';
            const previewUrl = await saveListingPreviewFile({
              listingId: String(item.id),
              slug: item.slug,
              buffer,
              mimeType,
              previousUrl: item.previewUrl,
            });
            next.previewUrl = previewUrl;
            next.updatedAt = Date.now();
          }
        } catch (e) {
          // Persist stack to tmp for debugging
          try {
            const p = path.join(process.cwd(), 'tmp', 'preview-upload-errors.log');
            const entry = { ts: new Date().toISOString(), slug, context: 'patch_store', err: (e as any)?.stack || String(e) };
            await fs.mkdir(path.dirname(p), { recursive: true });
            await fs.appendFile(p, JSON.stringify(entry) + '\n', 'utf8');
          } catch {}
          req.log?.warn?.({ e, slug }, 'patch_preview_store_failed');
          return reply.code(500).send({ ok: false, error: 'preview_failed' });
        }
      }
    } catch (e) {
      // Log preview parsing errors to tmp for easier debugging
      try {
        const p = path.join(process.cwd(), 'tmp', 'preview-upload-errors.log');
        const entry = { ts: new Date().toISOString(), slug, context: 'patch_parse', err: (e as any)?.stack || String(e) };
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.appendFile(p, JSON.stringify(entry) + '\n', 'utf8');
      } catch {}
      req.log?.warn?.({ e, slug }, 'patch_preview_parse_failed');
    }
    if (typeof next.price === 'number' && next.price > 0) {
      const status = await getConnectStatus(ownerUid);
      if (!status.payouts_enabled || (status.requirements_due ?? 0) > 0) {
        req.log.warn({ creatorId: ownerUid }, 'creator_not_onboarded');
        return reply
          .code(403)
          .send({ code: 'creator_not_onboarded', message: 'Finish Stripe onboarding to set prices.' });
      }
    }

    apps[idx] = next;
    await writeApps(apps);
    // If price set to > 0, ensure app has Stripe Product/Price so subscriptions work
    if (typeof next.price === 'number' && next.price > 0) {
      try {
        const ensured = await ensureAppProductPrice(next as any);
        // Write back enriched stripe ids if changed
        apps[idx] = ensured as any;
        await writeApps(apps);
      } catch (e) {
        req.log.error({ e, slug }, 'ensure_app_price_failed');
        // Non-fatal for listing update
      }
    }
    return reply.send({ ok: true, item: apps[idx] });
  };
  app.patch('/listing/:slug', patchListingHandler);
  // Alias for clients using /api prefix
  app.patch('/api/listing/:slug', patchListingHandler);

  // Toggle active/inactive state (owner or admin)
  app.patch('/app/:slug/state', async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const nextState = (req.body as any)?.state as string | undefined;
    if (!['active', 'inactive'].includes(String(nextState))) {
      return reply.code(400).send({ ok: false, error: 'invalid_state' });
    }
    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) return reply.code(404).send({ ok: false, error: 'not_found' });
    const item = apps[idx];
    if (item.deletedAt) return reply.code(404).send({ ok: false, error: 'not_found' });

    const uid = req.authUser?.uid;
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }

    const updated = { ...item, state: nextState, updatedAt: Date.now() } as any;
    if (nextState === 'active') {
      updated.playUrl = `/app/${item.slug}/`;
      updated.publishedAt = updated.publishedAt ?? Date.now();
    } else {
      updated.playUrl = `/play/${item.id}/`;
    }
    apps[idx] = updated;
    await writeApps(apps);
    return reply.send({ ok: true, item: updated });
  });

  // Report an issue with own app (owner only)
  app.post('/listing/:slug/report-issue', async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) return reply.code(404).send({ ok: false, error: 'not_found' });
    const item = apps[idx];
    if (item.deletedAt) return reply.code(404).send({ ok: false, error: 'not_found' });

    const uid = req.authUser?.uid;
    if (!uid) return reply.code(401).send({ ok: false, error: 'unauthenticated' });
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    const isOwner = Boolean(uid && uid === ownerUid);
    const isAdmin = req.authUser?.role === 'admin' || (req.authUser as any)?.claims?.admin === true;
    if (!isOwner && !isAdmin) {
      return reply.code(403).send({ ok: false, error: 'forbidden' });
    }

    const schema = z.object({ reason: z.string().min(10).max(2000) });
    const parsed = schema.safeParse((req.body as any) || {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_input' });
    }
    const { reason } = parsed.data;

    // Append to reports array (owner issue)
    const now = Date.now();
    const next = { ...item } as any;
    next.reports = Array.isArray(next.reports) ? next.reports : [];
    next.reports.push({ by: uid, reason, at: now, kind: 'owner-issue' });
    next.updatedAt = now;
    apps[idx] = next;
    await writeApps(apps);

    // Best-effort email notification to admins
    try {
      const claims: any = (req as any).authUser?.claims || {};
      const displayName = claims.name || claims.displayName || undefined;
      const email = claims.email || undefined;
      const authorHandle = (item as any)?.author?.handle || undefined;
      const subject = `Prijava poteškoća: ${item.title || item.slug} (#${item.id})`;
      const lines: string[] = [];
      lines.push(`App: ${item.title || '-'} (ID: ${item.id}, slug: ${item.slug})`);
      lines.push(`Vlasnik UID: ${ownerUid}`);
      if (displayName) lines.push(`Vlasnik: ${displayName}`);
      if (authorHandle) lines.push(`Korisničko ime: @${authorHandle}`);
      if (email) lines.push(`E-mail: ${email}`);
      lines.push('');
      lines.push('Opis poteškoće:');
      lines.push(reason);
      await notifyAdmins(subject, lines.join('\n'));
    } catch {}

    return reply.send({ ok: true });
  });

  // Report inappropriate content (viewers)
  const reportContentHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const slug = String((req.params as any).slug);
    const apps = await readApps();
    const idx = apps.findIndex((a) => a.slug === slug || String(a.id) === slug);
    if (idx < 0) return reply.code(404).send({ ok: false, error: 'not_found' });
    const item = apps[idx];
    if (item.deletedAt) return reply.code(404).send({ ok: false, error: 'not_found' });

    const uid = req.authUser?.uid;
    if (!uid) return reply.code(401).send({ ok: false, error: 'unauthenticated' });
    const ownerUid = item.author?.uid || (item as any).ownerUid;
    if (ownerUid && uid === ownerUid) {
      return reply.code(403).send({ ok: false, error: 'owners_cannot_report' });
    }

    const schema = z.object({ description: z.string().min(10).max(2000) });
    const parsed = schema.safeParse((req.body as any) || {});
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_input' });
    }
    const { description } = parsed.data;

    const now = Date.now();
    const next = { ...item } as any;
    next.reports = Array.isArray(next.reports) ? next.reports : [];
    const already = next.reports.find((r: any) => r.by === uid && r.kind === 'user-content');
    if (already) {
      return reply.code(429).send({ ok: false, error: 'already_reported' });
    }
    next.reports.push({ by: uid, reason: description, at: now, kind: 'user-content' });
    next.updatedAt = now;
    apps[idx] = next;
    await writeApps(apps);

    try {
      const claims: any = (req as any).authUser?.claims || {};
      const reporterName = claims?.name || claims?.displayName || undefined;
      const reporterEmail = claims?.email || undefined;
      const lines = [
        'Nova prijava sadržaja korisnika.',
        `App: ${item.title || '-'} (ID: ${item.id}, slug: ${item.slug})`,
        `Prijavio UID: ${uid}`,
        reporterName ? `Ime: ${reporterName}` : null,
        reporterEmail ? `Email: ${reporterEmail}` : null,
        '',
        'Opis prijave:',
        description,
      ].filter(Boolean).join('\n');
      await sendEmail('reports@thesara.space', 'REPORTED APPS', lines, 'reports');
    } catch (err) {
      req.log?.error?.({ err, slug, uid }, 'report_content_email_failed');
    }

    return reply.send({ ok: true });
  };
  app.post('/listing/:slug/report-content', reportContentHandler);
  app.post('/api/listing/:slug/report-content', reportContentHandler);
  app.delete('/api/listing/:slug', deleteListingHandler);
}
