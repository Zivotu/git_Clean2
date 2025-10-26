import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

export default async function routes(server: FastifyInstance) {
  if (process.env.NODE_ENV !== 'production' || process.env.DEV_ENABLE_LOCAL_JWT === '1') {
    server.route({
      method: ['GET', 'OPTIONS'],
      url: '/jwt',
      handler: async (request, reply) => {
        if (request.method === 'OPTIONS') {
          return reply.code(204).send();
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
          request.log.warn('JWT_SECRET is not set. Using a default, insecure secret.');
        }

        const signOpts: jwt.SignOptions = {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'thesara-api',
        };
        const aud = process.env.JWT_AUDIENCE;
        if (aud && aud.trim()) {
          signOpts.audience = aud.includes(',')
            ? aud.split(',').map((s) => s.trim()).filter(Boolean)
            : aud.trim();
        }

        const token = jwt.sign(
          {
            sub: 'dev-user',
            role: 'user',
            // Add any other claims your application might need
          },
          secret || 'insecure-dev-secret',
          signOpts,
        );

        return { token };
      },
    });
  }

  server.route({
    method: ['GET', 'OPTIONS'],
    url: '/api/jwt',
    handler: async (request, reply) => {
      if (request.method === 'OPTIONS') {
        return reply.code(204).send();
      }

      return reply.redirect(307, '/jwt');
    },
  });
}
