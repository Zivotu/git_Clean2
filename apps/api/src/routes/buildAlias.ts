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

export default async function buildAlias(app: FastifyInstance): Promise<void> {
  if ((app as any).__thesara_buildAlias_registered) return;
  (app as any).__thesara_buildAlias_registered = true;

  app.get<{ Params: BuildAliasParams }>('/:listingId/build/*', async (req, reply) => {
    const { listingId } = req.params;
    const tailSegments = sanitizeTail(req.params['*']);

    const apps = await readApps(['buildId', 'pendingBuildId', 'slug']);
    const target = resolveTargetListing(apps, listingId);
    const buildId = target?.buildId || target?.pendingBuildId;

    if (!target || !buildId) {
      return reply.code(404).send({ error: 'Not found' });
    }

    const encodedId = encodeURIComponent(buildId);
    const encodedTail = tailSegments.map((segment) => encodeURIComponent(segment)).join('/');
    const location = encodedTail
      ? `/builds/${encodedId}/build/${encodedTail}`
      : `/builds/${encodedId}/build/`;

    return reply.redirect(307, location);
  });
}
