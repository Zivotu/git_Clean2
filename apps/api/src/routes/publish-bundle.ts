import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config.js';
import { getBuildDir } from '../paths.js';
import { readApps, writeApps, listEntitlements, updateApp } from '../db.js';
import { initBuild } from '../models/Build.js';
import { getStorageBackend, StorageError } from '../storageV2.js';
import { enqueueBundleBuild } from '../workers/bundleBuildWorker.js';
import { computeNextVersion } from '../lib/versioning.js';
import { ensureListingPreview, saveListingPreviewFile, pickRandomPreviewPreset } from '../lib/preview.js';
import { ensureListingTranslations } from '../lib/translate.js';
import { ensureTermsAccepted, TermsNotAcceptedError } from '../lib/terms.js';

async function ensureListingRecord(opts: {
  listingId: string | number;
  title?: string | null;
  uid?: string | null;
  buildId: string;
}) {
  const { listingId, title, uid, buildId } = opts;
  const id = String(listingId);
  const ns = `listing:${id}`;
  const backend = await getStorageBackend();
  const { etag, json } = await backend.read(ns);
  const safeTitle = (title?.trim() || 'Untitled').slice(0, 200);
  const isNew = etag === '0' || !json || Object.keys(json).length === 0;
  const ops: any[] = [];
  if (isNew) {
    ops.push({ op: 'set', key: 'id', value: id });
    ops.push({ op: 'set', key: 'title', value: safeTitle });
    ops.push({ op: 'set', key: 'status', value: 'pending_review' });
    if (uid) ops.push({ op: 'set', key: 'authorUid', value: uid });
    ops.push({ op: 'set', key: 'createdAt', value: Date.now() });
  } else {
    if (title) ops.push({ op: 'set', key: 'title', value: safeTitle });
    ops.push({ op: 'set', key: 'updatedAt', value: Date.now() });
  }
  ops.push({ op: 'set', key: 'pendingBuildId', value: buildId });
  try {
    await backend.patch(ns, ops, etag as any);
  } catch (e) {
    if (e instanceof StorageError && e.statusCode === 412) {
      // Retry once on precondition failed
      const fresh = await backend.read(ns);
      await backend.patch(ns, ops, fresh.etag as any);
    } else {
      throw e;
    }
  }

  // AUTO-SYNC: Write to Firestore to prevent split-brain architecture issues
  try {
    const firestorePayload: any = {
      id,
      title: safeTitle,
      pendingBuildId: buildId,
    };
    if (isNew) {
      firestorePayload.status = 'pending_review';
      if (uid) firestorePayload.authorUid = uid;
      firestorePayload.createdAt = ops.find((op: any) => op.key === 'createdAt')?.value;
    } else {
      firestorePayload.updatedAt = ops.find((op: any) => op.key === 'updatedAt')?.value;
    }
    await updateApp(id, firestorePayload);
    console.log('[ensureListingRecord] ✅ Auto-synced to Firestore:', { listingId: id, pendingBuildId: buildId });
  } catch (syncError) {
    console.error('[ensureListingRecord] ⚠️ Failed to sync to Firestore (KV write succeeded):', syncError);
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default async function publishBundleRoutes(app: FastifyInstance) {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    req.log.info('publish-bundle:received');
    const uid = req.authUser?.uid;
    if (!uid) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    }
    try {
      await ensureTermsAccepted(uid);
    } catch (err) {
      if (err instanceof TermsNotAcceptedError) {
        return reply.code(428).send({
          ok: false,
          error: 'terms_not_accepted',
          code: 'terms_not_accepted',
          requiredVersion: err.status.requiredVersion,
          acceptedVersion: err.status.acceptedVersion,
        });
      }
      throw err;
    }

    // 1. Handle multipart upload
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ ok: false, error: 'no_file_uploaded' });
    }

    // TODO: Extract metadata from other form fields
    const title = (data.fields.title as any)?.value || 'Untitled Bundle';
    const appId = (data.fields.id as any)?.value;

    // 2. Authentication & Authorization (copied from publish.ts)
    const apps = await readApps();
    const owned = apps.filter((a) => a.author?.uid === uid || (a as any).ownerUid === uid);
    const idxOwned = appId ? owned.findIndex((a) => a.id === appId || a.slug === appId) : -1;
    const existingOwned = idxOwned >= 0 ? owned[idxOwned] : undefined;
    const isAdmin =
      (req as any).authUser?.role === 'admin' || (req as any).authUser?.claims?.admin === true;

    if (!existingOwned && !isAdmin) {
      const ents = await listEntitlements(uid);
      const gold = ents.some((e) => e.feature === 'isGold' && e.active !== false);
      const cfg = getConfig();
      const limit = gold ? cfg.GOLD_MAX_APPS_PER_USER : cfg.MAX_APPS_PER_USER;
      if (owned.length >= limit) {
        return reply
          .code(403)
          .send({
            ok: false,
            error: 'max_apps',
            message: `Dosegli ste maksimalan broj aplikacija (${limit}).`,
          });
      }
    }

    const buildId = randomUUID();

    // 3. Save the uploaded ZIP file to a temporary location
    // TODO: Define a proper temporary directory structure
  const tempDir = path.join(getConfig().TMP_PATH, 'publish-bundle', buildId);
    await fs.mkdir(tempDir, { recursive: true });
    const zipPath = path.join(tempDir, 'bundle.zip');
    await fs.writeFile(zipPath, await data.toBuffer());
    req.log.info({ buildId, zipPath }, 'publish-bundle:zip_saved');

    // 4. Create DB records (similar to publish.ts)
    const numericIds = apps
      .map((a) => Number(a.id))
      .filter((n) => !Number.isNaN(n));
    const idx = appId ? apps.findIndex((a) => a.id === appId || a.slug === appId) : -1;
    const existing = idx >= 0 ? apps[idx] : undefined;
    const listingId = existing
      ? Number(existing.id)
      : (numericIds.length ? Math.max(...numericIds) : 0) + 1;

    await ensureListingRecord({
      listingId,
      title: title,
      uid,
      buildId,
    });

    await initBuild(buildId);

    // Persist basic build info for the worker early so the worker can read
    // listingId immediately after the job is dequeued. Writing before
    // enqueue avoids a race where the worker starts before the listingId
    // is available and emits a final event without it.
    try {
      const dir = getBuildDir(buildId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'build-info.json'),
        JSON.stringify({ listingId: String(listingId) }, null, 2),
        'utf8'
      );
    } catch (err) {
      req.log?.warn?.({ err, buildId }, 'publish-bundle:build_info_write_failed');
    }

    await enqueueBundleBuild(buildId, zipPath);
    req.log.info({ buildId }, 'publish-bundle:build_enqueued');

    // 7. Create slug, version, and update app record
    try {
      const now = Date.now();
      const existingSlug = existing?.slug;
      const baseSlug = slugify(title) || `app-${listingId}`;
      let slug = existingSlug || baseSlug;
      if (!existingSlug) {
        let cnt = 1;
        while (apps.some((a) => a.slug === slug)) {
          slug = `${baseSlug}-${cnt++}`;
        }
      }

      const { version, archivedVersions } = computeNextVersion(existing, now);
      
      // This is a new helper function that needs to be added
      const parseDataUrl = (input: string | undefined): { mimeType: string; buffer: Buffer } | null => {
        if (!input) return null;
        const match = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
        if (!match) return null;
        try {
          const buffer = Buffer.from(match[2], 'base64');
          return { mimeType: match[1] || 'image/png', buffer };
        } catch { return null; }
      };

      let payloadPreviewUrl: string | undefined = existing?.previewUrl ?? undefined;
      const previewDataUrl = (data.fields.preview as any)?.value;
      const parsedPreview = parseDataUrl(previewDataUrl);
      if (parsedPreview) {
        payloadPreviewUrl = await saveListingPreviewFile({
          listingId: String(listingId),
          slug,
          buffer: parsedPreview.buffer,
          mimeType: parsedPreview.mimeType,
          previousUrl: existing?.previewUrl,
        });
      }

      if (!payloadPreviewUrl) {
        payloadPreviewUrl = pickRandomPreviewPreset();
      }
      
      const description = (data.fields.description as any)?.value || '';
      const visibility = (data.fields.visibility as any)?.value || 'public';
      const author = { uid }; // Simplified author

      if (existing) {
        const base: any = { // Type as any to allow for flexible property assignment
          ...existing,
          slug,
          title: title || existing.title || '',
          description: description || existing.description || '',
          visibility: visibility || existing.visibility,
          author,
          updatedAt: now,
          pendingBuildId: buildId,
          pendingVersion: version,
          previewUrl: payloadPreviewUrl ?? existing.previewUrl,
        };
        const { next } = ensureListingPreview(base);
        apps[idx] = next;
      } else {
        const base: any = {
          id: String(listingId),
          slug,
          pendingBuildId: buildId,
          title: title || '',
          description: description,
          tags: [],
          visibility: visibility,
          accessMode: 'public',
          author: author,
          createdAt: now,
          updatedAt: now,
          status: 'pending-review',
          state: 'draft',
          playUrl: `/play/${listingId}/`,
          version,
          archivedVersions,
          previewUrl: payloadPreviewUrl,
        };
        const { next } = ensureListingPreview(base);
        apps.push(next);
      }

      await writeApps(apps);
      req.log.info({ buildId, listingId, slug }, 'publish-bundle:created');



      const responsePayload = { ok: true as const, buildId, listingId, slug };
      return reply.code(202).send(responsePayload);

    } catch (err) {
      req.log.error({ err }, 'publish-bundle:listing_write_failed');
      return reply.code(500).send({ ok: false, error: 'listing_write_failed' });
    }
  };

  // Register the new route
  app.post('/api/publish/bundle', handler);
}
