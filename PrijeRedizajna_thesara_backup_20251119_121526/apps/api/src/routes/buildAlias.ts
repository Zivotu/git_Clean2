import type { FastifyInstance, FastifyLoggerInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readApps, type AppRecord } from '../db.js';
import { getBuildDir } from '../paths.js';
import { getBucket } from '../storage.js';
import { getConfig } from '../config.js';
import { buildCsp } from '../lib/cspBuilder.js';
import fsSync from 'node:fs';
import { setCors } from './storage.js';

type BuildAliasParams = {
  listingId: string;
  '*': string;
};

function sanitizeTail(value: string): string[] {
  const trimmed = String(value || '').replace(/^\/+/, '');
  if (!trimmed) return [];
  return trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        segment.length > 0 && segment !== '.' && segment !== '..',
    );
}

function resolveTargetListing(
  apps: AppRecord[],
  listingId: string,
): AppRecord | undefined {
  const key = String(listingId);
  return apps.find(
    (app) =>
      String(app.id) === key ||
      (typeof app.slug === 'string' && app.slug === key),
  );
}

const SHIM_SCRIPTS = '<script type="module" src="/shims/rooms.js"></script><script type="module" src="/shims/storage.js"></script>';

/**
 * Extracts bare module specifiers from JS code (simple regex-based approach).
 * Returns unique set of package names (excluding relative/absolute paths).
 */
function extractBareImports(jsCode: string): Set<string> {
  const bareImports = new Set<string>();
  // Match: import ... from "package" or import("package")
  const importRegex = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match;
  while ((match = importRegex.exec(jsCode)) !== null) {
    const spec = match[1] || match[2];
    if (!spec) continue;
    // Skip relative/absolute paths
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('http')) continue;
    // Extract package name (handle scoped packages like @org/pkg)
    const pkgName = spec.startsWith('@') 
      ? spec.split('/').slice(0, 2).join('/') 
      : spec.split('/')[0];
    bareImports.add(pkgName);
  }
  return bareImports;
}

/**
 * Injects import map + shim script into HTML.
 * Reads app.js to auto-detect dependencies and generate import map.
 */
async function injectShim(html: string, buildId: string): Promise<string> {
  // If shim is already present, don't duplicate
  if (html.includes('/shims/rooms.js')) {
    return html;
  }

  // Read app.js to detect dependencies
  let detectedDeps: Set<string> = new Set();
  try {
    const buildDir = getBuildDir(buildId);
    const appJsPath = path.join(buildDir, 'build', 'app.js');
    const appJs = await fs.readFile(appJsPath, 'utf8');
    detectedDeps = extractBareImports(appJs);
  } catch {
    // If app.js not found, continue with defaults
  }

  // Minimal import map for React if none exists
  let importMap = '';
  const hasImportMap = /<script\s+type=["']importmap["'][^>]*>/i.test(html);
  if (!hasImportMap) {
    let reactVersion = '18.2.0';
    try {
      const { getConfig } = require('../config.js');
      const cfg = getConfig();
      if (cfg?.REACT_VERSION) reactVersion = String(cfg.REACT_VERSION);
    } catch {}

    // Build imports object with React + detected deps
    const imports: Record<string, string> = {
      react: `https://esm.sh/react@${reactVersion}`,
      'react-dom': `https://esm.sh/react-dom@${reactVersion}`,
      'react/jsx-runtime': `https://esm.sh/react@${reactVersion}/jsx-runtime`,
      'react/jsx-dev-runtime': `https://esm.sh/react@${reactVersion}/jsx-dev-runtime`,
    };

    // Add detected dependencies (use latest or default versions)
    const defaultVersions: Record<string, string> = {
      'framer-motion': '11.11.17',
      'lucide-react': '0.460.0',
      'recharts': '2.15.0',
      'date-fns': '4.1.0',
      'clsx': '2.1.1',
      'tailwind-merge': '2.7.0',
      'react-router-dom': '6.28.0',
      'zustand': '5.0.2',
      '@radix-ui/react-dialog': '1.1.4',
      '@radix-ui/react-dropdown-menu': '2.1.4',
    };

    // Always include detected deps + common ones to avoid missing imports
    const commonDeps = ['recharts', 'lucide-react', 'framer-motion'];
    for (const dep of [...detectedDeps, ...commonDeps]) {
      if (!imports[dep] && dep !== 'react' && dep !== 'react-dom') {
        const version = defaultVersions[dep] || 'latest';
        imports[dep] = `https://esm.sh/${dep}@${version}`;
      }
    }

    const map = { imports };
    importMap = `<script type="importmap">${JSON.stringify(map)}</script>`;
  }

  const inject = importMap + SHIM_SCRIPTS;

  // Ensure importmap is parsed BEFORE any module scripts.
  // Best-effort strategy:
  // 1) If <head> exists, inject right AFTER <head> opening tag (top of head)
  // 2) Else, if there's a <script type="module">, inject right BEFORE the first one
  // 3) Else, inject at start of document
  const headOpenRx = /<head[^>]*>/i;
  const mHead = html.match(headOpenRx);
  if (mHead && mHead.index != null) {
    const insertAt = mHead.index + mHead[0].length;
    return html.slice(0, insertAt) + inject + html.slice(insertAt);
  }
  const firstModuleScript = html.search(/<script[^>]*type=["']module["'][^>]*>/i);
  if (firstModuleScript >= 0) {
    return html.slice(0, firstModuleScript) + inject + html.slice(firstModuleScript);
  }
  // Fallback to before </body> or append
  // Fallback to before </body>
  const bodyEndTag = html.lastIndexOf('</body>');
  if (bodyEndTag !== -1) {
    return html.slice(0, bodyEndTag) + inject + html.slice(bodyEndTag);
  }
  return html + inject;
}

/**
 * Reads the index.html for a given buildId, trying GCS then local FS.
 */
async function readIndexHtml(
  buildId: string,
  log: FastifyLoggerInstance,
): Promise<string | null> {
  // 1. Try GCS
  try {
    const bucket = getBucket();
    const gcsPaths = [
      `builds/${buildId}/build/index.html`,
      `builds/${buildId}/index.html`,
      `builds/${buildId}/bundle/index.html`,
    ];
    for (const gcsPath of gcsPaths) {
      const file = bucket.file(gcsPath);
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        return buffer.toString('utf8');
      }
    }
  } catch (error) {
    // GCS might not be configured or fail, log and proceed to local FS
    log.warn({ error, buildId }, 'GCS read failed for index.html');
  }

  // 2. Try Local FS
  try {
    const buildDir = getBuildDir(buildId);
    const localPaths = [
      path.join(buildDir, 'build', 'index.html'),
      path.join(buildDir, 'index.html'),
      path.join(buildDir, 'bundle', 'index.html'),
    ];
    for (const localPath of localPaths) {
      try {
        return await fs.readFile(localPath, 'utf8');
      } catch {
        // Try next path
      }
    }
  } catch (error) {
    log.warn({ error, buildId }, 'Local FS read failed for index.html');
  }

  return null;
}

export default async function buildAlias(app: FastifyInstance): Promise<void> {
  if ((app as any).__thesara_buildAlias_registered) return;
  (app as any).__thesara_buildAlias_registered = true;

  app.route<{ Params: BuildAliasParams }>({
    method: ['GET', 'HEAD', 'OPTIONS'],
    url: '/:listingId/build/*',
    handler: async (req, reply) => {
      // Guard: If the tail ends with /events, this is an SSE endpoint, not a build asset
      // Let it 404 here so it doesn't interfere with the dedicated /build/:buildId/events route
      const tail = (req.params as BuildAliasParams)['*'];
      if (tail && tail.endsWith('/events')) {
        return reply.callNotFound();
      }

      if (req.method === 'OPTIONS') {
        setCors(reply, req.headers.origin);
        return reply.code(204).send();
      }

      const { listingId } = req.params;
      const tailSegments = sanitizeTail(req.params['*']);

      const apps = await readApps(['buildId', 'pendingBuildId', 'slug']);
      const target = resolveTargetListing(apps, listingId);
      const buildId = target?.pendingBuildId || target?.buildId;

      const logProps = {
        listingId,
        buildId,
        tail: req.params['*'],
        method: req.method,
      };

      if (!target || !buildId) {
        req.log.warn(logProps, 'Build alias not found');
        return reply.code(404).send({ error: 'Not found' });
      }

      const isIndexRequest =
        tailSegments.length === 0 ||
        (tailSegments.length === 1 && tailSegments[0] === 'index.html');

      if (req.method === 'GET' && isIndexRequest) {
        const html = await readIndexHtml(buildId, req.log);
        if (html) {
          const injectedHtml = await injectShim(html, buildId);
          const origin = req.headers.origin;
          setCors(reply, origin);
          reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
          reply.header('X-Thesara-Alias', 'buildAlias');
          // Align security headers with the static /builds handler to avoid CSP blocks in iframe
          try {
            const cfg = getConfig();
            const frameAncestors = new Set<string>(["'self'"]);
            try {
              const webBase = cfg.WEB_BASE;
              if (webBase) frameAncestors.add(new URL(webBase).origin);
            } catch {}
            if (process.env.NODE_ENV !== 'production') {
              frameAncestors.add('http://localhost:3000');
              frameAncestors.add('http://127.0.0.1:3000');
            }

            // Read manifest to derive network policy and legacy mode
            let networkPolicy = 'NO_NET';
            let networkDomains: string[] = [];
            let legacyScript = false;
            try {
              const buildDir = getBuildDir(buildId);
              const manifestPath = path.join(buildDir, 'build', 'manifest_v1.json');
              if (fsSync.existsSync(manifestPath)) {
                const raw = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8')) || {};
                const rp = raw.networkPolicy ?? raw.policy;
                networkPolicy = typeof rp === 'string' ? rp : 'NO_NET';
                networkDomains = Array.isArray(raw.networkDomains)
                  ? raw.networkDomains.filter((d: any) => typeof d === 'string')
                  : [];
                const entry = String(raw.entry ?? '').trim();
                legacyScript = !entry || /app\.js$/i.test(entry);
              } else {
                // Best-effort legacy detection
                legacyScript = !fsSync.existsSync(path.join(buildDir, 'build', 'app.bundle.js'));
              }
            } catch {}

            const csp = buildCsp({
              policy: networkPolicy,
              networkDomains,
              frameAncestors: Array.from(frameAncestors),
              allowCdn: Boolean(cfg.EXTERNAL_HTTP_ESM),
              legacyScript,
            });
            reply.header('Content-Security-Policy', csp);
            reply.header('Referrer-Policy', 'no-referrer');
            // Ensure shims and app.js are served with correct CORS for iframe same-origin access
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Access-Control-Allow-Credentials', 'false');
          } catch {}

          reply.type('text/html').header('Cache-Control', 'no-store');
          return reply.send(injectedHtml);
        }
      }

      const encodedId = encodeURIComponent(buildId);
      const encodedTail = tailSegments
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      // Choose redirect base depending on storage driver:
      // - local: serve from static '/builds' prefix
      // - cloud (firebase/R2): serve from '/public/builds' proxy
      const { STORAGE_DRIVER } = getConfig();
      const basePrefix = STORAGE_DRIVER === 'local' ? '/builds' : '/public/builds';
      const location = encodedTail
        ? `${basePrefix}/${encodedId}/build/${encodedTail}`
        : `${basePrefix}/${encodedId}/build/`;

      req.log.info({ ...logProps, location }, 'Redirecting build alias');

      // Postavi CORS i CORP headere prije redirecta za ispravno učitavanje u iframeu
      const origin = req.headers.origin;
      setCors(reply, origin);
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');

      if (req.method === 'HEAD') {
        reply.header('Location', location);
        return reply.code(307).send();
      }

      reply.header('Location', location);
      return reply.code(307).send();
    },
  });
}
