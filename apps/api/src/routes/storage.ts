import { FastifyInstance, FastifyRequest } from 'fastify';
import { writeFile } from 'fs/promises';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { setCors } from '../utils/cors.js';
// Re-export setCors for backward compatibility so other modules can import
// it from './storage' (some files expect it to be exported from this module).
export { setCors };
import { getStorageBackend, StorageError } from '../storageV2.js';
import { getConfig } from '../config.js';

// CORS helper moved to ../utils/cors.js to avoid circular import with auth plugin

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
      const scope = (request.headers['x-thesara-scope'] as string | undefined)?.toLowerCase() === 'shared' ? 'shared' : 'user';
      const key = scope === 'shared' ? ns : `${userId}/${ns}`;
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
        // Safe dump for debugging: write minimal request metadata (no tokens) to /tmp
        try {
          const dump = {
            ts: new Date().toISOString(),
            reqId: (request as any).id || null,
            method: request.method,
            url: request.url,
            userId: userId || null,
            ns,
            headers: {
              hasAuthorization: !!request.headers.authorization,
              xThesaraScope: request.headers['x-thesara-scope'] || null,
            },
            note: 'This file intentionally omits Authorization header contents for security.'
          };
          await writeFile('/tmp/thesara-last-request.json', JSON.stringify(dump, null, 2), { mode: 0o600 });
        } catch (wfErr) {
          request.log.debug({ err: wfErr }, 'Failed to write /tmp/thesara-last-request.json');
        }
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
  const scope = (request.headers['x-thesara-scope'] as string | undefined)?.toLowerCase() === 'shared' ? 'shared' : 'user';
  const key = scope === 'shared' ? ns : `${userId}/${ns}`;

  const logPayload = { userId, ns, ifMatch, appId, scope, backend: backend.kind };

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
        // Safe dump for debugging: write minimal request metadata (no tokens) to /tmp
        try {
          const dump = {
            ts: new Date().toISOString(),
            reqId: (request as any).id || null,
            method: request.method,
            url: request.url,
            userId: (request as any).authUser?.uid || null,
            ns,
            ifMatch,
            appId: appId || null,
            scope,
            headers: {
              hasAuthorization: !!request.headers.authorization,
              xThesaraScope: request.headers['x-thesara-scope'] || null,
            },
            note: 'This file intentionally omits Authorization header contents for security.'
          };
          await writeFile('/tmp/thesara-last-request.json', JSON.stringify(dump, null, 2), { mode: 0o600 });
        } catch (wfErr) {
          request.log.debug({ err: wfErr }, 'Failed to write /tmp/thesara-last-request.json');
        }
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

  // Lightweight, safe debug endpoint to inspect whether Authorization header
  // and X-Thesara-Scope reach the Fastify server and to show any resolved
  // authUser claims (if present). This intentionally does NOT echo the raw
  // Authorization header value.
  server.get('/__debug_auth', async (request, reply) => {
    try {
      const origin = request.headers.origin as string | undefined;
      setCors(reply, origin);
      const hasAuthorization = !!request.headers.authorization;
      const xThesaraScope = request.headers['x-thesara-scope'] || null;
      const authUser = (request as any).authUser || null;
      return {
        ts: new Date().toISOString(),
        reqId: (request as any).id || null,
        method: request.method,
        url: request.url,
        hasAuthorization,
        xThesaraScope,
        authUser,
        note: 'This endpoint is for debugging only and does not return raw Authorization token.'
      };
    } catch (err: any) {
      request.log.error({ err }, 'debug endpoint failed');
      return reply.status(500).send({ error: 'debug_handler_error', message: err?.message || String(err), stack: (err?.stack || '').split('\n').slice(0,10) });
    }
  });
  // Also expose under /api prefix to ensure the API proxy path can reach it
  server.get('/api/__debug_auth', async (request, reply) => {
    try {
      const origin = request.headers.origin as string | undefined;
      setCors(reply, origin);
      const hasAuthorization = !!request.headers.authorization;
      const xThesaraScope = request.headers['x-thesara-scope'] || null;
      const authUser = (request as any).authUser || null;
      return {
        ts: new Date().toISOString(),
        reqId: (request as any).id || null,
        method: request.method,
        url: request.url,
        hasAuthorization,
        xThesaraScope,
        authUser,
        note: 'This endpoint is for debugging only and does not return raw Authorization token.'
      };
    } catch (err: any) {
      request.log.error({ err }, 'debug endpoint failed');
      return reply.status(500).send({ error: 'debug_handler_error', message: err?.message || String(err), stack: (err?.stack || '').split('\n').slice(0,10) });
    }
  });

  registerStorage(server, '', backend);     // alias for backward compatibility
  registerStorage(server, '/api', backend); // primary API prefix
}