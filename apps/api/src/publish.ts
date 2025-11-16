import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as esbuild from 'esbuild';
import { createJob, isJobActive } from '../buildQueue.js';
import { notifyAdmins, notifyUserModeration } from '../notifier.js';
import { getBuildDir } from '../paths.js';
import { readApps, writeApps, type AppRecord, listEntitlements } from '../db.js';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { computeNextVersion } from '../lib/versioning.js';
import { ensureListingPreview, saveListingPreviewFile } from '../lib/preview.js';
import { writeArtifact } from '../utils/artifacts.js';
import { Prisma } from '@prisma/client';
import { sseEmitter } from '../lib/sseEmitter.js';
import { ensureDependencies } from '../lib/dependencies.js';
import { ensureListingTranslations } from '../lib/translate.js';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

interface PublishPayload {
  id: string;
  title?: string;
  description?: string;
  translations?: Record<string, { title?: string; description?: string }>;
  author?: { uid: string; handle?: string };
  capabilities?: {
    permissions?: {
      camera?: boolean;
      microphone?: boolean;
      webgl?: boolean;
      fileDownload?: boolean;
    };
    network?: {
      access?: string;
      mediaDomains?: string[];
      domains?: string[];
    };
    storage?: {
      enabled?: boolean;
    };
    features?: string[];
  };
  inlineCode: string;
  visibility?: string;
  preview?: {
    dataUrl?: string;
  };
}

function parseDataUrl(input: string | undefined): { mimeType: string; buffer: Buffer } | null {
  if (!input) return null;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    return { mimeType: match[1] || 'image/png', buffer };
  } catch {
    return null;
  }
}

function extractDbErrorDetail(err: unknown): string {
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
}

async function ensureListingRecord(opts: {
  listingId: string | number;
  title?: string | null;
  uid?: string | null;
  buildId: string;
}) {
  const { listingId, title, uid, buildId } = opts;
  const id = String(listingId);
  const safeTitle = (title?.trim() || 'Untitled').slice(0, 200);
  await prisma.listing.upsert({
    where: { id },
    update: {
      pendingBuildId: buildId,
      updatedAt: new Date(),
    },
    create: {
      id,
      title: safeTitle,
      status: 'pending_review',
      authorUid: uid ?? null,
      pendingBuildId: buildId,
    },
  });
}

export default async function publishRoutes(app: FastifyInstance) {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    req.log.info('publish:received');
    const uid = req.authUser?.uid;
    if (!uid) {
      return reply.code(401).send({ ok: false, error: 'unauthorized' });
    }

    const body = req.body as PublishPayload | undefined;
    if (!body || !body.inlineCode) {
      return reply.code(400).send({ ok: false, error: 'invalid payload' });
    }

    const appId = (body as any).id != null ? String((body as any).id) : undefined;
    const buildId = randomUUID();
    if (isJobActive(buildId)) {
      return reply.code(409).send({ ok: false, error: 'build_in_progress' });
    }
    body.author = body.author || { uid };

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
      const activeOwned = owned.filter((a) => a.state !== 'inactive');
      if (activeOwned.length >= limit) {
        return reply
          .code(403)
          .send({
            ok: false,
            error: 'max_apps',
            message: `Dosegli ste maksimalan broj aplikacija (${limit})`,
          });
      }
    }

    const code = String(body.inlineCode || '');
    const sesRe =
      /(lockdown\s*\(|\brequire\s*\(\s*['"]ses['"]\s*\)|\bfrom\s+['"]ses['"]|import\s*\(\s*['"]ses['"]\s*\))/;
    if (sesRe.test(code)) {
      req.log.info({ reason: 'ses_lockdown' }, 'publish:blocked');
      return reply.code(400).send({
        ok: false,
        error: 'ses_lockdown',
        code: 'ses_lockdown',
        message: 'SES/lockdown is not supported in the browser. Remove it or guard for server-only.',
      });
    }

    const now = Date.now();
    const numericIds = apps
      .map((a) => Number(a.id))
      .filter((n) => !Number.isNaN(n));
    const idx = appId ? apps.findIndex((a) => a.id === appId || a.slug === appId) : -1;
    const existing = idx >= 0 ? apps[idx] : undefined;
    const listingId = existing
      ? Number(existing.id)
      : (numericIds.length ? Math.max(...numericIds) : 0) + 1;

    try {
      // 1) osiguraj da Listing zapis postoji prije Build.create (FK safety)
      await ensureListingRecord({
        listingId,
        title: (body as any)?.title,
        uid,
        buildId,
      });

      // 2) sada smijemo kreirati Build red, FK postoji
      await prisma.build.create({
        data: {
          id: buildId,
          listingId: String(listingId),
          appId: existing?.id ?? null,
          status: 'queued',
          mode: 'legacy',
          progress: 0,
        },
      });

      sseEmitter.emit(buildId, 'status', { status: 'queued' });
    } catch (err) {
      const detail = extractDbErrorDetail(err);
      req.log.error({ err, detail }, 'publish:build_record_failed');
      return reply.code(500).send({ ok: false, error: 'db_error', detail });
    }

    try {
      const dir = getBuildDir(buildId);
      await fs.mkdir(dir, { recursive: true });

      const buildDir = path.join(dir, 'build'); // Definiramo buildDir JEDNOM ovdje
      await fs.mkdir(buildDir, { recursive: true }); // Kreiramo 'build' poddirektorij

      const isHtml = body.inlineCode.trim().toLowerCase().startsWith('<!doctype html>');
      let indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/framer-motion@10/dist/framer-motion.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/recharts@2/umd/Recharts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html-to-image@1/dist/html-to-image.min.js"></script>
  <script>
    window.react = window.React;
    window['react-dom'] = window.ReactDOM;
    window['framer-motion'] = window.Motion;
    window.recharts = window.Recharts;
    window['html-to-image'] = window.htmlToImage;
  </script>
  <style>
    html,body{margin:0;padding:0}
    body{overflow-x:hidden}
    #root{min-height:100vh}
    .rounded-lg{border-radius:0.5rem}
    .border{border-width:1px}
    .bg-card{background-color:#fff}
    .text-card-foreground{color:#000}
    .shadow-sm{box-shadow:0 1px 2px 0 rgba(0,0,0,0.05)}
    .flex{display:flex}
    .flex-col{flex-direction:column}
    .space-y-1\\.5>*+*{margin-top:0.375rem}
    .p-6{padding:1.5rem}
    .pt-0{padding-top:0}
    .text-2xl{font-size:1.5rem;line-height:2rem}
    .font-semibold{font-weight:600}
    .leading-none{line-height:1}
    .tracking-tight{letter-spacing:-0.025em}
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="./build/app.js"></script>
</body>
</html>`;
      let appJs = '';

      if (isHtml) {
        indexHtml = body.inlineCode;
        appJs = '';
        // Ensure a minimal entry file exists so the async build worker
        // can run consistently (worker expects build/_app_entry.tsx).
        try {
          const entryPath = path.join(buildDir, '_app_entry.tsx');
          const stub = `export default function App(){ return null; }\n`;
          await fs.writeFile(entryPath, stub, 'utf8');
        } catch (err) {
          req.log?.warn?.({ err, buildId }, 'publish:write_stub_entry_failed');
        }
      } else {
        // Add ESM imports for common dependencies
        const preamble = `
import React from 'https://esm.sh/react@18';
import ReactDOM from 'https://esm.sh/react-dom@18';
import { motion } from 'https://esm.sh/framer-motion@10';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from 'https://esm.sh/recharts@2';

// Shadcn/UI component stubs
const Card = ({children, className=""}) => React.createElement('div', {className: 'rounded-lg border bg-card text-card-foreground shadow-sm ' + className}, children);
const CardHeader = ({children, className=""}) => React.createElement('div', {className: 'flex flex-col space-y-1.5 p-6 ' + className}, children);
const CardTitle = ({children, className=""}) => React.createElement('h3', {className: 'text-2xl font-semibold leading-none tracking-tight ' + className}, children);
const CardContent = ({children, className=""}) => React.createElement('div', {className: 'p-6 pt-0 ' + className}, children);
const Button = ({children, className="", ...props}) => React.createElement('button', {className: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 ' + className, ...props}, children);
const Input = ({className="", ...props}) => React.createElement('input', {className: 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ' + className, ...props});
const Label = ({children, className="", ...props}) => React.createElement('label', {className: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ' + className, ...props}, children);
const Slider = ({className="", ...props}) => React.createElement('input', {type: 'range', className: 'relative flex w-full touch-none select-none items-center ' + className, ...props});
`;

        // Convert imports to stubs based on what's used
        const imports = new Set<string>();
        const code = body.inlineCode;
        
        // Detect shadcn imports
        const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui\/(card|button|input|slider|label)['"];?/g;
        const importedComponents = new Set<string>();
        let match;
        while ((match = importRe.exec(code)) !== null) {
          const components = match[1].split(',').map(c => c.trim());
          components.forEach(c => importedComponents.add(c));
        }

        // Only include stubs for components that are not imported
        const stubMap = {
          Card: !importedComponents.has('Card'),
          CardHeader: !importedComponents.has('CardHeader'),
          CardTitle: !importedComponents.has('CardTitle'),
          CardContent: !importedComponents.has('CardContent'),
          Button: !importedComponents.has('Button'),
          Input: !importedComponents.has('Input'),
          Label: !importedComponents.has('Label'),
          Slider: !importedComponents.has('Slider')
        };

        // Build preamble with only needed stubs
        let stubCode = '';
        if (stubMap.Card) stubCode += `\nconst Card = ({children, className=""}) => React.createElement('div', {className: 'rounded-lg border bg-card text-card-foreground shadow-sm ' + className}, children);`;
        if (stubMap.CardHeader) stubCode += `\nconst CardHeader = ({children, className=""}) => React.createElement('div', {className: 'flex flex-col space-y-1.5 p-6 ' + className}, children);`;
        if (stubMap.CardTitle) stubCode += `\nconst CardTitle = ({children, className=""}) => React.createElement('h3', {className: 'text-2xl font-semibold leading-none tracking-tight ' + className}, children);`;
        if (stubMap.CardContent) stubCode += `\nconst CardContent = ({children, className=""}) => React.createElement('div', {className: 'p-6 pt-0 ' + className}, children);`;
        if (stubMap.Button) stubCode += `\nconst Button = ({children, className="", ...props}) => React.createElement('button', {className: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 ' + className, ...props}, children);`;
        if (stubMap.Input) stubCode += `\nconst Input = ({className="", ...props}) => React.createElement('input', {className: 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ' + className, ...props});`;
        if (stubMap.Label) stubCode += `\nconst Label = ({children, className="", ...props}) => React.createElement('label', {className: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ' + className, ...props}, children);`;
        if (stubMap.Slider) stubCode += `\nconst Slider = ({className="", ...props}) => React.createElement('input', {type: 'range', className: 'relative flex w-full touch-none select-none items-center ' + className, ...props});`;

        // Remove shadcn imports since we're using stubs
        const cleanedCode = code.replace(importRe, '');
        
        // Koristimo lokalne module umjesto ESM
        const finalCode = `
import React from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
${stubCode}

${cleanedCode}`;

        // Add import remapping
        const patchedCode = `
const require = module => {
  switch(module) {
    case 'react': return window.React;
    case 'react-dom': return window.ReactDOM;
    case 'framer-motion': return window.Motion;
    case 'recharts': return window.Recharts;
    case 'html-to-image': return window.htmlToImage;
    default: throw new Error('Module not found: ' + module);
  }
};
${finalCode}`;
        const entryPath = path.join(buildDir, '_app_entry.tsx');
        await fs.writeFile(entryPath, patchedCode, 'utf8');

        // esbuild se sada pokreće u workeru, ne ovdje.
        // Ostavljamo prazan app.js koji će worker prebrisati.
        appJs = '/* build in progress */';
      }
      await fs.writeFile(path.join(buildDir, 'index.html'), indexHtml, 'utf8');
      await fs.writeFile(path.join(buildDir, 'app.js'), appJs, 'utf8');

      try {
        const manifest = {
          id: buildId,
          entry: 'app.js',
          description: (body.description || '').trim() || '',
          networkPolicy: 'NO_NET',
          networkDomains: [],
        };
        const manifestJson = JSON.stringify(manifest, null, 2);
        await fs.writeFile(path.join(buildDir, 'manifest_v1.json'), manifestJson, 'utf8');
        await writeArtifact(buildId, 'build/manifest_v1.json', manifestJson);
      } catch (err) {
        req.log?.warn?.({ err, buildId }, 'publish:manifest_write_failed');
      }
    } catch (err) {
      req.log.error({ err }, 'publish:build_failed');
      try {
        const message = err instanceof Error ? err.message : 'build_failed';
        await prisma.build.update({
          where: { id: buildId },
          data: { status: 'failed', error: message, reason: message },
        });
      } catch (dbErr) {
        req.log.error({ err: dbErr, buildId }, 'publish:build_failed_status_update_error');
      }
      return reply.code(400).send({ ok: false, error: 'build_failed' });
    }

    try {
      // Ovo je ključan korak: osiguravamo da su sve ovisnosti instalirane PRIJE
      // nego što se build posao (job) stavi u red čekanja.
      await ensureDependencies(buildId, req.log);
    } catch (err) {
      req.log.error({ err, buildId }, 'publish:ensure_dependencies_failed');
      // U slučaju greške ovdje, možemo odlučiti prekinuti ili nastaviti.
      // Za sada nastavljamo, ali logiramo grešku.
    }
    try {
      await createJob(buildId, req.log);
    } catch (err) {
      req.log.error({ err }, 'publish:create_job_failed');
      return reply
        .code(503)
        .send({ ok: false, error: 'build_queue_unavailable', message: 'Build queue unavailable' });
    }

    const existingSlug = existing?.slug;
    const baseSlug = slugify(body.title || '') || `app-${listingId}`;
    let slug = existingSlug || baseSlug;
    if (!existingSlug) {
      let cnt = 1;
      while (apps.some((a) => a.slug === slug)) {
        slug = `${baseSlug}-${cnt++}`;
      }
    }

    const { version, archivedVersions } = computeNextVersion(existing, now);
    const sanitizeTranslations = (
      input?: Record<string, { title?: string; description?: string }>,
    ) => {
      const out: Record<string, { title?: string; description?: string }> = {};
      for (const [loc, obj] of Object.entries(input || {})) {
        const l = String(loc).toLowerCase().slice(0, 2);
        if (!['en', 'hr', 'de'].includes(l)) continue;
        const title = (obj?.title ?? '').toString().trim();
        const description = (obj?.description ?? '').toString().trim();
        if (!title && !description) continue;
        out[l] = {};
        if (title) out[l].title = title;
        if (description) out[l].description = description;
      }
      return out;
    };

    try {
  let payloadPreviewUrl: string | undefined = existing?.previewUrl ?? undefined;
      try {
        const parsedPreview = parseDataUrl(body.preview?.dataUrl);
        if (parsedPreview) {
          payloadPreviewUrl = await saveListingPreviewFile({
            listingId: String(listingId),
            slug,
            buffer: parsedPreview.buffer,
            mimeType: parsedPreview.mimeType,
            previousUrl: existing?.previewUrl,
          });
        }
      } catch (err) {
        req.log.warn({ err, slug }, 'publish_preview_store_failed');
      }

      if (existing) {
        const base: AppRecord = {
          ...existing,
          slug,
          title: body.title || existing.title || '',
          description: body.description || existing.description || '',
          tags: existing.tags ?? [],
          visibility: (body.visibility as any) || existing.visibility,
          accessMode: existing.accessMode,
          author: body.author,
          capabilities: body.capabilities as any,
          updatedAt: now,
          status: existing.status,
          state: existing.state ?? 'draft',
          playUrl: existing.playUrl,
          likesCount: existing.likesCount,
          playsCount: existing.playsCount,
          reports: existing.reports,
          domainsSeen: existing.domainsSeen,
          archivedVersions: existing.archivedVersions,
          pendingBuildId: buildId,
          pendingVersion: version,
          previewUrl: payloadPreviewUrl ?? existing.previewUrl,
        };
        const provided = sanitizeTranslations(body.translations);
        if (Object.keys(provided).length) {
          const current = (existing as any).translations || {};
          (base as any).translations = { ...current } as any;
          for (const [k, v] of Object.entries(provided || {}) as [string, { description?: string }][]) {
            (base as any).translations[k] = {
              ...((base as any).translations[k] || {}),
              ...v,
            };
          }
        }
        const { next } = ensureListingPreview(base);
        apps[idx] = next;
      } else {
        const base: AppRecord = {
          id: String(listingId),
          slug,
          pendingBuildId: buildId,
          title: body.title || '',
          description: body.description || '',
          tags: [],
          visibility: (body.visibility as any) || 'public',
          accessMode: 'public',
          author: body.author,
          capabilities: body.capabilities as any,
          createdAt: now,
          updatedAt: now,
          status: 'pending-review',
          state: 'draft',
          playUrl: `/play/${listingId}/`,
          likesCount: 0,
          playsCount: 0,
          reports: [],
          domainsSeen: [],
          version,
          archivedVersions,
          previewUrl: payloadPreviewUrl,
        };
        const provided = sanitizeTranslations(body.translations);
        if (Object.keys(provided).length) {
          (base as any).translations = provided as any;
        }
        const { next } = ensureListingPreview(base);
        apps.push(next);
      }

      await writeApps(apps);
      req.log.info({ buildId, listingId, slug }, 'publish:created');

      try {
        const cfg = getConfig();
        const title = (body.title || '').trim() || `App ${listingId}`;
        const authorUid = body.author?.uid || uid;
        const authorHandle = (body.author as any)?.handle || undefined;
        const claims: any = (req as any).authUser?.claims || {};
        const displayName = claims.name || claims.displayName || undefined;
        const email = claims.email || undefined;
        const prettyAuthor = [displayName, authorHandle].filter(Boolean).join(' · ');
        const subject = `Novo slanje: ${title}${prettyAuthor ? ` — ${prettyAuthor}` : ''}`;
        const lines: string[] = [];
        lines.push(`Naslov: ${title}`);
        lines.push(`ID: ${listingId}`);
        lines.push(`Slug: ${slug}`);
        lines.push(`Build ID: ${buildId}`);
        lines.push(`Autor UID: ${authorUid}`);
        if (displayName) lines.push(`Autor: ${displayName}`);
        if (authorHandle) lines.push(`Korisničko ime: @${authorHandle}`);
        if (email) lines.push(`E-mail: ${email}`);
        const desc = String(body.description || '').trim();
        if (desc) {
          const short = desc.length > 300 ? `${desc.slice(0, 300)}…` : desc;
          lines.push('');
          lines.push('Opis:');
          lines.push(short);
        }
        lines.push('');
        const cfgWebBase = cfg.WEB_BASE || 'http://localhost:3000';
        const cfgApiBase = cfg.PUBLIC_BASE || `http://127.0.0.1:${cfg.PORT}`;
        const webBase = cfgWebBase.replace(/\/$/, '');
        const apiBase = cfgApiBase.replace(/\/$/, '');
        lines.push('Linkovi:');
        lines.push(`• Admin pregled: ${webBase}/admin/`);
        lines.push(`• Status builda: ${apiBase}/build/${buildId}/status`);
        lines.push(`• Događaji builda (SSE): ${apiBase}/build/${buildId}/events`);
        await notifyAdmins(subject, lines.join('\n'));
      } catch (err) {
        req.log?.warn?.({ err }, 'publish:notify_admins_failed');
      }

      try {
        const greetingName = displayName || authorHandle || undefined;
        const pendingSubject = `Vaša aplikacija "${title}" čeka odobrenje`;
        const messageLines = [
          greetingName ? `Bok ${greetingName},` : 'Bok,',
          '',
          `zaprimili smo vaš zahtjev za objavu aplikacije "${title}".`,
          'Naš tim će pregledati sadržaj u najkraćem mogućem roku.',
          'Obavijestit ćemo vas čim donesemo odluku o objavi.',
          '',
          'Hvala na strpljenju,',
          'THESARA tim',
        ];
        await notifyUserModeration(authorUid, pendingSubject, messageLines.join('\n'), {
          email,
          context: 'publish:pending_notification',
        });
      } catch (err) {
        req.log?.warn?.({ err, listingId, buildId }, 'publish:notify_user_pending_failed');
      }

      try {        
        const created = apps.find((a) => a.id === String(listingId));
        if (created) {
          void ensureListingTranslations(created as any, ['en', 'hr', 'de']);
        }
      } catch (err) {
        req.log?.warn?.({ err }, 'publish:translations_enqueue_failed');
      }

      const responsePayload = { ok: true as const, buildId, listingId, slug };
      return reply.code(202).send(responsePayload);
    } catch (err) {
      req.log.error({ err }, 'publish:listing_write_failed');
      return reply.code(500).send({ ok: false, error: 'listing_write_failed' });
    }
  };
  const apiRoutes = ['/api/publish', '/api/publish/', '/api/createx/publish', '/api/createx/publish/'];
  for (const route of apiRoutes) {
    app.post(route, handler);
  }

  const gone =
    (target: '/api/publish' | '/api/createx/publish') =>
    async (_req: FastifyRequest, reply: FastifyReply) =>
      reply.code(410).send({ ok: false, error: 'gone', use: target });

  app.post('/publish', gone('/api/publish'));
  app.post('/publish/', gone('/api/publish'));
  app.post('/createx/publish', gone('/api/createx/publish'));
  app.post('/createx/publish/', gone('/api/createx/publish'));
}
