import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

const DEV_ONLY =
  process.env.NODE_ENV !== 'production' || process.env.DEV_ENABLE_LOCAL_JWT === '1';

const sendToken = async (request: FastifyRequest, reply: FastifyReply) => {
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
    },
    secret || 'insecure-dev-secret',
    signOpts,
  );

  return reply.code(200).send({ token });
};

export default async function routes(server: FastifyInstance) {
  if (!DEV_ONLY) return;

  const register = (url: string) => {
    server.options(url, async (_request: FastifyRequest, reply: FastifyReply) =>
      reply.code(204).send(),
    );
    server.get(url, sendToken);
    server.post(url, sendToken);
  };

  register('/jwt');
  register('/api/jwt');
}
