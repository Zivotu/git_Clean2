import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as esbuild from 'esbuild';
import { enqueueCreatexBuild } from '../workers/createxBuildWorker.js';
import { notifyAdmins, sendTemplateToUser } from '../notifier.js';
import { getBuildDir } from '../paths.js';
import { readApps, writeApps, updateApp, type AppRecord, listEntitlements } from '../db.js';
import { getConfig } from '../config.js';
import { computeNextVersion } from '../lib/versioning.js';
import { ensureListingPreview, saveListingPreviewFile, pickRandomPreviewPreset } from '../lib/preview.js';
import { writeArtifact } from '../utils/artifacts.js';
import { sseEmitter } from '../sse.js';
import { ensureDependencies } from '../lib/dependencies.js';
import { ensureListingTranslations } from '../lib/translate.js';
import { initBuild, updateBuild, writeBuildInfo } from '../models/Build.js';
import { getStorageBackend, StorageError } from '../storageV2.js';
import type { RoomsMode } from '../types.js';
import { ensureTermsAccepted, TermsNotAcceptedError } from '../lib/terms.js';
import { detectPreferredLocale } from '../lib/locale.js';
import { detectStorageUsageInCode } from '../lib/storageUsage.js';
import { getStorageWarning } from '../lib/messages.js';
import { normalizeRoomsMode } from '../lib/rooms.js';

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
  tags?: string[];
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
      roomsMode?: RoomsMode;
    };
    features?: string[];
  };
  inlineCode: string;
  skipStorageWarning?: boolean;
  visibility?: string;
  preview?: {
    dataUrl?: string;
  };
}

function normalizeCapabilities(raw?: PublishPayload['capabilities']): PublishPayload['capabilities'] {
  const permissions = raw?.permissions ? { ...raw.permissions } : undefined;
  const network = raw?.network ? { ...raw.network } : undefined;
  const features = raw?.features ? [...raw.features] : undefined;
  const storage = {
    ...(raw?.storage ?? {}),
    roomsMode: normalizeRoomsMode(raw?.storage?.roomsMode),
  };
  return {
    ...(permissions ? { permissions } : {}),
    ...(network ? { network } : {}),
    ...(features ? { features } : {}),
    storage,
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
  // This ensures that KV storage and Firestore stay synchronized
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
    // Don't throw - KV write succeeded, Firestore sync is best-effort
  }
}

export default async function publishRoutes(app: FastifyInstance) {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    req.log.info('publish:received');
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
    const cfg = getConfig();
    const publicBase = (cfg.PUBLIC_BASE || '').replace(/\/$/, '');
    const webBase = (cfg.WEB_BASE || '').replace(/\/$/, '');
    const apiBaseHint = publicBase ? `${publicBase}/api` : '/api';
    const buildPlayUrl = (id: string | number) => (webBase ? `${webBase}/play/${id}/?run=1` : '');
    const normalizedCapabilities = normalizeCapabilities(body.capabilities);
    const claims: any = (req as any).authUser?.claims || {};
    const creatorLocale = detectPreferredLocale(req.headers['accept-language']);

    if (!existingOwned && !isAdmin) {
      const ents = await listEntitlements(uid);
      const gold = ents.some((e) => e.feature === 'isGold' && e.active !== false);
      const limit = gold ? cfg.GOLD_MAX_APPS_PER_USER : cfg.MAX_APPS_PER_USER;
      // Filter out deleted apps before counting - only count active apps
      const activeOwned = owned.filter((a) => !a.deletedAt && !a.adminDeleteSnapshot);
      if (activeOwned.length >= limit) {
        return reply
          .code(403)
          .send({
            ok: false,
            error: 'max_apps',
            code: 'max_apps',
            message: `Dosegli ste maksimalan broj aplikacija (${limit}). Obrišite postojeću ili nadogradite na Gold.`,
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

    const skipStorageWarning = Boolean(body.skipStorageWarning);
    const storageUsed = detectStorageUsageInCode(code);
    if (!storageUsed && !skipStorageWarning) {
      const storageWarning = getStorageWarning(creatorLocale);
      return reply.code(409).send({
        ok: false,
        error: 'storage_usage_missing',
        code: 'storage_usage_missing',
        message: storageWarning.message,
        docsUrl: storageWarning.docsUrl,
        canOverride: true,
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

    // 1) ensure listing metadata in KV
    await ensureListingRecord({
      listingId,
      title: (body as any)?.title,
      author: body.author,
      buildId,
    });
    const authorUid = body.author?.uid || uid;

    // 2) Initialize filesystem build record so Admin panel can list it
    try {
      await initBuild(buildId);
    } catch (e) {
      req.log?.warn?.({ e, buildId }, 'publish:init_fs_build_failed');
    }
    try {
      await updateBuild(buildId, { creatorLanguage: creatorLocale });
    } catch (err) {
      req.log?.warn?.({ err, buildId }, 'publish:set_creator_language_failed');
    }
    try {
      await writeBuildInfo(buildId, {
        listingId: String(listingId),
        creatorLanguage: creatorLocale,
        authorUid,
        authorName: (body.author as any)?.name || claims.name || claims.displayName,
        authorHandle: body.author?.handle,
        authorEmail: claims.email,
        submitterUid: uid,
        submitterEmail: claims.email,
        submittedAt: Date.now(),
        appTitle: (body as any)?.title || existing?.title,
      });
    } catch (err) {
      req.log?.warn?.({ err, buildId }, 'publish:build_info_write_failed');
    }

    sseEmitter.emit(buildId, 'status', { status: 'queued' });

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
  <!-- Thesara namespace + shims -->
  <script>
    window.__THESARA_APP_NS = ${JSON.stringify('app:' + String(listingId))};
    window.__THESARA_APP_ID__ = ${JSON.stringify(String(listingId))};
    window.__THESARA_API_BASE__ = ${JSON.stringify(apiBaseHint)};
    window.__THESARA_PLAY_URL__ = ${JSON.stringify(buildPlayUrl(listingId))};
    window.thesara = window.thesara || {};
    window.thesara.app = Object.assign({}, window.thesara.app, { id: ${JSON.stringify(String(listingId))} });
  </script>
  <script type="module" src="/shims/rooms.js?v=${buildId}"></script>
  <script type="module" src="/shims/storage.js?v=${buildId}"></script>
  <!-- Thesara Storage bridge: replaces localStorage in iframe and batches changes to parent;
    in standalone mode it syncs directly to server using __THESARA_APP_NS and optional ?token=
    NOTE: use /api/ prefix so that frontend proxy (Next.js) forwards to API in production. -->
  <script src="/shims/localstorage.js?v=${buildId}"></script>
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
            var target = e.target;
            var shouldBlock = !!(target && typeof target.getAttribute === 'function' && target.getAttribute('data-thesara-prevent-submit') === 'true');
            if (shouldBlock) {
              e.preventDefault();
              e.stopPropagation();
              show('prevented form submit from '+(target && (target.tagName||'form')));
            }
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
  <script defer src="./build/app.js"></script>
  <!-- app.js is IIFE bundle with ALL dependencies (React, ReactDOM, Recharts, etc.) -->
  <!-- Mount code is embedded in the bundle itself, no manual initialization needed -->
</body>
</html>`;
      let appJs = '';

      if (isHtml) {
        // Inject storage shim and namespace even when full HTML is provided
        const ns = `app:${listingId}`;
        const playUrl = buildPlayUrl(listingId);
        const inject = `\n  <!-- Thesara namespace + shims -->\n  <script>\n    window.__THESARA_APP_NS = ${JSON.stringify('app:' + String(listingId))};\n    window.__THESARA_APP_ID__ = ${JSON.stringify(String(listingId))};\n    window.__THESARA_API_BASE__ = ${JSON.stringify(apiBaseHint)};\n    window.__THESARA_PLAY_URL__ = ${JSON.stringify(playUrl)};\n    window.thesara = window.thesara || {};\n    window.thesara.app = Object.assign({}, window.thesara.app, { id: ${JSON.stringify(String(listingId))} });\n  <\/script>\n  <script type=\"module\" src=\"/shims/rooms.js\"><\/script>\n  <script type=\"module\" src=\"/shims/storage.js\"><\/script>\n  <!-- Thesara Storage bridge: replaces localStorage in iframe and batches changes to parent; in standalone mode it syncs directly to server using __THESARA_APP_NS and optional ?token= -->\n  <script src=\"/shims/localstorage.js\"><\/script>\n`;
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

      // If no preview provided/uploaded and there's no existing preview, pick a random preset
      if (!payloadPreviewUrl) {
        // Only assign a preset for brand new listings (no existing preview)
        // existing may be undefined for new app; ensure we don't overwrite an explicit preview
        payloadPreviewUrl = pickRandomPreviewPreset();
      }

      if (existing) {
        const base: AppRecord = {
          ...existing,
          slug,
          title: body.title || existing.title || '',
          description: body.description || existing.description || '',
          tags: body.tags || existing.tags || [],
          visibility: (body.visibility as any) || existing.visibility,
          accessMode: existing.accessMode,
          author: body.author,
          capabilities: normalizedCapabilities as any,
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
        // Ensure ownerUid is set for backward compatibility and robust filtering
        if (base.author?.uid) {
          (next as any).ownerUid = base.author.uid;
        }
        apps[idx] = next;
      } else {
        const base: AppRecord = {
          id: String(listingId),
          slug,
          pendingBuildId: buildId,
          title: body.title || '',
          description: body.description || '',
          tags: body.tags || [],
          visibility: (body.visibility as any) || 'public',
          accessMode: 'public',
          author: body.author,
          capabilities: normalizedCapabilities as any,
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
        // Ensure ownerUid is set for backward compatibility and robust filtering
        if (base.author?.uid) {
          (next as any).ownerUid = base.author.uid;
        }
        apps.push(next);
      }

      await writeApps(apps);
      req.log.info({ buildId, listingId, slug }, 'publish:created');

      // Hoist some notification vars so subsequent try blocks can reference them
      let title = (body.title || '').trim() || `App ${listingId}`;
      let authorHandle = (body.author as any)?.handle || undefined;
      let displayName = claims.name || claims.displayName || undefined;
      let email = claims.email || undefined;

      try {
        const cfg = getConfig();
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
        try {
          await sendTemplateToUser('publish:pending_notification', authorUid, {
            displayName: displayName ?? authorHandle,
            appTitle: title,
            appId: String(listingId),
          }, { email });
        } catch (err) {
          req.log?.warn?.({ err }, 'publish:send_pending_template_failed');
        }
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

      try {
        await writeBuildInfo(buildId, {
          listingId: String(listingId),
          slug,
          appTitle: title || existing?.title,
          authorUid,
          authorName: ((body.author as any)?.name || claims.name || claims.displayName),
        });
      } catch (err) {
        req.log?.warn?.({ err, buildId }, 'publish:build_info_update_failed');
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
