import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

const DEV_ONLY = process.env.DEV_ENABLE_LOCAL_JWT === '1';

/**
 * Security: Check if request originates from localhost.
 * Prevents accidental JWT token leakage if DEV_ENABLE_LOCAL_JWT is set in production.
 */
function isLocalRequest(request: FastifyRequest): boolean {
  // Hardening: if request was proxied (nginx adds X-Forwarded-For), this is NOT a local-only request.
  if (request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || request.headers['forwarded']) {
    return false;
  }
  const hostname = request.hostname;
  const ip = request.ip;

  // Check hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return true;
  }

  // Check IP address (including IPv6 mapped IPv4)
  if (ip === '127.0.0.1' || ip === '::1' || ip?.startsWith('::ffff:127.')) {
    return true;
  }

  return false;
}

const sendToken = async (request: FastifyRequest, reply: FastifyReply) => {
  // Security: Only allow localhost requests to prevent token leakage
  if (!isLocalRequest(request)) {
    request.log.warn(
      { ip: request.ip, hostname: request.hostname },
      'jwt_dev_endpoint: blocked non-localhost request'
    );
    return reply.code(403).send({
      error: 'forbidden',
      message: 'JWT dev endpoint only accessible from localhost'
    });
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
    },
    secret || 'insecure-dev-secret',
    signOpts,
  );

  request.log.info({ ip: request.ip }, 'jwt_dev_endpoint: token issued to localhost');
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
