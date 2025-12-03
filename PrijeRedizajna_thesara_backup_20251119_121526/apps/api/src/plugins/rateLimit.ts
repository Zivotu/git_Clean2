import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';

function resolveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveClientIp(req: any): string {
  const forwarded =
    (req.headers['cf-connecting-ip'] as string | undefined) ||
    (req.headers['x-real-ip'] as string | undefined) ||
    (req.headers['x-forwarded-for'] as string | undefined);
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip;
}

const plugin: FastifyPluginAsync = fp(async (app) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultMax = isProduction ? 600 : 10000;
  const max = resolveNumber(process.env.GLOBAL_RATE_LIMIT_MAX, defaultMax);
  const timeWindow = process.env.GLOBAL_RATE_LIMIT_WINDOW || '1 minute';

  await app.register(rateLimit, {
    global: true,
    max,
    timeWindow,
    keyGenerator: (req: any) =>
      req.authUser?.uid || req.headers['x-thesara-app-id'] || resolveClientIp(req),
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  });
});

export default plugin;
