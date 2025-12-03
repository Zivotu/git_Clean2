import { FastifyInstance, FastifyRequest } from 'fastify';
import { getAppByIdOrSlug, readAppKv } from '../db.js';
import { AppSecurityPolicy } from '../types.js';
import { z } from 'zod';

const ProxyQuerySchema = z.object({
  url: z.string().url(),
  appId: z.string(),
});

type ProxyRequest = FastifyRequest<{ Querystring: z.infer<typeof ProxyQuerySchema> }>;

const rateLimitStore = new Map<string, { count: number; lastRequest: number }>();

export default async function proxyRoutes(app: FastifyInstance) {
  app.get('/api/proxy', async (request: ProxyRequest, reply) => {
    const result = ProxyQuerySchema.safeParse(request.query);
    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query parameters', details: result.error.flatten() });
    }

    const { url, appId } = result.data;
    const appRecord = await getAppByIdOrSlug(appId);

    if (!appRecord) {
      return reply.code(404).send({ error: 'App not found' });
    }

    const kv = await readAppKv(appRecord.id);
    const securityPolicy = kv['security-policy-v1'] as AppSecurityPolicy | undefined;

    if (securityPolicy?.network?.mode !== 'proxy' && securityPolicy?.network?.mode !== 'direct+proxy') {
      app.log.warn({ appId, url }, 'Proxy request blocked: network mode is not proxy or direct+proxy');
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const targetUrl = new URL(url);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      app.log.warn({ appId, url }, 'Proxy request blocked: invalid protocol');
      return reply.code(400).send({ error: 'Invalid protocol' });
    }

    const allowlist = securityPolicy?.network?.allowlist || [];
    if (!allowlist.includes(targetUrl.hostname)) {
      app.log.warn({ appId, url, hostname: targetUrl.hostname, allowlist }, 'Proxy request blocked: domain not in allowlist');
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const rateLimitPolicy = securityPolicy?.network?.rateLimit;
    if (rateLimitPolicy) {
      const now = Date.now();
      const key = `${appId}:${targetUrl.hostname}`;
      const entry = rateLimitStore.get(key);

      if (entry && now - entry.lastRequest < 1000) {
        if (entry.count >= rateLimitPolicy.rps) {
          app.log.warn({ appId, url }, 'Proxy request blocked: rate limit exceeded');
          return reply.code(429).send({ error: 'Too Many Requests' });
        }
        entry.count++;
      } else {
        rateLimitStore.set(key, { count: 1, lastRequest: now });
      }
    }

    try {
      const response = await fetch(url, { method: 'GET' });
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
          reply.header(key, value);
        }
      });
      return reply.send(response.body);
    } catch (error: any) {
      app.log.error({ appId, url, error: error.message }, 'Proxy request failed');
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
