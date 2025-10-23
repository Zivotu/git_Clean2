// apps/api/src/routes/storage.ts
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getBucket } from '../storage.js';
import { requireRole } from '../middleware/auth.js';

// Whitelist za CORS (prod + dev)
const ALLOWED_ORIGINS = new Set([
  'https://thesara.space',
  'https://apps.thesara.space',
  'http://localhost:3000',
]);

function setCors(reply: any, origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://thesara.space';
  reply.header('Access-Control-Allow-Origin', allow);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Authorization, If-Match, Content-Type');
  reply.header('Access-Control-Expose-Headers', 'ETag'); // Expose ETag
  reply.header('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  reply.header('Access-Control-Max-Age', '600');
}

function stripQuotes(etag: string | string[] | undefined): string | undefined {
  if (!etag) return undefined;
  const v = Array.isArray(etag) ? etag[0] : etag;
  return v.replace(/^"|"$/g, '');
}

// Zod schemas for validation
const SetOperation = z.object({
  op: z.literal('set'),
  key: z.string().min(1).max(256),
  value: z.any(), // Further validation for size is done in the handler
});
const DelOperation = z.object({
  op: z.literal('del'),
  key: z.string().min(1).max(256),
});
const ClearOperation = z.object({ op: z.literal('clear') });

const PatchBodySchema = z.array(z.union([SetOperation, DelOperation, ClearOperation])).max(100);
type PatchBody = z.infer<typeof PatchBodySchema>;

// Minimalni storage adapter za GCS
const db = {
  async get(key: string): Promise<{ data: any; version: string } | null> {
    const bucket = getBucket();
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [[metadata], content] = await Promise.all([file.getMetadata(), file.download()]);
    return { data: JSON.parse(content.toString()), version: String(metadata.generation) };
  },
  async set(key: string, data: any, version: string | 0): Promise<string> {
    const bucket = getBucket();
    const file = bucket.file(key);
    const [metadata] = await file.save(JSON.stringify(data), {
      contentType: 'application/json',
      preconditionOpts: version ? ({ ifGenerationMatch: version } as any) : undefined,
    });
    return String(metadata.generation);
  },
};

export default async function routes(server: FastifyInstance) {
  // Preflight CORS
  server.route({
    method: 'OPTIONS',
    url: '/storage',
    handler: async (request, reply) => {
      setCors(reply, request.headers.origin as string | undefined);
      return reply.send();
    },
  });

  // Zahtijevaj autentificiranog usera
  server.addHook('preHandler', requireRole('user'));

  // GET snapshot
  server.route({
    method: 'GET',
    url: '/storage',
    schema: {
      querystring: {
        type: 'object',
        properties: { ns: { type: 'string' } },
        required: ['ns'],
      },
    },
    handler: async (request: FastifyRequest<{ Querystring: { ns: string } }>, reply) => {
      const userId = (request as any).authUser.uid;
      const { ns } = request.query;
      const key = `userAppData/${userId}/${ns}.json`;
      try {
        const result = await db.get(key);
        const version = result?.version || '0';
        const data = result?.data || {};
        reply.header('ETag', `"${version}"`);
        setCors(reply, request.headers.origin as string | undefined);
        return data;
      } catch (error) {
        request.log.error({ err: error, userId, ns }, 'Storage GET failed');
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  });

  // PATCH batch
  server.route({
    method: 'PATCH',
    url: '/storage',
    config: {
      rateLimit: {
        max: 6,
        timeWindow: '10 seconds',
        keyGenerator: (req: FastifyRequest<{ Querystring: { ns: string } }>) => {
          const userId = (req as any).authUser?.uid || 'anon';
          const ns = req.query.ns || 'default';
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
    handler: async (
      request: FastifyRequest<{ Querystring: { ns: string }; Body: unknown }>,
      reply,
    ) => {
      const end = server.metrics.storage_patch_duration_seconds.startTimer();
      server.metrics.storage_patch_total.inc();

      const userId = (request as any).authUser.uid;
      const { ns } = request.query;
      const key = `userAppData/${userId}/${ns}.json`;
      const ifMatch = stripQuotes(request.headers['if-match']);
      let operations: PatchBody;

      const logPayload = { userId, ns, ifMatch };

      if (!ifMatch) {
        return reply.status(400).send({ error: 'If-Match header is required' });
      }

      try {
        operations = PatchBodySchema.parse(request.body);
      } catch (e: any) {
        request.log.warn({ ...logPayload, err: e.errors || e }, 'Invalid batch request');
        return reply.code(400).send({ error: 'Invalid batch format', details: e?.errors });
      }

      try {
        const current = await db.get(key);
        const currentVersion = current?.version || '0';

        if (String(currentVersion) !== String(ifMatch)) {
          server.metrics.storage_patch_412_total.inc();
          request.log.info({ ...logPayload, currentVersion }, 'Storage patch conflict (412)');
          return reply.status(412).send({ error: 'Version mismatch' });
        }

        let data = current?.data || {};
        for (const op of operations) {
          switch (op.op) {
            case 'set':
              const valueStr = JSON.stringify(op.value);
              if (Buffer.byteLength(valueStr, 'utf-8') > 16 * 1024) {
                const error = `Value for key '${op.key}' exceeds 16KB limit.`;
                request.log.warn({ ...logPayload, key: op.key }, error);
                return reply.status(400).send({ error });
              }
              data[op.key] = op.value;
              break;
            case 'del':
              delete data[op.key];
              break;
            case 'clear':
              data = {};
              break;
          }
        }

        const dataStr = JSON.stringify(data);
        if (Buffer.byteLength(dataStr, 'utf-8') > 1_048_576) { // 1 MB limit on final snapshot
          const error = 'Final snapshot too large (limit 1MB)';
          request.log.warn({ ...logPayload, size: dataStr.length }, error);
          return reply.status(413).send({ error });
        }

        const newVersion = await db.set(key, data, currentVersion || 0);
        reply.header('ETag', `"${String(newVersion)}"`);
        setCors(reply, request.headers.origin as string | undefined);

        server.metrics.storage_batch_size.observe(operations.length);
        server.metrics.storage_patch_success_total.inc();
        end(); // End duration timer

        request.log.info(
          { ...logPayload, newVersion, batchSize: operations.length, status: 200 },
          'Storage patch successful'
        );

        return { version: newVersion, snapshot: data };
      } catch (error: any) {
        end(); // End duration timer
        if (error?.code === 412 || /Precondition/i.test(String(error?.message))) {
          server.metrics.storage_patch_412_total.inc();
          request.log.info({ ...logPayload, currentVersion: ifMatch }, 'Storage patch conflict (412) on write');
          return reply.status(412).send({ error: 'Version mismatch' });
        }

        request.log.error({ ...logPayload, err: error }, 'Storage PATCH failed');
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    },
  });
}