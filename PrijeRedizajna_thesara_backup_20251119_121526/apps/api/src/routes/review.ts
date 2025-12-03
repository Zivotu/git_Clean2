import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { Prisma } from '@prisma/client';
import { requireRole } from '../middleware/auth.js';
import { getBucket } from '../storage.js';
import * as tar from 'tar';
import archiver from 'archiver';
// Uklonjena neispravna 'declare module' augmentacija za 'archiver'.
import {
  listBuilds,
  readBuild,
  updateBuild,
  getBuildArtifacts,
  publishBundle,
} from '../models/Build.js';
import type { BuildState } from '../models/Build.js';
import { getConfig, LLM_REVIEW_ENABLED } from '../config.js';
import { BUNDLE_ROOT, PREVIEW_ROOT } from '../paths.js';
import { readApps, writeApps, updateApp, type AppRecord } from '../db.js';
import { prisma } from '../db.js';
import { runLlmReviewForBuild } from '../llmReview.js';
import { computeNextVersion } from '../lib/versioning.js';
import { createJob, isJobActive } from '../buildQueue.js';
import { ensureListingPreview } from '../lib/preview.js';
import { sse } from '../sse.js';
import { sendTemplateToUser } from '../notifier.js';

type DeletableAppPayload = Omit<Partial<AppRecord>, 'deletedAt' | 'adminDeleteSnapshot'> & {
  deletedAt?: number | FieldValue;
  adminDeleteSnapshot?: AppRecord['adminDeleteSnapshot'] | FieldValue;
};

// Note: This file is being refactored to remove array paths and use a helper.
// The original file had duplicate route registrations which are being cleaned up.

// Helper: registrira /review/* i automatski /api/review/* alias, bez array-paths
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
function route(method: Method, url: string, optsOrHandler: any, maybeHandler?: any) {
  return (app: FastifyInstance) => {
    const opts = typeof optsOrHandler === 'function' ? {} : (optsOrHandler || {});
    const handler = typeof optsOrHandler === 'function' ? optsOrHandler : maybeHandler;
    app.route({ method, url, ...opts, handler });
    if (url.startsWith('/review/')) {
      app.route({ method, url: `/api${url}`, ...opts, handler });
    }
  };
}

export default async function reviewRoutes(app: FastifyInstance) {
  const admin = { preHandler: requireRole('admin') };

  // Napomena: custom parsere privremeno uklanjamo radi sintaksnog konflikta.
  // Approve endpoint će se zvati s Content-Type: application/json i praznim tijelom "{}".

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

  const extractDbErrorDetail = (err: unknown): string => {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return err.message.replace(/\s+/g, ' ').trim();
    }
    if (err instanceof Error) {
      const sqliteMatch = /sqlite(?: error)?:\s*(.+)$/i.exec(err.message);
      if (sqliteMatch?.[1]) {
        return sqliteMatch[1].trim();
      }
      return err.message.replace(/\s+/g, ' ').trim();
    }
    return 'Unknown database error';
  };

  // Detects a Prisma/SQLite "missing table" scenario so we can soft-skip DB persistence in production
  const isMissingTableError = (err: unknown): boolean => {
    const msg = String((err as any)?.message || err || '').toLowerCase();
    const code = (err as any)?.code;
    if (code === 'P2021') return true; // Prisma: table does not exist
    return /table\s+.*\s+does\s+not\s+exist/.test(msg);
  };

  // Detect Prisma record-not-found (P2025) and similar messages
  const isRecordNotFoundError = (err: unknown): boolean => {
    const code = (err as any)?.code;
    if (code === 'P2025') return true;
    const msg = String((err as any)?.message || err || '').toLowerCase();
    return /no record was found for an update|record.*not found/.test(msg);
  };

  const formatErrorDetail = (err: unknown): string => {
    if (err instanceof Error) {
      return err.message.replace(/\s+/g, ' ').trim() || 'Unknown error';
    }
    return 'Unknown error';
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

  const asStringState = (value?: string): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const asNonDeletedBuildState = (value?: string): Exclude<BuildState, 'deleted'> | undefined => {
    const str = asStringState(value);
    return str && str !== 'deleted' ? (str as Exclude<BuildState, 'deleted'>) : undefined;
  };

  type BuildResolveContext = {
    buildId: string;
    build?: Awaited<ReturnType<typeof readBuild>>;
    apps: AppRecord[];
    appIndex: number;
  };

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

  // --- ROUTES ---

  route('GET', '/review/config', admin, async (req: any) => {
    return { llmReviewEnabled: LLM_REVIEW_ENABLED, uid: req.authUser?.uid };
  })(app);

  const getBuildsHandler = async (req: any, reply: FastifyReply) => {
    const { status, cursor } = req.query as { status?: string; cursor?: string };
    // Note: The `listBuilds` function in the original code seems to have a logic issue where `cursor` is treated as a number.
    // A proper implementation would use string cursors (e.g., the ID of the last item).
    // For now, we'll adhere to the existing `Number(cursor)` logic.
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
      'deleted',
    ];

    let builds = items.filter((b) => allowed.includes(b.state));

    if (status === 'deleted') {
      builds = builds.filter((b) => b.state === 'deleted');
    } else {
      builds = builds.filter((b) => b.state !== 'deleted');
    }

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
  };
  route('GET', '/review/builds', admin, getBuildsHandler)(app);

  const getBuildByIdHandler = async (req: any, reply: FastifyReply) => {
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
  };
  route('GET', '/review/builds/:id', admin, getBuildByIdHandler)(app);

  const getLlmReportHandler = async (req: any, reply: FastifyReply) => {
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
  };
  route('GET', '/review/builds/:id/llm', admin, getLlmReportHandler)(app);

  const postLlmReportHandler = async (req: any, reply: FastifyReply) => {
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
      const code = err?.errorCode || err?.code || 'LLM_FAILED';
      const message = String(err?.message || err || 'Unknown LLM error');
      await updateBuild(buildId, { state: 'failed', error: message });
      try {
        await prisma.build.update({ where: { id: buildId }, data: { status: 'llm_failed', error: message, reason: code } });
      } catch (dbErr) {
        req.log.error({ err: dbErr, buildId }, 'llm_review_failed_prisma_update_error');
      }
      return reply.code(500).send({ error: code, message: message });
    }
  };
  route('POST', '/review/builds/:id/llm', admin, postLlmReportHandler)(app);

  const getReportHandler = async (req: any, reply: FastifyReply) => {
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
  };
  route('GET', '/review/report/:id', admin, getReportHandler)(app);

  const getArtifactsHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });
    const artifacts = await getBuildArtifacts(buildId);
    const cfg = getConfig();

    // 1. Bundle-first: provjeri postoji li `bundle/index.html`
    const bundleIndexPath = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId, 'bundle', 'index.html');
    let previewIndex: { exists: boolean; url?: string };
    try {
      await fs.access(bundleIndexPath);
      previewIndex = { exists: true, url: `/review/builds/${buildId}/bundle/index.html` };
    } catch {
      // 2. Fallback: provjeri postoji li legacy preview
      const legacyPreviewPath = path.join(PREVIEW_ROOT, buildId, 'index.html');
      try {
        await fs.access(legacyPreviewPath);
        previewIndex = { exists: true, url: `/review/previews/${buildId}/index.html` };
      } catch {
        // 3. Ako ništa ne postoji
        previewIndex = { exists: false };
      }
    }

    return { ...artifacts, buildId, previewIndex };
  };
  route('GET', '/review/artifacts/:id', admin, getArtifactsHandler)(app);

  const getCodeHandler = async (req: any, reply: FastifyReply) => {
    // Dozvola za preuzimanje koda putem tokena u query stringu (za admin UI)
    // Ovo je iznimka od standardnog `Authorization: Bearer` toka
    const hasAuthHeader = !!req.headers.authorization;

    if (!hasAuthHeader) {
      const { token } = req.query as { token?: string };
      if (!token) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
      try {
        // Ručna verifikacija tokena i postavljanje `authUser` ako nedostaje
        // Ovo je potrebno jer se `requireRole` oslanja na `req.authUser`
        // koji postavlja globalni `auth` middleware, a on ne gleda query string.
        // TODO: Refaktorirati u dedicirani `auth` plugin/dekorator koji
        // može baratati s više izvora tokena.

        const decoded = await getAuth().verifyIdToken(token);
        const claims: any = decoded;
        const role = claims.role || (claims.admin ? 'admin' : 'user');
        req.authUser = { uid: decoded.uid, role, claims: decoded };
      } catch (err) {
        req.log.debug({ err }, 'auth:token_invalid');
        return reply.code(401).send({ error: 'invalid auth token' });
      }
    }

    // `requireRole` provjerava `req.authUser` koji je postavljen ili
    // od globalnog middleware-a (za `Authorization` header) ili od gornjeg bloka.
    await requireRole('admin')(req, reply);
    if (reply.sent) return; // Ako `requireRole` pošalje 401/403, prekini

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
  };
  route('GET', '/review/code/:id', {}, getCodeHandler)(app);

  // Stabilan approve handler (ne oslanja se na body)
  const approveHandler = async (req: any, reply: FastifyReply) => {
    const { id } = (req.params || {}) as { id?: string };
    if (!id) return reply.code(400).send({ ok: false, error: 'missing_id' });
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    if (!buildId) return reply.code(404).send({ error: 'not_found' });

    const rec = resolved?.build ?? (await readBuild(buildId));
    if (!rec) return reply.code(404).send({ error: 'not_found' });

    let approvalRecipient:
      | {
          uid?: string;
          email?: string;
          title?: string;
          appId?: string;
          slug?: string;
        }
      | undefined;

    await updateBuild(buildId, { state: 'publishing' });

    let bundlePublicUrl: string;
    try {
      bundlePublicUrl = await publishBundle(buildId);
    } catch (err: unknown) {
      const detail = formatErrorDetail(err);
      req.log.error({ err, id, detail }, 'publish_failed');
      await updateBuild(buildId, { state: 'publish_failed', error: detail, reasons: [detail] });
      try {
        await prisma.build.update({
          where: { id: buildId },
          data: { status: 'publish_failed', error: detail, reason: detail, progress: 100 },
        });
      } catch (dbErr) {
        const dbDetail = extractDbErrorDetail(dbErr);
        req.log.error({ err: dbErr, buildId, dbDetail }, 'publish_failed_prisma_update_error');
      }
      return reply.code(500).send({ ok: false, error: 'publish_failed', detail });
    }

    try {
      await prisma.build.update({
        where: { id: buildId },
        data: { status: 'publishing', bundlePublicUrl, progress: 90, error: null, reason: null },
      });
    } catch (err: unknown) {
      // Soft-skip if Prisma tables aren't present OR record doesn't exist in DB
      if (isMissingTableError(err)) {
        req.log.warn({ err, buildId }, 'publish_bundle_db_update_skipped_missing_tables');
      } else if (isRecordNotFoundError(err)) {
        req.log.warn({ err, buildId }, 'publish_bundle_db_update_skipped_missing_record');
      } else {
        const detail = extractDbErrorDetail(err);
        req.log.error({ err, detail, buildId }, 'publish_bundle_db_update_failed');
        await updateBuild(buildId, { state: 'publish_failed', error: detail, reasons: [detail] });
        return reply.code(500).send({ ok: false, error: 'db_error', detail });
      }
    }

    try {
      const appIndex = resolved?.appIndex ?? -1;
      if (appIndex >= 0) {
        const app = resolved!.apps[appIndex];
        const now = Date.now();
        const payload: Record<string, any> = {};

        approvalRecipient = {
          uid: app?.author?.uid || (app as any)?.ownerUid,
          email: (app as any)?.author?.email || (app as any)?.contactEmail,
          title: app?.title,
          appId: String(app?.id ?? ''),
          slug: app?.slug,
        };

        if (app.pendingBuildId === buildId) {
          req.log.info({ 
            buildId, 
            appId: app.id, 
            pendingBuildId: app.pendingBuildId,
            buildIdType: typeof buildId,
            buildIdLength: buildId.length,
            buildIdChars: buildId.split('')
          }, 'approve_setting_buildId_from_pending');
          const { version, archivedVersions } = computeNextVersion(app, now);
          payload.archivedVersions = archivedVersions;
          payload.version = version;
          payload.buildId = buildId;
          payload.pendingBuildId = FieldValue.delete();
          payload.pendingVersion = FieldValue.delete();
        } else if (!app.buildId) {
          req.log.info({ 
            buildId, 
            appId: app.id,
            buildIdType: typeof buildId,
            buildIdLength: buildId.length,
            buildIdChars: buildId.split('')
          }, 'approve_setting_buildId_new');
          payload.buildId = buildId;
        }

        payload.status = 'published';
        payload.state = 'active';
        if (app.visibility !== 'public') {
          payload.visibility = 'public';
        }
        payload.playUrl = `/play/${app.id}/`;
        payload.bundlePublicUrl = bundlePublicUrl;

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

        req.log.info({ 
          appId: app.id,
          payloadBuildId: payload.buildId,
          payloadKeys: Object.keys(payload)
        }, 'approve_before_updateApp');
        
        await updateApp(app.id, payload);
        
        req.log.info({ 
          appId: app.id,
          buildIdWritten: payload.buildId 
        }, 'approve_after_updateApp');
        
        try {
          const { ensureListingTranslations } = await import('../lib/translate.js');
          await ensureListingTranslations({ ...app, ...payload }, ['en', 'hr', 'de']);
        } catch (err) {
          req.log.warn({ err, appId: app.id }, 'translation_ensure_failed');
        }
      }

      // Persist final status if DB is available; otherwise continue without failing
      try {
        await prisma.build.update({
          where: { id: buildId },
          data: { status: 'published', progress: 100 },
        });
      } catch (dbErr) {
        if (isMissingTableError(dbErr)) {
          req.log.warn({ err: dbErr, buildId }, 'publish_finalize_prisma_skipped_missing_tables');
        } else if (isRecordNotFoundError(dbErr)) {
          req.log.warn({ err: dbErr, buildId }, 'publish_finalize_prisma_skipped_missing_record');
        } else {
          throw dbErr;
        }
      }
      await updateBuild(buildId, { state: 'published' });
    } catch (err) {
      const detail = formatErrorDetail(err);
      req.log.error({ err, id, detail }, 'publish_finalize_failed'); // err is already unknown here
      await updateBuild(buildId, { state: 'publish_failed', error: detail, reasons: [detail] });
      try {
        await prisma.build.update({
          where: { id: buildId },
          data: { status: 'publish_failed', error: detail, reason: detail, progress: 100 },
        });
      } catch (dbErr) {
        const dbDetail = extractDbErrorDetail(dbErr);
        req.log.error({ err: dbErr, buildId, dbDetail }, 'publish_finalize_prisma_update_error');
      }
      return reply.code(500).send({ ok: false, error: 'publish_failed', detail });
    }

    if (approvalRecipient?.uid) {
      try {
        const cfgLinks = getConfig();
        const titleForMail =
          (approvalRecipient.title && approvalRecipient.title.trim()) ||
          approvalRecipient.slug ||
          approvalRecipient.appId ||
          buildId;
        const webBaseRaw = cfgLinks.WEB_BASE || cfgLinks.PUBLIC_BASE || '';
        const webBase =
          typeof webBaseRaw === 'string' && webBaseRaw
            ? webBaseRaw.replace(/\/$/, '')
            : '';
        const manageUrl = webBase ? `${webBase}/my` : undefined;
        try {
          await sendTemplateToUser('review:approval_notification', approvalRecipient.uid, {
            displayName: approvalRecipient?.title ?? undefined,
            appTitle: titleForMail,
            appId: approvalRecipient.appId,
            manageUrl,
          }, { email: approvalRecipient.email });
        } catch (err) {
          req.log.warn({ err, buildId, uid: approvalRecipient.uid }, 'review_approve_send_template_failed');
        }
      } catch (err) {
        req.log.warn(
          { err, buildId, uid: approvalRecipient.uid },
          'review_approve_notify_user_failed',
        );
      }
    }

    try {
      if (buildId) {
        const payload: any = { status: 'published', reason: 'approved', buildId };
        if (approvalRecipient?.appId) payload.listingId = approvalRecipient.appId;
        sse.emit(buildId, 'final', payload);
      }
    } catch {}

    req.log.info({ id: buildId, uid: req.authUser?.uid }, 'review_approved');
    return { ok: true };
  };
  route('POST', '/review/approve/:id', admin, approveHandler)(app);
  route('POST', '/review/refresh/:id', admin, approveHandler)(app);

  const rejectHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const resolved = await resolveBuildContext(id);
    const buildId = resolved?.build?.id || resolved?.buildId;
    const reason = (req.body as any)?.reason;
    let rejectionRecipient:
      | {
          uid?: string;
          email?: string;
          title?: string;
          appId?: string;
          slug?: string;
        }
      | undefined;

    if (buildId) {
      await updateBuild(buildId, { state: 'rejected', ...(reason ? { error: reason } : {}) });
      // Defer emitting the final SSE until after we determine the listing (rejectionRecipient)
      // so the event can include the listingId for clients.
    }

    try {
      const appIndex = resolved?.appIndex ?? -1;
      if (appIndex >= 0) {
        const app = resolved!.apps[appIndex];
        const now = Date.now();
        const payload: Record<string, any> = {};

        rejectionRecipient = {
          uid: app?.author?.uid || (app as any)?.ownerUid,
          email: (app as any)?.author?.email || (app as any)?.contactEmail,
          title: app?.title,
          appId: String(app?.id ?? ''),
          slug: app?.slug,
        };

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
        await updateApp(app.id, payload as Partial<AppRecord>);
      } 
    } catch (err: unknown) {
      req.log.error({ err, id: buildId ?? id }, 'listing_reject_update_failed');
    }

  if (rejectionRecipient?.uid) {
      try {
        const cfgLinks = getConfig();
        const titleForMail =
          (rejectionRecipient.title && rejectionRecipient.title.trim()) ||
          rejectionRecipient.slug ||
          rejectionRecipient.appId ||
          buildId ||
          id;
        const webBaseRaw = cfgLinks.WEB_BASE || cfgLinks.PUBLIC_BASE || '';
        const webBase =
          typeof webBaseRaw === 'string' && webBaseRaw
            ? webBaseRaw.replace(/\/$/, '')
            : '';
        const manageUrl = webBase ? `${webBase}/my` : undefined;
        try {
          await sendTemplateToUser('review:reject_notification', rejectionRecipient.uid, {
            displayName: rejectionRecipient?.title ?? undefined,
            appTitle: titleForMail,
            appId: rejectionRecipient.appId,
            reason: reason ?? undefined,
            manageUrl,
          }, { email: rejectionRecipient.email });
        } catch (err) {
          req.log.warn({ err, id: buildId ?? id, uid: rejectionRecipient.uid }, 'review_reject_send_template_failed');
        }
      } catch (err) {
        req.log.warn(
          { err, id: buildId ?? id, uid: rejectionRecipient.uid },
          'review_reject_notify_user_failed',
        );
      }
    }

    try {
      if (buildId) {
        const payload: any = { status: 'rejected', reason, buildId };
        if (rejectionRecipient?.appId) payload.listingId = rejectionRecipient.appId;
        sse.emit(buildId, 'final', payload);
      }
    } catch {}

    req.log.info({ id: buildId ?? id, uid: req.authUser?.uid, reason }, 'review_rejected');
    return { ok: true };
  };
  route('POST', '/review/reject/:id', admin, rejectHandler)(app);

  // Permissions policy (admin-only): persist simple allow flags per build
  const getPolicyHandler = async (req: any, reply: FastifyReply) => {
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
  };
  route('GET', '/review/builds/:id/policy', admin, getPolicyHandler)(app);

  const postPolicyHandler = async (req: any, reply: FastifyReply) => {
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
  };
  route('POST', '/review/builds/:id/policy', admin, postPolicyHandler)(app);

  // Admin: update listing fields (visibility, accessMode, status, state, etc.)
  const adminUpdateHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as Record<string, any>;

    const allowed = new Set([
      'visibility',
      'accessMode',
      'status',
      'state',
      'publishedAt',
      'playUrl',
      'bundlePublicUrl',
      'updatedAt',
    ]);

    const patch: Record<string, any> = {};
    for (const k of Object.keys(body)) {
      if (allowed.has(k)) patch[k] = body[k];
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ ok: false, error: 'no_allowed_fields' });
    }

    try {
      const apps = await readApps();
      const resolved = await resolveBuildContext(id, { apps });
      const idx = resolved?.appIndex ?? -1;
      if (idx < 0) return reply.code(404).send({ ok: false, error: 'not_found' });
      const app = resolved!.apps[idx];

      // normalize timestamps if provided as strings
      if (typeof patch.publishedAt === 'string' && /^\d+$/.test(patch.publishedAt)) {
        patch.publishedAt = Number(patch.publishedAt);
      }
      if (typeof patch.updatedAt === 'string' && /^\d+$/.test(patch.updatedAt)) {
        patch.updatedAt = Number(patch.updatedAt);
      }

      await updateApp(app.id, patch as any);

      return reply.send({ ok: true });
    } catch (err: unknown) {
      req.log.error({ err, id }, 'admin_update_failed');
      return reply.code(500).send({ ok: false, error: 'admin_update_failed' });
    }
  };
  route('POST', '/review/builds/:id/admin-update', admin, adminUpdateHandler)(app);

  const deleteHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const now = Date.now();

    try {
      const resolved = await resolveBuildContext(id);
      const appIndex = resolved?.appIndex ?? -1;
      const buildId = resolved?.buildId;
      const build = resolved?.build ?? (buildId ? await readBuild(buildId) : undefined);

      if (appIndex >= 0) {
        const app = resolved!.apps[appIndex];
        const snapshot = {
          state: app.state,
          status: app.status,
          publishedAt: app.publishedAt,
        };

        const payload: Partial<AppRecord> = {
          deletedAt: now,
          state: 'inactive',
          updatedAt: now,
          adminDeleteSnapshot: snapshot,
        };

        if (app.status === 'published') {
          payload.status = 'draft';
        } else if (app.status) {
          payload.status = app.status;
        }

        await updateApp(app.id, payload);
      }

      if (buildId) {
        const previousState =
          asNonDeletedBuildState(build?.state) ??
          asNonDeletedBuildState(build?.previousState);

        const patch: Parameters<typeof updateBuild>[1] = {
          state: 'deleted',
          deletedAt: now,
        };
        if (previousState) {
          patch.previousState = previousState;
        }
        await updateBuild(buildId, patch);
      }

      return reply.send({ ok: true });
    } catch (err: unknown) {
      req.log.error({ err, id }, 'soft_delete_failed');
      return reply.code(500).send({ ok: false, error: 'soft_delete_failed' });
    }
  };
  route('POST', '/review/builds/:id/delete', admin, deleteHandler)(app);

  const forceDeleteHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const cfg = getConfig();

    try {
      const apps = await readApps();
      const resolved = await resolveBuildContext(id, { apps });
      const buildId = resolved?.buildId;
      const idx = apps.findIndex(
        (a: any) => a.buildId === buildId || a.slug === id || String(a.id) === id || a.pendingBuildId === buildId,
      );
      const removed = idx >= 0 ? apps[idx] : undefined;

      // If there's no buildId and nothing to remove, surface not_found
      if (!buildId && idx < 0) {
        return reply.code(404).send({ ok: false, error: 'not_found' });
      }

      let cleanupError: Error | null = null;

      if (buildId) {
        // Attempt filesystem + bucket cleanup first. If these succeed we will
        // remove the listing from the apps list. If they fail, we will not
        // silently drop the listing; instead we write an observability field
        // so admins can retry and inspect the error.
        try {
          const dir = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId);

          // Try rm with retries in case of transient FS errors
          const tryRm = async () => {
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await fs.rm(dir, { recursive: true, force: true });
                return;
              } catch (err: any) {
                if (attempt === 3) throw err;
                // small backoff
                await new Promise((res) => setTimeout(res, 250 * attempt));
              }
            }
          };

          await tryRm();

          // Try bucket cleanup with retries
          const tryBucketDelete = async () => {
            const bucket = getBucket();
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await bucket.deleteFiles({ prefix: `builds/${buildId}/` });
                return;
              } catch (err: any) {
                if (attempt === 3) throw err;
                await new Promise((res) => setTimeout(res, 250 * attempt));
              }
            }
          };

          await tryBucketDelete();
        } catch (err: any) {
          cleanupError = err instanceof Error ? err : new Error(String(err));
          req.log.error({ err: cleanupError, buildId, id }, 'force_delete_cleanup_failed');
        }
      }

      if (cleanupError) {
        // Mark the listing with a deletionAttempted timestamp and the error so
        // admins can see and retry. Do NOT remove the listing to avoid
        // orphaned/unrecoverable artifact state.
        try {
          if (removed?.id) {
            await updateApp(removed.id, {
              deletionAttemptedAt: Date.now(),
              deletionError: String(cleanupError.message || cleanupError),
              updatedAt: Date.now(),
            } as any);
          }
        } catch (err: any) {
          req.log.error({ err, buildId, id }, 'force_delete_mark_failed');
        }
        return reply.code(500).send({ ok: false, error: 'cleanup_failed', detail: String(cleanupError.message || cleanupError) });
      }

      // Cleanup succeeded (or there was no buildId). Remove the listing if present
      if (idx >= 0) {
        apps.splice(idx, 1);
        await writeApps(apps);
      }

      return reply.send({ ok: true, removedListingId: removed?.id });
    } catch (err: unknown) {
      req.log.error({ err, id }, 'hard_delete_failed');
      return reply.code(500).send({ ok: false, error: 'delete_failed' });
    }
  };
  route('POST', '/review/builds/:id/force-delete', admin, forceDeleteHandler)(app);

  const restoreHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const now = Date.now();
    try {
      const apps = await readApps();
      const resolved = await resolveBuildContext(id, { apps });
      const idx = resolved?.appIndex ?? -1;

      if (idx >= 0) {
        const app = apps[idx];
        const snapshot = (app as any)?.adminDeleteSnapshot || {};
        const restoredState =
          typeof snapshot.state === 'string' && snapshot.state.length ? snapshot.state : 'active';
        const restoredStatus =
          typeof snapshot.status === 'string' && snapshot.status.length
            ? snapshot.status
            : 'pending-review';

        const payload: DeletableAppPayload = {
          deletedAt: FieldValue.delete(),
          state: restoredState,
          status: restoredStatus,
          updatedAt: now,
          adminDeleteSnapshot: FieldValue.delete(),
        };

        if (typeof snapshot.publishedAt === 'number') {
          payload.publishedAt = snapshot.publishedAt;
        }

        await updateApp(app.id, payload as Partial<AppRecord>);
      }

      const buildId = resolved?.buildId;
      if (buildId) {
        const build = resolved?.build ?? (await readBuild(buildId));
        if (build) {
        const previousStateValue = asNonDeletedBuildState(build.previousState);
        const fallbackState: Exclude<BuildState, 'deleted'> =
          previousStateValue ?? 'pending_review';
          await updateBuild(buildId, {
            state: fallbackState,
            previousState: undefined,
            deletedAt: undefined,
          });
        }
      }

      return reply.send({ ok: true });
    } catch (err: unknown) {
      req.log.error({ err, id }, 'restore_failed');
      return reply.code(500).send({ ok: false, error: 'restore_failed' });
    }
  };
  route('POST', '/review/builds/:id/restore', admin, restoreHandler)(app);

  // Manually (re)queue a build job for a given buildId or appId/slug
  const rebuildHandler = async (req: any, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      const resolved = await resolveBuildContext(id);
      const apps = resolved?.apps ?? (await readApps());
      const appIndex = resolved?.appIndex ?? (resolved?.buildId ? findAppIndexByIdentifier(apps, resolved.buildId) : -1);
      const buildId = resolved?.buildId || (appIndex >= 0 ? String(apps[appIndex]?.pendingBuildId || apps[appIndex]?.buildId || '') : '');
      if (!buildId) return reply.code(404).send({ ok: false, error: 'missing_build_id' });

      if (isJobActive(buildId)) return reply.code(409).send({ ok: false, error: 'build_in_progress' });
      await createJob(buildId, req.log);
      return reply.code(202).send({ ok: true, buildId, status: 'queued' });
    } catch (err: unknown) {
      req.log.error({ err, id }, 'rebuild_failed');
      return reply.code(500).send({ ok: false, error: 'rebuild_failed' });
    }
  };
  route('POST', '/review/builds/:id/rebuild', admin, rebuildHandler)(app);
}
