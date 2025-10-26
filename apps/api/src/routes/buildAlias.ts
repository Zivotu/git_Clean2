import type { FastifyInstance } from 'fastify';
import { readApps, type AppRecord } from '../db.js';

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

function resolveTargetListing(apps: AppRecord[], listingId: string): AppRecord | undefined {
  const key = String(listingId);
  return apps.find(
    (app) =>
      String(app.id) === key ||
      (typeof app.slug === 'string' && app.slug === key),
  );
}

import { setCors } from './storage.js';

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
      const buildId = target?.buildId || target?.pendingBuildId;

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

      const encodedId = encodeURIComponent(buildId);
      const encodedTail = tailSegments.map((segment) => encodeURIComponent(segment)).join('/');
      const location = encodedTail
        ? `/builds/${encodedId}/build/${encodedTail}`
        : `/builds/${encodedId}/build/`;

      req.log.info({ ...logProps, location }, 'Redirecting build alias');

      if (req.method === 'HEAD') {
        return reply.code(307).header('Location', location).send();
      } else {
        return reply.redirect(307, location);
      }
    },
  });
}
