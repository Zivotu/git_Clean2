import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import extract from 'extract-zip';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyBaseLogger } from 'fastify';
import { getConfig } from '../config.js';
import { readApps, writeApps, listEntitlements, updateApp, db } from '../db.js';
import { initBuild, updateBuild, writeBuildInfo } from '../models/Build.js';
import { getStorageBackend, StorageError } from '../storageV2.js';
import { enqueueBundleBuild } from '../workers/bundleBuildWorker.js';
import { computeNextVersion } from '../lib/versioning.js';
import { ensureListingPreview, saveListingPreviewFile, pickRandomPreviewPreset } from '../lib/preview.js';
import { ensureListingTranslations } from '../lib/translate.js';
import { ensureTermsAccepted, TermsNotAcceptedError } from '../lib/terms.js';
import {
  materializeCustomAssets,
  normalizeCustomAssetList,
  saveCustomAssetToStorage,
} from '../lib/customAssets.js';
import type { CustomAsset } from '../types.js';
import { detectPreferredLocale } from '../lib/locale.js';
import { detectStorageUsageInCode } from '../lib/storageUsage.js';
import { getStorageWarning } from '../lib/messages.js';

const AI_MARKERS = [
  'generativelanguage.googleapis.com',
  'generativelanguage#ai',
  '__AI_KEY__',
  'PLACEHOLDER_API_KEY',
  'YOUR_API_KEY',
  'window.__THESARA_AI_KEY__',
];
const AI_SCAN_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.htm',
  '.json',
]);
const MAX_SCAN_FILE_BYTES = 512 * 1024;

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

interface BundleAnalysis {
  aiMarker: string | null;
  storageUsed: boolean;
}

async function analyzeBundleZip(
  zipPath: string,
  tempDir: string,
  logger: FastifyBaseLogger,
): Promise<BundleAnalysis> {
  const inspectDir = path.join(tempDir, 'inspect');
  try {
    await extract(zipPath, { dir: inspectDir });
  } catch (err) {
    logger.warn({ err }, 'publish-bundle:zip_extract_failed');
    // If we can't extract the zip, it's likely corrupt. We should not proceed.
    throw new Error('Invalid or corrupt ZIP file.');
  }
  let storageUsed = false;

  async function walk(dir: string): Promise<string | null> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await walk(abs);
        if (nested) return nested;
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!AI_SCAN_EXTENSIONS.has(ext)) continue;
      const stat = await fs.stat(abs);
      if (stat.size > MAX_SCAN_FILE_BYTES) continue;
      let contents: string;
      try {
        contents = await fs.readFile(abs, 'utf8');
      } catch {
        continue;
      }
      if (!storageUsed && detectStorageUsageInCode(contents)) {
        storageUsed = true;
      }
      for (const marker of AI_MARKERS) {
        if (contents.includes(marker)) {
          return marker;
        }
      }
    }
    return null;
  }

  try {
    const aiMarker = await walk(inspectDir);
    return { aiMarker, storageUsed };
  } finally {
    await fs.rm(inspectDir, { recursive: true, force: true });
  }
}

async function ensureListingRecord(opts: {
  listingId: string | number;
  title?: string | null;
  author?: { uid: string; name?: string; photo?: string; handle?: string } | null;
  buildId: string;
}) {
  const { listingId, title, author, buildId } = opts;
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
    if (author?.uid) ops.push({ op: 'set', key: 'authorUid', value: author.uid });
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
      // Store full author object instead of just authorUid
      if (author?.uid) {
        firestorePayload.author = author;
        // Keep authorUid for backward compatibility
        firestorePayload.authorUid = author.uid;
      }
      firestorePayload.createdAt = ops.find((op: any) => op.key === 'createdAt')?.value;
    } else {
      firestorePayload.updatedAt = ops.find((op: any) => op.key === 'updatedAt')?.value;
    }
    await updateApp(id, firestorePayload);
    console.log('[ensureListingRecord] ✅ Auto-synced to Firestore:', { listingId: id, pendingBuildId: buildId, hasAuthor: !!author });
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

async function resolveAuthorMetadata(opts: {
  uid: string;
  existing?: Record<string, any> | null;
  req: FastifyRequest;
}): Promise<{ uid: string; name?: string; photo?: string; handle?: string }> {
  const { uid, existing, req } = opts;
  const author: { uid: string; name?: string; photo?: string; handle?: string } = {
    ...(existing || {}),
    uid,
  };

  const assign = (key: 'name' | 'photo' | 'handle', value?: unknown) => {
    if (author[key]) return;
    if (typeof value === 'string' && value.trim()) {
      author[key] = value.trim();
    }
  };

  const claims: any = (req as any).authUser?.claims || {};
  assign('name', claims.displayName || claims.name);
  assign('photo', claims.picture || claims.photoURL || claims.photoUrl);
  assign('handle', claims.handle || claims.username);

  if (!author.name || !author.photo || !author.handle) {
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) {
        const data = snap.data() || {};
        assign('name', data.displayName || data.name || data.fullName);
        assign('photo', data.photo || data.photoUrl || data.photoURL || data.avatarUrl);
        assign('handle', data.handle || data.username || data.slug);
      }
    } catch (err) {
      req.log?.warn?.({ err, uid }, 'publish_bundle_author_lookup_failed');
    }
  }

  // Remove empty strings to avoid writing noise
  for (const key of ['name', 'photo', 'handle'] as const) {
    if (typeof author[key] === 'string' && !author[key].trim()) {
      delete author[key];
    }
  }

  return author;
}

function parseDataUrlValue(
  dataUrl: string | null | undefined,
): { buffer: Buffer; mimeType: string } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return null;
  }

  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const [, mimeType, base64Data] = match;

  if (!mimeType || !base64Data) {
    return null;
  }

  const buffer = Buffer.from(base64Data, 'base64');
  return { buffer, mimeType };
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

    // 1. Admin Authorization Gate (Protect against large payload DoS)
    const isAdmin =
      (req as any).authUser?.role === 'admin' || (req as any).authUser?.claims?.admin === true;

    if (!isAdmin) {
      req.log.warn({ uid }, 'publish-bundle:forbidden_non_admin');
      return reply.code(403).send({ ok: false, error: 'admin_required', message: 'Only admins can publish bundles.' });
    }

    // 2. Handle multipart upload
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ ok: false, error: 'no_file_uploaded' });
    }

    // TODO: Extract metadata from other form fields
    const title = (data.fields.title as any)?.value || 'Untitled Bundle';
    const appId = (data.fields.id as any)?.value;
    const llmApiKeyRaw = ((data.fields.llmApiKey as any)?.value || '').toString().trim();
    const llmApiKey = llmApiKeyRaw ? llmApiKeyRaw.slice(0, 400) : undefined;
    const skipStorageWarning = parseBooleanFlag((data.fields.skipStorageWarning as any)?.value);

    // 3. Ownership Logic (already confirmed admin)
    const apps = await readApps();
    const owned = apps.filter((a) => a.author?.uid === uid || (a as any).ownerUid === uid);
    const idxOwned = appId ? owned.findIndex((a) => a.id === appId || a.slug === appId) : -1;
    const existingOwned = idxOwned >= 0 ? owned[idxOwned] : undefined;

    // Admin can edit anyone's app, so no specialized logic needed here beyond what was present.

    if (!existingOwned) {
      const ents = await listEntitlements(uid);
      const gold = ents.some((e) => e.feature === 'isGold' && e.active !== false);
      const cfg = getConfig();
      const limit = gold ? cfg.GOLD_MAX_APPS_PER_USER : cfg.MAX_APPS_PER_USER;
      // Filter out deleted apps before counting - only count active apps
      const activeOwned = owned.filter((a) => !a.deletedAt && !a.adminDeleteSnapshot);
      if (activeOwned.length >= limit) {
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
    const claims: any = (req as any).authUser?.claims || {};
    const creatorLocale = detectPreferredLocale(req.headers['accept-language']);

    // 3. Save the uploaded ZIP file to a temporary location
    // TODO: Define a proper temporary directory structure
    const tempDir = path.join(getConfig().TMP_PATH, 'publish-bundle', buildId);
    await fs.mkdir(tempDir, { recursive: true });
    const zipPath = path.join(tempDir, 'bundle.zip');
    await fs.writeFile(zipPath, await data.toBuffer());
    req.log.info({ buildId, zipPath }, 'publish-bundle:zip_saved');

    let customAssetFiles: { name: string; path: string }[] = [];
    let storedCustomAssets: CustomAsset[] = [];
    const customAssetsField = (data.fields.customAssets as any)?.value;
    if (typeof customAssetsField === 'string' && customAssetsField.trim()) {
      try {
        const parsed = JSON.parse(customAssetsField);
        storedCustomAssets = normalizeCustomAssetList(parsed);
        customAssetFiles = await materializeCustomAssets(
          storedCustomAssets,
          path.join(tempDir, 'assets'),
        );
      } catch (err: any) {
        await fs.rm(tempDir, { recursive: true, force: true });
        return reply.code(400).send({
          ok: false,
          error: 'invalid_custom_assets',
          message: err?.message || 'Invalid custom assets payload.',
        });
      }
    }

    let analysis: BundleAnalysis;
    try {
      analysis = await analyzeBundleZip(zipPath, tempDir, req.log);
    } catch (err: any) {
      await fs.rm(tempDir, { recursive: true, force: true });
      if (err.message === 'Invalid or corrupt ZIP file.') {
        return reply.code(400).send({
          ok: false,
          error: 'invalid_zip',
          message: 'The uploaded ZIP file appears to be corrupt or incomplete. Please try uploading again.',
        });
      }
      throw err;
    }

    if (!llmApiKey && analysis.aiMarker) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return reply.code(400).send({
        ok: false,
        error: 'llm_api_key_missing',
        message:
          'Ovaj bundle sadrži AI pozive (npr. prema Gemini API-ju), ali API ključ nije unesen. Dodajte ključ prije objave.',
        marker: analysis.aiMarker,
      });
    }
    if (!analysis.storageUsed && !skipStorageWarning) {
      const storageWarning = getStorageWarning(creatorLocale);
      await fs.rm(tempDir, { recursive: true, force: true });
      return reply.code(409).send({
        ok: false,
        error: 'storage_usage_missing',
        code: 'storage_usage_missing',
        message: storageWarning.message,
        docsUrl: storageWarning.docsUrl,
        canOverride: true,
      });
    }

    // 4. Create DB records (similar to publish.ts)
    const numericIds = apps
      .map((a) => Number(a.id))
      .filter((n) => !Number.isNaN(n));
    const idx = appId ? apps.findIndex((a) => a.id === appId || a.slug === appId) : -1;
    const existing = idx >= 0 ? apps[idx] : undefined;
    const listingId = existing
      ? Number(existing.id)
      : (numericIds.length ? Math.max(...numericIds) : 0) + 1;

    // Resolve author metadata before creating listing record
    const author = await resolveAuthorMetadata({ uid, existing: existing?.author, req });

    await ensureListingRecord({
      listingId,
      title: title,
      author,
      buildId,
    });

    await initBuild(buildId);
    const authorUid = author?.uid || uid;
    try {
      await updateBuild(buildId, { creatorLanguage: creatorLocale });
    } catch (err) {
      req.log?.warn?.({ err, buildId }, 'publish-bundle:set_creator_language_failed');
    }

    try {
      await writeBuildInfo(buildId, {
        listingId: String(listingId),
        creatorLanguage: creatorLocale,
        authorUid,
        authorName: author?.name,
        authorHandle: author?.handle,
        authorEmail: claims.email,
        submitterUid: uid,
        submitterEmail: claims.email,
        submittedAt: Date.now(),
        appTitle: title || existing?.title,
      });
    } catch (err) {
      req.log?.warn?.({ err, buildId }, 'publish-bundle:build_info_write_failed');
    }

    await enqueueBundleBuild(buildId, zipPath, { llmApiKey, customAssets: customAssetFiles });
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

      let payloadPreviewUrl: string | undefined = existing?.previewUrl ?? undefined;
      const previewDataUrl = (data.fields.preview as any)?.value;
      const parsedPreview = parseDataUrlValue(previewDataUrl);
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
      const author = await resolveAuthorMetadata({ uid, existing: existing?.author, req });

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
          customAssets: storedCustomAssets.length
            ? await Promise.all(
              storedCustomAssets.map(async (a) => {
                // Save asset to disk and get storagePath
                const storagePath = await saveCustomAssetToStorage(a, String(listingId));
                // Return asset with storagePath, without dataUrl
                const { dataUrl, ...rest } = a;
                return { ...rest, storagePath };
              })
            )
            : undefined,
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
          customAssets: storedCustomAssets.length
            ? await Promise.all(
              storedCustomAssets.map(async (a) => {
                // Save asset to disk and get storagePath
                const storagePath = await saveCustomAssetToStorage(a, String(listingId));
                // Return asset with storagePath, without dataUrl
                const { dataUrl, ...rest } = a;
                return { ...rest, storagePath };
              })
            )
            : undefined,
        };
        const { next } = ensureListingPreview(base);
        apps.push(next);
      }

      await writeApps(apps);
      req.log.info({ buildId, listingId, slug }, 'publish-bundle:created');
      try {
        await writeBuildInfo(buildId, {
          slug,
          appTitle: title || existing?.title,
          authorName: author?.name,
          authorHandle: author?.handle,
        });
      } catch (err) {
        req.log?.warn?.({ err, buildId }, 'publish-bundle:build_info_update_failed');
      }



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
