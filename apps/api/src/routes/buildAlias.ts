import type { FastifyInstance, FastifyLoggerInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readApps, type AppRecord } from '../db.js';
import { getBuildDir } from '../paths.js';
import { getBucket } from '../storage.js';

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

import { setCors } from './storage.js';

const SHIM_SCRIPT = '<script defer src="/shims/rooms.js"></script>';

/**
 * Injects a script tag into the given HTML string.
 * It tries to inject before </body>, then before </head>, then at the end of the file.
 * If the script is already present, it returns the original HTML.
 */
function injectShim(html: string): string {
  if (html.includes('/shims/rooms.js')) {
    return html;
  }
  const bodyEndTag = html.lastIndexOf('</body>');
  if (bodyEndTag !== -1) {
    return html.slice(0, bodyEndTag) + SHIM_SCRIPT + html.slice(bodyEndTag);
  }
  const headEndTag = html.lastIndexOf('</head>');
  if (headEndTag !== -1) {
    return html.slice(0, headEndTag) + SHIM_SCRIPT + html.slice(headEndTag);
  }
  return html + SHIM_SCRIPT;
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
          const injectedHtml = injectShim(html);
          reply.header('X-Thesara-Alias', 'buildAlias');
          reply.type('text/html').header('Cache-Control', 'no-store');
          return reply.send(injectedHtml);
        }
      }

      const encodedId = encodeURIComponent(buildId);
      const encodedTail = tailSegments
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      const location = encodedTail
        ? `/public/builds/${encodedId}/build/${encodedTail}`
        : `/public/builds/${encodedId}/build/`;

      req.log.info({ ...logProps, location }, 'Redirecting build alias');

      if (req.method === 'HEAD') {
        reply.header('Location', location);
        return reply.code(307).send();
      }

      return reply.redirect(307, location);
    },
  });
}
