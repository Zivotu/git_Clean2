import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { getStorageBackend, StorageError } from '../storageV2.js';
import { getConfig } from '../config.js';

const ALLOWED_ORIGINS = new Set([
  'https://thesara.space',
  'https://apps.thesara.space',
  'http://localhost:3000',
]);

export function setCors(reply: any, origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://thesara.space';
  reply.header('Access-Control-Allow-Origin', allow);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Authorization, If-Match, Content-Type, X-Thesara-App-Id');
  reply.header('Access-Control-Expose-Headers', 'ETag, X-Storage-Backend');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Max-Age', '600');
}

function stripQuotes(etag: string | string[] | undefined): string | undefined {
  if (!etag) return undefined;
  const v = Array.isArray(etag) ? etag[0] : etag;
  return v.replace(/^"|"$/g, '');
}

const SetOperation = z.object({
  op: z.literal('set'),
  key: z.string().min(1).max(256),
  value: z.any(),
});
const DelOperation = z.object({
  op: z.literal('del'),
  key: z.string().min(1).max(256),
});
const ClearOperation = z.object({ op: z.literal('clear') });

const PatchBodySchema = z.array(z.union([SetOperation, DelOperation, ClearOperation])).max(100);
type PatchBody = z.infer<typeof PatchBodySchema>;
type StorageRouteQuery = { Querystring: { ns: string } };
type StoragePatchRoute = StorageRouteQuery & { Body: unknown };

const ensureUser = requireRole('user');

// Helper function to register storage routes under a given prefix
function registerStorage(server: FastifyInstance, prefix = '', backend: any) {
  const base = `${prefix}/storage`;

  server.options(base, async (request, reply) => {
    const origin = request.headers.origin as string | undefined;
    setCors(reply, origin);
    return reply.code(204).send();
  });

  server.route<StorageRouteQuery>({
    method: 'GET',
    url: base,
    schema: {
      querystring: {
        type: 'object',
        properties: { ns: { type: 'string' } },
        required: ['ns'],
      },
    },
    preHandler: ensureUser,
    handler: async (request, reply) => {
      const origin = request.headers.origin as string | undefined;
      setCors(reply, origin);

      const userId = (request as any).authUser.uid;
      const { ns } = request.query;
      const key = `${userId}/${ns}`;
      try {
        const { etag, json } = await backend.read(key);
        reply.header('ETag', `"${etag}"`);
        reply.header('Access-Control-Expose-Headers', 'ETag');
        return json;
      } catch (error: any) {
        if (error instanceof StorageError) {
          if (error.etag) reply.header('ETag', `"${error.etag}"`);
          return reply.status(error.statusCode).send({ error: error.message });
        }
        request.log.error({ err: error, userId, ns }, 'Storage GET failed');
        return reply.status(500).send({ error: 'internal_error' });
      }
    },
  });

  server.route<StoragePatchRoute>({
    method: 'PATCH',
    url: base,
    config: {
      rateLimit: {
        max: 6,
        timeWindow: '10 seconds',
        keyGenerator: (req) => {
          const request = req as FastifyRequest<StoragePatchRoute>;
          const userId = (request as any).authUser?.uid || 'anon';
          const ns = request.query.ns || 'default';
          return `${userId}:${ns}`;
        },
        onExceeded: (_req, _key) => {
          server.metrics.storage_patch_rate_limited_total.inc();
        },
      },
    },
    schema: {
      querystring: {
        type: 'object',
        properties: { ns: { type: 'string' } },
        required: ['ns'],
      },
    },
    preHandler: ensureUser,
    handler: async (request, reply) => {
      const origin = request.headers.origin as string | undefined;
      setCors(reply, origin);
      
      const endTimer = server.metrics.storage_patch_duration_seconds.startTimer();
      server.metrics.storage_patch_total.inc();

      const userId = (request as any).authUser.uid;
      const { ns } = request.query;
      const appId = request.headers['x-thesara-app-id'] as string;
      const ifMatch = stripQuotes(request.headers['if-match']);
      const key = `${userId}/${ns}`;

      const logPayload = { userId, ns, ifMatch, appId, backend: backend.kind };

      if (!appId) {
        request.log.warn(logPayload, 'Missing X-Thesara-App-Id header');
        return reply.status(400).send({ error: 'X-Thesara-App-Id header is required' });
      }

      if (!ifMatch) {
        return reply.status(400).send({ error: 'If-Match header is required' });
      }

      let operations: PatchBody;
      try {
        operations = PatchBodySchema.parse(request.body);
      } catch (e: any) {
        request.log.warn({ ...logPayload, err: e.errors || e }, 'Invalid batch format');
        return reply.code(400).send({ error: 'Invalid batch format', details: e?.errors });
      }

      try {
        const { etag: newEtag, json: resultJson } = await backend.patch(key, operations, ifMatch);

        reply.header('ETag', `"${newEtag}"`);
        reply.header('Access-Control-Expose-Headers', 'ETag');

        server.metrics.storage_batch_size.observe(operations.length);
        server.metrics.storage_patch_success_total.inc();
        endTimer();

        request.log.info(
          { ...logPayload, newEtag, batchLen: operations.length, status: 200 },
          'Storage patch successful',
        );
        
        const statusCode = ifMatch === '0' ? 201 : 200;
        return reply.code(statusCode).send({ version: newEtag, snapshot: resultJson });

      } catch (error: any) {
        endTimer();
        if (error instanceof StorageError) {
           if (error.statusCode === 412) {
            server.metrics.storage_patch_412_total.inc();
          }
           request.log.warn(
            { ...logPayload, code: error.statusCode, err: error.message },
            'Storage patch failed with controlled error',
          );
          if (error.etag) {
            reply.header('ETag', `"${error.etag}"`);
          }
          return reply.status(error.statusCode).send({ error: error.message });
        }

        request.log.error(
          { ...logPayload, err: error, stack: error.stack, code: 500 },
          'Storage PATCH failed unexpectedly',
        );
        return reply.status(500).send({ error: 'storage_write_failed' });
      }
    },
  });
}


export default async function routes(server: FastifyInstance) {
  const cfg = getConfig();
  const backend = await getStorageBackend();
  server.log.info({ driver: cfg.STORAGE_DRIVER, backend: backend.debug }, 'Storage backend initialized');


  server.addHook('preHandler', (_req, reply, done) => {
    reply.header('X-Storage-Backend', backend.kind);
    done();
  });

  registerStorage(server, '', backend);     // alias for backward compatibility
  registerStorage(server, '/api', backend); // primary API prefix
}