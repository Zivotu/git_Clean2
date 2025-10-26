import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { requireRole } from '../middleware/auth.js';
import { getBucket } from '../storage.js';
import * as tar from 'tar';
import archiver from 'archiver';
import {
  listBuilds,
  readBuild,
  updateBuild,
  getBuildArtifacts,
  publishBundle,
} from '../models/Build.js';
import { getConfig, LLM_REVIEW_ENABLED } from '../config.js';
import { notifyAdmins } from '../notifier.js';
import { BUNDLE_ROOT } from '../paths.js';
import { readApps, writeApps, updateApp } from '../db.js';
import { runLlmReviewForBuild } from '../llmReview.js';
import { computeNextVersion } from '../lib/versioning.js';
import { createJob, isJobActive } from '../buildQueue.js';
import { ensureListingPreview } from '../lib/preview.js';

export default async function reviewRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole('admin') };

  const toIso = (value?: number) =>
    typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : 'n/a';

  function sanitizeFileName(input: string | undefined | null): string {
    if (!input) return '';
    return input
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  type AppRecord = Record<string, any>;
  type BuildResolveContext = {
    buildId: string;
    build?: Awaited<ReturnType<typeof readBuild>>;
    apps: AppRecord[];
    appIndex: number;
  };

  function normaliseIdentifier(value: string | number | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const out = String(value).trim();
    return out ? out.toLowerCase() : null;
  }

  function findAppIndexByIdentifier(apps: AppRecord[], identifier: string): number {
    const needle = normaliseIdentifier(identifier);
    if (!needle) return -1;
    return apps.findIndex((app) => {
      const candidates = [
        app?.id,
        app?.slug,
        app?.buildId,
        app?.pendingBuildId,
      ];
      return candidates.some((candidate) => normaliseIdentifier(candidate) === needle);
    });
  }

  async function resolveBuildContext(
    identifier: string,
    opts: { apps?: AppRecord[] } = {},
  ): Promise<BuildResolveContext | null> {
    const trimmed = String(identifier ?? '').trim();
    if (!trimmed) return null;

    const apps = opts.apps ?? (await readApps());
    let build = await readBuild(trimmed);
    let appIndex = findAppIndexByIdentifier(apps, trimmed);

    const candidateIds: string[] = [];
    if (appIndex >= 0) {
      const app = apps[appIndex];
      if (app?.pendingBuildId) candidateIds.push(String(app.pendingBuildId));
      if (app?.buildId) candidateIds.push(String(app.buildId));
    }
    if (!candidateIds.includes(trimmed)) candidateIds.unshift(trimmed);

    if (!build) {
      for (const candidate of candidateIds) {
        build = await readBuild(candidate);
        if (build) {
          appIndex = findAppIndexByIdentifier(apps, candidate);
          break;
        }
      }
    }

    if (!build) {
      const fallbackId = candidateIds[0];
      if (!fallbackId) return null;
      if (appIndex < 0) appIndex = findAppIndexByIdentifier(apps, fallbackId);
      return {
        buildId: fallbackId,
        build: undefined,
        apps,
        appIndex,
      };
    }

    const buildId = build.id;
    if (appIndex < 0) {
      appIndex = findAppIndexByIdentifier(apps, buildId);
    }

    return { buildId, build, apps, appIndex };
  }

  app.get('/review/config', admin, async (req) => {
    return { llmReviewEnabled: LLM_REVIEW_ENABLED, uid: req.authUser?.uid };
  });

  app.get('/review/builds', admin, async (req, reply) => {
    const { status, cursor } = req.query as { status?: string; cursor?: string };
    const { items, nextCursor } = await listBuilds(cursor ? Number(cursor) : undefined);
    const apps = await readApps();
    const allowed = [
      'pending_review',
      'pending_review_llm',
      'rejected',
      'approved',
      'publishing',
      'publish_failed',
      'published',
    ];

    let builds = items.filter((b) => allowed.includes(b.state));
    if (status === 'pending') {
      builds = builds.filter((b) => ['pending_review', 'pending_review_llm'].includes(b.state));
    } else if (status === 'approved') {
      builds = builds.filter((b) => ['approved', 'published'].includes(b.state));
    } else if (status === 'rejected') {
      builds = builds.filter((b) => b.state === 'rejected');
    } else if (status === 'failed') {
      builds = builds.filter((b) => ['failed', 'publish_failed'].includes(b.state));
    }

    const cfg = getConfig();
    const emailCache = new Map<string, string | undefined>();
    const auth = getAuth();

    const reviewItems = await Promise.all(
      builds.map(async (b) => {
        const listing: any = apps.find(
          (a: any) => a.pendingBuildId === b.id || a.buildId === b.id || String(a.id) === b.id,
        );

        let networkDomains: string[] | undefined;
        let llm: any | undefined;
        try {
          const p = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', b.id, 'build', 'manifest_v1.json');
          const txt = await fs.readFile(p, 'utf8');
          const j = JSON.parse(txt);
          if (Array.isArray(j?.networkDomains)) networkDomains = j.networkDomains;
        } catch {}
        try {
          const llmPath = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', b.id, 'llm.json');
          const raw = await fs.readFile(llmPath, 'utf8');
          llm = JSON.parse(raw);
        } catch {
          if (b.state === 'llm_generating' || b.state === 'llm_waiting') {
            llm = { status: 'generating' };
          }
        }

        let ownerEmail: string | undefined = (listing as any)?.ownerEmail;
        const uid = (listing as any)?.author?.uid;
        if (!ownerEmail && uid) {
          if (emailCache.has(uid)) ownerEmail = emailCache.get(uid);
          else {
            try {
              const user = await auth.getUser(uid);
              ownerEmail = user.email || undefined;
            } catch {}
            emailCache.set(uid, ownerEmail);
          }
        }

        return {
          ...b,
          buildId: b.id,
          submittedAt: b.createdAt,
          title: listing?.title ?? '',
          description: listing?.description,
          appId: listing?.id,
          slug: listing?.slug,
          createdAt: listing?.createdAt,
          updatedAt: listing?.updatedAt,
          publishedAt: listing?.publishedAt,
          version: listing?.version,
          playUrl: listing?.playUrl,
          visibility: listing?.visibility,
          accessMode: listing?.accessMode,
          author: listing?.author,
          ownerEmail,
          previewUrl: listing?.previewUrl,
          networkPolicy: (b as any).networkPolicy,
          networkPolicyReason: (b as any).networkPolicyReason,
          networkDomains,
          pendingBuildId: listing?.pendingBuildId,
          moderation: (listing as any)?.moderation,
          ...(llm ? { llm } : {}),
        } as any;
      }),
    );

    reply.send({ items: reviewItems, nextCursor });
  });

  app.get('/review/builds/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });
    try {
      const cfg = (await import('../config.js')).getConfig();
      const p = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'build', 'manifest_v1.json');
      const txt = await fs.readFile(p, 'utf8');
      const j = JSON.parse(txt);
      const networkDomains = Array.isArray(j?.networkDomains) ? j.networkDomains : undefined;
      return { ...rec, networkDomains } as any;
    } catch {
      return rec;
    }
  });

  app.get('/review/builds/:id/llm', admin, async (req, reply) => {
    if (!LLM_REVIEW_ENABLED) {
      return reply.code(503).send({ error: 'llm_disabled' });
    }
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });
    if (rec.state === 'llm_generating' || rec.state === 'llm_waiting') {
      return reply.code(503).send({ error: 'report_generating' });
    }
    const cfg = getConfig();
    const p = rec.llmReportPath
      ? path.join(cfg.BUNDLE_STORAGE_PATH, rec.llmReportPath)
      : path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'llm.json');
    try {
      const txt = await fs.readFile(p, 'utf8');
      return JSON.parse(txt);
    } catch {
      return reply.code(404).send({ error: 'report_not_found' });
    }
  });

  app.post('/review/builds/:id/llm', admin, async (req, reply) => {
    if (!LLM_REVIEW_ENABLED) {
      return reply.code(503).send({ error: 'llm_disabled' });
    }
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });
    await updateBuild(buildId, { state: 'llm_generating' });
    try {
      const report = await runLlmReviewForBuild(buildId);
      const cfg = getConfig();
      const p = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'llm.json');
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(report, null, 2));
      const rel = path.relative(cfg.BUNDLE_STORAGE_PATH, p);
      await updateBuild(buildId, { state: 'pending_review', llmReportPath: rel });
      return report;
    } catch (err: any) {
      req.log.error({ err, id: buildId, identifier: id }, 'llm_review_failed');
      const code = err?.errorCode || err?.code;
      await updateBuild(buildId, { state: 'pending_review', error: String(code || err?.message || err) });
      return reply.code(500).send({ error: code || 'llm_failed' });
    }
  });

  app.get('/review/report/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });
    const cfg = getConfig();
    const p = rec.llmReportPath
      ? path.join(cfg.BUNDLE_STORAGE_PATH, rec.llmReportPath)
      : path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'llm.json');
    try {
      const txt = await fs.readFile(p, 'utf8');
      return JSON.parse(txt);
    } catch {
      return reply.code(404).send({ error: 'report_not_found' });
    }
  });

  app.get('/review/artifacts/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const artifacts = await getBuildArtifacts(buildId);
    return { ...artifacts, buildId };
  });

  app.get('/review/code/:id', async (req, reply) => {
    if (!req.headers.authorization) {
      const { token } = req.query as { token?: string };
      if (!token) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
      try {
        const decoded = await getAuth().verifyIdToken(token);
        const claims: any = decoded;
        const role = claims.role || (claims.admin ? 'admin' : 'user');
        req.authUser = { uid: decoded.uid, role, claims: decoded };
      } catch (err) {
        req.log.debug({ err }, 'auth:token_invalid');
        return reply.code(401).send({ error: 'invalid auth token' });
      }
    }

    await requireRole('admin')(req, reply);
    if (reply.sent) return;

    // Allow clients that request ":id.tar.gz" or ":id.tgz" by stripping the suffix
    let { id: identifier } = req.params as { id: string } as any;
    if (typeof identifier === 'string') {
      identifier = identifier.replace(/\.(tar\.gz|tgz)$/i, '');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(identifier)) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const resolved = await resolveBuildContext(identifier);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });
    const cfg = getConfig();
    const localDir = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'bundle');
    let hasLocalBundle = false;
    try {
      await fs.access(localDir);
      hasLocalBundle = true;
    } catch {}
    const bucket = getBucket();
    const file = bucket.file(`builds/${buildId}/bundle.tar.gz`);
    const [exists] = await file.exists();
    const wantsZip =
      String((req.query as any)?.format || '').toLowerCase() === 'zip' ||
      /\.zip$/i.test(String((req.query as any)?.format || ''));

    if (wantsZip) {
      try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => {
          throw err;
        });

        const appRecord =
          resolved && resolved.appIndex >= 0 ? resolved.apps[resolved.appIndex] : undefined;

        const metadataLines = [
          `Application title: ${appRecord?.title ?? 'n/a'}`,
          `Application id: ${appRecord?.id ?? 'n/a'}`,
          `Slug: ${appRecord?.slug ?? 'n/a'}`,
          `Build id: ${buildId}`,
          `Pending build id: ${appRecord?.pendingBuildId ?? 'n/a'}`,
          `Author uid: ${appRecord?.author?.uid ?? 'n/a'}`,
          `Author handle: ${appRecord?.author?.handle ?? 'n/a'}`,
          `Author name: ${appRecord?.author?.name ?? 'n/a'}`,
          `Owner email: ${(appRecord as any)?.ownerEmail ?? 'n/a'}`,
          `Current version: ${appRecord?.version ?? 'n/a'}`,
          `Pending version: ${appRecord?.pendingVersion ?? 'n/a'}`,
          `Visibility: ${appRecord?.visibility ?? 'n/a'}`,
          `Access mode: ${appRecord?.accessMode ?? 'n/a'}`,
          `Created at: ${toIso(appRecord?.createdAt)}`,
          `Updated at: ${toIso(appRecord?.updatedAt)}`,
          `Submitted at: ${toIso(rec.createdAt)}`,
          `Published at: ${toIso(appRecord?.publishedAt)}`,
          `Current build state: ${rec.state}`,
          `Network policy: ${rec.networkPolicy ?? 'n/a'}`,
          `Download generated: ${new Date().toISOString()}`,
          `Bundle source: ${hasLocalBundle ? 'local bundle directory' : exists ? 'bundle.tar.gz object' : 'not available'}`,
        ];
        if (Array.isArray(rec.reasons) && rec.reasons.length) {
          metadataLines.push(`Review reasons: ${rec.reasons.join(', ')}`);
        }
        if (Array.isArray(rec.timeline) && rec.timeline.length) {
          metadataLines.push('Build timeline:');
          for (const step of rec.timeline) {
            metadataLines.push(`  - ${step.state} @ ${toIso(step.at)}`);
          }
        }
        metadataLines.push('');
        metadataLines.push('Description:');
        metadataLines.push(String(appRecord?.description ?? '').trim() || 'n/a');
        const metadata = metadataLines.join('\n') + '\n';
        archive.append(metadata, { name: 'METADATA.txt' });

        if (hasLocalBundle) {
          archive.directory(localDir, 'bundle');
        } else if (exists) {
          archive.append(file.createReadStream(), { name: 'bundle.tar.gz' });
        } else {
          archive.append('Bundle artifacts are not currently available for this build.\n',
            {
              name: 'README.txt',
            },
          );
        }

        const llmPath = rec.llmReportPath
          ? path.join(cfg.BUNDLE_STORAGE_PATH, rec.llmReportPath)
          : path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'llm.json');
        try {
          await fs.access(llmPath);
          archive.file(llmPath, { name: 'llm-report.json' });
        } catch {}

        const safeBase =
          sanitizeFileName(appRecord?.slug || appRecord?.title || buildId) || buildId;
        reply.header('Content-Disposition', `attachment; filename="${safeBase}-bundle.zip"`);
        reply.type('application/zip');
        void archive.finalize();
        return reply.send(archive as any);
      } catch (err) {
        req.log.error({ err, buildId }, 'bundle_zip_failed');
      }
    }

    if (exists) {
      reply.header('Content-Disposition', `attachment; filename="${buildId}.tar.gz"`);
      reply.type('application/gzip');
      return reply.send(file.createReadStream());
    }
    // Fallback: stream a tar.gz of the local bundle directory if present
    try {
      await fs.access(localDir);
      const stream = tar.c({ gzip: true, cwd: localDir }, ['.']);
      reply.header('Content-Disposition', `attachment; filename="${buildId}.tar.gz"`);
      reply.type('application/gzip');
      return reply.send(stream as any);
    } catch {
      return reply.code(404).send({ error: 'bundle_not_found' });
    }
  });

  app.post('/review/approve/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });

    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });

    await updateBuild(buildId, { state: 'publishing' });

    try {
      await publishBundle(buildId);
      await updateBuild(buildId, { state: 'published' });

      const appIndex = resolved?.appIndex ?? -1;
      if (appIndex >= 0) {
        const app = resolved!.apps[appIndex];
        const now = Date.now();
        const payload: Record<string, any> = {};

        if (app.pendingBuildId === buildId) {
          const { version, archivedVersions } = computeNextVersion(app, now);
          payload.archivedVersions = archivedVersions;
          payload.version = version;
          payload.buildId = buildId;
          payload.pendingBuildId = FieldValue.delete();
          payload.pendingVersion = FieldValue.delete();
        } else if (!app.buildId) {
          payload.buildId = buildId;
        }

        payload.status = 'published';
        payload.state = 'active';
        if (app.visibility !== 'public') {
          payload.visibility = 'public';
        }
        payload.playUrl = `/play/${app.id}/`;

        const ensured = ensureListingPreview({ ...app, ...payload });
        if (ensured.changed) {
          Object.assign(payload, ensured.next);
        }

        payload.publishedAt = now;
        payload.updatedAt = now;
        payload.moderation = {
          status: 'approved',
          at: now,
          by: req.authUser?.uid ?? null,
        };

        await updateApp(app.id, payload);

        try {
          const { ensureListingTranslations } = await import('../lib/translate.js');
          await ensureListingTranslations({ ...app, ...payload }, ['en', 'hr', 'de']);
        } catch (err) {
            req.log.warn({ err, appId: app.id }, 'translation_ensure_failed');
        }
      }
    } catch (err) {
      req.log.error({ err, id }, 'publish_failed');
      await updateBuild(buildId, { state: 'publish_failed', error: 'publish_failed' });
      return reply.code(500).send({ error: 'publish_failed' });
    }

    try {
      await notifyAdmins(
        'App published',
        `Build ${buildId} has been approved and published by ${req.authUser?.uid || 'unknown admin'}.`,
      );
    } catch {}

    req.log.info({ id: buildId, uid: req.authUser?.uid }, 'review_approved');
    return { ok: true };
  });

  app.post('/review/reject/:id', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    const reason = (req.body as any)?.reason;

    if (buildId) {
      await updateBuild(buildId, { state: 'rejected', ...(reason ? { error: reason } : {}) });
    }

    try {
      const appIndex = resolved?.appIndex ?? -1;
      if (appIndex >= 0) {
        const app = resolved!.apps[appIndex];
        const now = Date.now();
        const payload: Record<string, any> = {};

        if (buildId && app.pendingBuildId === buildId) {
          payload.pendingBuildId = FieldValue.delete();
          payload.pendingVersion = FieldValue.delete();
        } else {
          payload.status = 'rejected';
          payload.state = 'inactive';
        }

        payload.updatedAt = now;
        payload.moderation = {
          status: 'rejected',
          at: now,
          by: req.authUser?.uid ?? null,
          reason: reason || null,
        };
        await updateApp(app.id, payload);
      }
    } catch (err) {
      req.log.error({ err, id: buildId ?? id }, 'listing_reject_update_failed');
    }

    req.log.info({ id: buildId ?? id, uid: req.authUser?.uid, reason }, 'review_rejected');
    return { ok: true };
  });

  // Permissions policy (admin-only): persist simple allow flags per build
  app.get('/review/builds/:id/policy', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const p = path.join(BUNDLE_ROOT, 'builds', buildId, 'policy.json');
    try {
      const raw = await fs.readFile(p, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { camera: false, microphone: false, geolocation: false, clipboardRead: false, clipboardWrite: false };
    }
  });

  app.post('/review/builds/:id/policy', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const body = (req.body as any) || {};
    const allowed = {
      camera: Boolean(body.camera),
      microphone: Boolean(body.microphone),
      geolocation: Boolean(body.geolocation),
      clipboardRead: Boolean(body.clipboardRead),
      clipboardWrite: Boolean(body.clipboardWrite),
    };
    const p = path.join(BUNDLE_ROOT, 'builds', buildId, 'policy.json');
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(allowed, null, 2));
    return { ok: true, policy: allowed };
  });

  app.post('/review/builds/:id/delete', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const resolved = await resolveBuildContext(id);
      const appIndex = resolved?.appIndex ?? -1;
      if (appIndex >= 0) {
        const app = resolved!.apps[appIndex];
        await updateApp(app.id, { deletedAt: Date.now() });
      }
      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, id }, 'soft_delete_failed');
      return reply.code(500).send({ ok: false, error: 'soft_delete_failed' });
    }
  });

  app.post('/review/builds/:id/force-delete', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const cfg = getConfig();

    // Remove listing by buildId/slug/id if present
    try {
      const apps = await readApps();
      const idx = apps.findIndex(
        (a: any) => a.buildId === id || a.slug === id || String(a.id) === id,
      );
      const removed = idx >= 0 ? apps[idx] : undefined;
      if (idx >= 0) {
        apps.splice(idx, 1);
        await writeApps(apps);
      }

      // Best-effort filesystem cleanup of build artifacts
      try {
        const dir = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', id);
        await fs.rm(dir, { recursive: true, force: true });
      } catch {}

      // Best-effort bucket cleanup
      try {
        const bucket = getBucket();
        await bucket.deleteFiles({ prefix: `builds/${id}/` });
      } catch {}

      return reply.send({ ok: true, removedListingId: removed?.id });
    } catch (err) {
      req.log.error({ err, id }, 'hard_delete_failed');
      return reply.code(500).send({ ok: false, error: 'delete_failed' });
    }
  });

  app.post('/review/builds/:id/restore', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const apps = await readApps();
      const idx = apps.findIndex(
        (a: any) => a.buildId === id || a.slug === id || String(a.id) === id,
      );
      if (idx >= 0) {
        delete apps[idx].deletedAt;
        await writeApps(apps);
      }
      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, id }, 'restore_failed');
      return reply.code(500).send({ ok: false, error: 'restore_failed' });
    }
  });

  // Manually (re)queue a build job for a given buildId or appId/slug
  app.post('/review/builds/:id/rebuild', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const resolved = await resolveBuildContext(id);
      const apps = resolved?.apps ?? (await readApps());
      const appIndex = resolved?.appIndex ?? (resolved?.buildId ? findAppIndexByIdentifier(apps, resolved.buildId) : -1);
      const buildId = resolved?.buildId || (appIndex >= 0 ? String(apps[appIndex]?.pendingBuildId || apps[appIndex]?.buildId || '') : '');
      if (!buildId) return reply.code(404).send({ ok: false, error: 'missing_build_id' });
      if (isJobActive(buildId)) return reply.code(409).send({ ok: false, error: 'build_in_progress' });
      await createJob(buildId, app.log);
      return reply.code(202).send({ ok: true, buildId, status: 'queued' });
    } catch (err) {
      req.log.error({ err, id }, 'rebuild_failed');
      return reply.code(500).send({ ok: false, error: 'rebuild_failed' });
    }
  });
}