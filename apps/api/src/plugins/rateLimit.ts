import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../config.js';

const plugin: FastifyPluginAsync = fp(async (app) => {
  // Disable or relax rate limiting for local development
  if (process.env.NODE_ENV !== 'production') {
    await app.register(rateLimit, {
      global: true,
      max: 10000, // Effectively disables rate limit in dev
      timeWindow: '1 minute',
      keyGenerator: (req: any) => req.authUser?.uid || req.ip,
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
    });
  } else {
    await app.register(rateLimit, {
      global: true,
      max: 120,
      timeWindow: '1 minute',
      keyGenerator: (req: any) => req.authUser?.uid || req.ip,
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
    });
  }
});

export default plugin;
