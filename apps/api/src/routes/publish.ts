import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as esbuild from 'esbuild';
import { enqueueCreatexBuild } from '../workers/createxBuildWorker.js';
import { notifyAdmins } from '../notifier.js';
import { getBuildDir } from '../paths.js';
import { readApps, writeApps, type AppRecord, listEntitlements } from '../db.js';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { computeNextVersion } from '../lib/versioning.js';
import { ensureListingPreview, saveListingPreviewFile } from '../lib/preview.js';
import { writeArtifact } from '../utils/artifacts.js';
import { Prisma } from '@prisma/client';
import { sseEmitter } from '../sse.js';
import { ensureDependencies } from '../lib/dependencies.js';
import { ensureListingTranslations } from '../lib/translate.js';
import { initBuild } from '../models/Build.js';

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

      // Initialize filesystem build record so Admin panel can list it
      try {
        await initBuild(buildId);
      } catch (e) {
        req.log?.warn?.({ e, buildId }, 'publish:init_fs_build_failed');
      }

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
  <!-- Tailwind CSS v3 via CDN (supports slate palette, indigo-950, etc.) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    // Optional: ensure Tailwind runs with modern fonts and no dark mode surprises
    window.tailwind = window.tailwind || {};
    tailwind.config = {
      theme: { extend: {} },
      corePlugins: { preflight: true },
    };
  </script>
  <style>
    html,body{margin:0;padding:0}
    body{overflow-x:hidden}
    #root{min-height:100vh}
  </style>
  <!-- Thesara Storage namespace for standalone mode -->
  <script>window.__THESARA_APP_NS = ${JSON.stringify('app:' + String(listingId))};</script>
  <!-- Thesara Storage bridge: replaces localStorage in iframe and batches changes to parent;
       in standalone mode it syncs directly to server using __THESARA_APP_NS and optional ?token= -->
  <script src="/shims/localstorage.js"></script>
  <script>
    // crypto.randomUUID polyfill for non-secure contexts (plain JS, no TS syntax)
    (function() {
      try {
        if (!('crypto' in window)) {
          Object.defineProperty(window, 'crypto', { value: {}, configurable: true });
        }
        var c = window.crypto;
        if (!c.randomUUID) {
          var rng = function() { return (Math.random() * 16) | 0; };
          var uuidv4 = function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(ch) {
              var r = rng();
              var v = ch === 'x' ? r : ((r & 0x3) | 0x8);
              return v.toString(16);
            });
          };
          Object.defineProperty(c, 'randomUUID', { value: uuidv4, configurable: false });
        }
      } catch (e) {
        // ignore
      }
    })();
  </script>
  <script>
    // Minimal error/debug overlay to surface runtime issues inside the sandbox
    (function(){
      function show(msg){
        try{
          if (!document.body) {
            // If body doesn't exist yet, queue and try again when DOM is ready
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', function() { show(msg); });
            }
            return;
          }
          var id='__mini_error_overlay__';
          var el=document.getElementById(id);
          if(!el){
            el=document.createElement('div');
            el.id=id;
            el.style.cssText='position:fixed;left:8px;bottom:8px;max-width:92vw;z-index:99999;background:rgba(220,38,38,.95);color:white;padding:10px 12px;border-radius:10px;font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;white-space:pre-wrap;box-shadow:0 8px 24px rgba(0,0,0,.25)';
            document.body.appendChild(el);
          }
          el.textContent=String(msg);
        }catch(e){console.error(e)}
      }
      window.__dbg = show;
      window.addEventListener('error', function(e){ show(e.message || 'Error'); });
      window.addEventListener('unhandledrejection', function(e){ var m=(e && (e.reason && (e.reason.message||e.reason)) )|| 'Unhandled rejection'; show(m); });
      // Emit initial diagnostics and attach listeners once DOM is ready
      function init() {
        try{ show('crypto.randomUUID: '+(window.crypto && typeof window.crypto.randomUUID)); }catch{}
        // Globally prevent form submissions inside sandboxed iframe
        // This keeps UX working (React handlers still run) without requiring allow-forms
        document.addEventListener('submit', function(e){
          try{
            e.preventDefault();
            e.stopPropagation();
            show('prevented form submit from '+(e.target && (e.target.tagName||'form')));
          }catch{}
        }, true);
        // Best-effort: mark existing forms as novalidate to avoid native navigation/validation UI
        try {
          var applyNoValidate = function(root){
            var forms = (root || document).getElementsByTagName('form');
            for (var i=0;i<forms.length;i++){ forms[i].setAttribute('novalidate',''); }
          };
          if (document.readyState !== 'loading') applyNoValidate(document);
          // Observe future forms created by React after hydration
          var mo = new MutationObserver(function(muts){
            for (var j=0;j<muts.length;j++){
              var m = muts[j];
              for (var k=0;k<m.addedNodes.length;k++){
                var n = m.addedNodes[k];
                if (n && n.nodeType === 1 /* ELEMENT_NODE */){ applyNoValidate(n); }
              }
            }
          });
          mo.observe(document.documentElement, { childList: true, subtree: true });
        } catch {}
        document.addEventListener('click', function(e){ try{
          var t=e.target; var text='';
          if(t && t.innerText) text=t.innerText.toString().slice(0,64);
          if(text.toLowerCase().indexOf('dodaj')>=0){ show('click Dodaj'); }
        }catch{} }, true);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  </script>
</head>
<body>
  <div id="root"></div>
  <script defer src="./app.js"></script>
  <!-- app.js is IIFE bundle with ALL dependencies (React, ReactDOM, Recharts, etc.) -->
  <!-- Mount code is embedded in the bundle itself, no manual initialization needed -->
</body>
</html>`;
      let appJs = '';

      if (isHtml) {
        // Inject storage shim and namespace even when full HTML is provided
        const ns = `app:${listingId}`;
        const inject = `\n  <!-- Thesara Storage namespace for standalone mode -->\n  <script>window.__THESARA_APP_NS = ${JSON.stringify('app:' + String(listingId))};<\/script>\n  <!-- Thesara Storage bridge: replaces localStorage in iframe and batches changes to parent; in standalone mode it syncs directly to server using __THESARA_APP_NS and optional ?token= -->\n  <script src=\"/shims/localstorage.js\"><\/script>\n`;
        let html = String(body.inlineCode || '');
        if (/<\/head>/i.test(html)) {
          html = html.replace(/<\/head>/i, inject + "\n</head>");
        } else if (/<\/body>/i.test(html)) {
          html = html.replace(/<\/body>/i, inject + "\n</body>");
        } else {
          html += inject;
        }
        indexHtml = html;
        appJs = '';
      } else {
        // esbuild worker now bundles ALL dependencies (React, ReactDOM, etc.) into IIFE
        // Replace shadcn components with simple React element wrappers
        const code = body.inlineCode;
        
        // Remove shadcn imports
        const importRe = /import\s*\{([^}]+)\}\s*from\s*["']@\/components\/ui\/(card|button|input|slider|label)["'];?\r?\n?/g;
        let cleanedCode = code.replace(importRe, '');

        // Conditionally inject lightweight stubs only if identifiers are not already declared by user code
        const declared = (name: string) => new RegExp(`\\b(const|let|var|function|class)\\s+${name}\\b`).test(cleanedCode);
        const need = {
          Card: !declared('Card'),
          CardHeader: !declared('CardHeader'),
          CardTitle: !declared('CardTitle'),
          CardContent: !declared('CardContent'),
          Button: !declared('Button'),
          Input: !declared('Input'),
          Label: !declared('Label'),
          Slider: !declared('Slider'),
        };
        const stubLines: string[] = ["import React from 'react';", '', '// Shadcn/ui stubs (only added when missing)'];
        if (need.Card) stubLines.push(
          "const Card = ({children, className = '', ...props}) => React.createElement('div', {className: className + ' card', ...props}, children);"
        );
        if (need.CardHeader) stubLines.push(
          "const CardHeader = ({children, className = '', ...props}) => React.createElement('div', {className: className + ' card-header', ...props}, children);"
        );
        if (need.CardTitle) stubLines.push(
          "const CardTitle = ({children, className = '', ...props}) => React.createElement('h3', {className: className + ' card-title', ...props}, children);"
        );
        if (need.CardContent) stubLines.push(
          "const CardContent = ({children, className = '', ...props}) => React.createElement('div', {className: className + ' card-content', ...props}, children);"
        );
        if (need.Button) stubLines.push(
          "const Button = ({children, className = '', variant, ...props}) => React.createElement('button', { type: props.type || 'button', className: className + ' button', ...props}, children);"
        );
        if (need.Input) stubLines.push(
          "const Input = ({className = '', type = 'text', ...props}) => React.createElement('input', {type, className: className + ' input', ...props});"
        );
        if (need.Label) stubLines.push(
          "const Label = ({children, className = '', htmlFor, ...props}) => React.createElement('label', {htmlFor, className: className + ' label', ...props}, children);"
        );
        if (need.Slider) stubLines.push(
          "const Slider = ({value = [0], min = 0, max = 100, step = 1, onValueChange, className = '', ...props}) => React.createElement('input', { type: 'range', min, max, step, value: value[0], onChange: (e) => onValueChange?.([Number(e.target.value)]), className: className + ' slider', ...props });"
        );
        if (stubLines.length > 3) {
          cleanedCode = stubLines.join('\n') + '\n' + cleanedCode;
        }
        
          // Fix ResponsiveContainer issues in sandboxed iframe
          // ResponsiveContainer doesn't work well in sandboxed iframes, replace with fixed dimensions
          cleanedCode = cleanedCode.replace(
            /<ResponsiveContainer\s+width="100%"\s+height="100%"\s*>/g,
            '<div style={{width: "100%", height: "100%"}}>'
          );
          cleanedCode = cleanedCode.replace(
            /<\/ResponsiveContainer>/g,
            '</div>'
          );
          // Also remove ResponsiveContainer from imports if present
          cleanedCode = cleanedCode.replace(
            /ResponsiveContainer,?\s*/g,
            ''
          );
          // Fix PieChart to use fixed dimensions instead of percentage
          cleanedCode = cleanedCode.replace(
            /<PieChart>/g,
            '<PieChart width={600} height={420}>'
          );
        
        // Check if user code exports a default component
        const hasDefaultExport = /export\s+default\s+/.test(cleanedCode);
        
        // Extract the component name from "export default function ComponentName()"
        const defaultFnMatch = cleanedCode.match(/export\s+default\s+function\s+(\w+)/);
        const componentName = defaultFnMatch ? defaultFnMatch[1] : 'App';
        
        if (!hasDefaultExport) {
          // If no default export, user code might be incomplete - wrap it
          cleanedCode = `import React from 'react';\n\n${cleanedCode}\n\nfunction App() { return null; }\nexport default App;\n`;
        }
        
        // Add mount code at the end using the actual exported component
        // IMPORTANT: Reference the component by name, not via import
        cleanedCode += `

// Auto-generated mount code - bootstraps React app
import React from 'react';
import ReactDOM from 'react-dom/client';

// Ensure DOM is ready before mounting
function mountApp() {
  if (typeof window === 'undefined') return;
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    console.error('[Thesara] root element not found');
    return;
  }
  const root = ReactDOM.createRoot(rootEl);
  root.render(React.createElement(${componentName}));
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp);
  } else {
    mountApp();
  }
}
`;
        
        const entryPath = path.join(buildDir, '_app_entry.tsx');
        await fs.writeFile(entryPath, cleanedCode, 'utf8');

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
      await enqueueCreatexBuild(buildId);
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
      const out: Record<string, { description?: string }> = {};
      for (const [loc, obj] of Object.entries(input || {})) {
        const l = String(loc).toLowerCase().slice(0, 2);
        if (!['en', 'hr', 'de'].includes(l)) continue;
        const description = (obj?.description ?? '').toString().trim();
        if (!description) continue;
        out[l] = { description };
      }
      return out as any;
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
