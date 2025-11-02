import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import jwt from 'jsonwebtoken';
import { setCors } from '../utils/cors.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: {
      uid: string;
      role: string;
      claims: DecodedIdToken | jwt.JwtPayload;
    };
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin as string | undefined;
    // Allow the debug endpoints to run without authentication so we can inspect
    // incoming headers from clients and proxies. These endpoints are safe and
    // intentionally do not expose raw Authorization tokens.
    if (req.url && req.url.includes('__debug_auth')) {
      return;
    }
    const auth = req.headers.authorization;

    // Dev mock user
    if (!auth && process.env.NODE_ENV !== 'production') {
      req.authUser = {
        uid: 'dev-user',
        role: 'admin',
        claims: { uid: 'dev-user', role: 'admin', admin: true } as any,
      };
      return;
    }

    if (!auth || !auth.startsWith('Bearer ')) {
      // No token, but not an error. 
      // Routes that require auth will fail later with a 401 in requireRole.
      return;
    }

    const token = auth.substring(7);

    try {
      const decoded = await getAuth().verifyIdToken(token);
      // Log a concise success marker so ops can see accepted tokens in PM2 logs.
      // We intentionally avoid logging the raw token contents.
      req.log.info({ uid: decoded.uid }, 'auth: firebase token verified');
      const claims: any = decoded;
      const role = claims.role || (claims.admin ? 'admin' : 'user');
      req.authUser = { uid: decoded.uid, role, claims: decoded };
      return;
    } catch (firebaseError) {
      // Trace-level log kept for details; also emit an explicit error-level hint
      // so administrators inspecting server logs can quickly see if Firebase
      // token verification is failing due to missing or invalid credentials.
      req.log.trace({ err: firebaseError }, 'auth: firebase token verification failed, trying fallback');
      req.log.error(
        { err: firebaseError },
        'Firebase token verification failed. Ensure Firebase Admin SDK is initialized and service account credentials are available (GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64).'
      );
    }

    const fallbackSecret = process.env.JWT_SECRET;
    if (fallbackSecret) {
      try {
        const verifyOptions: jwt.VerifyOptions = {
          algorithms: ['HS256'],
          issuer: process.env.JWT_ISSUER || 'thesara-api',
        };
        const envAud = process.env.JWT_AUDIENCE;
        if (envAud && envAud.trim()) {
          (verifyOptions as any).audience = envAud.includes(',')
            ? envAud.split(',').map(s => s.trim()).filter(Boolean)
            : envAud.trim();
        }
        const fallbackClaims = jwt.verify(token, fallbackSecret, verifyOptions) as jwt.JwtPayload;
        const uid = fallbackClaims.sub || fallbackClaims.uid;
        if (typeof uid === 'string' && uid) {
          const role = (fallbackClaims.role as string) || (fallbackClaims.admin ? 'admin' : 'user');
          req.authUser = { uid, role, claims: fallbackClaims };
          return;
        }
      } catch (jwtError) {
        req.log.debug({ err: jwtError }, 'auth:jwt_fallback_failed');
        // Invalid token. Send 401.
        setCors(reply, origin);
        return reply.code(401).send({ error: 'Unauthorized', reason: 'invalid_token' });
      }
    }
  });
};

export default fp(plugin);

export function requireRole(allowed: string | string[] = 'admin') {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin as string | undefined;
    if (!req.authUser?.uid) {
      setCors(reply, origin);
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const role = req.authUser.role;
    const claims = req.authUser.claims as any;
    const isAdmin = claims.admin === true || role === 'admin';
    const ok = isAdmin || roles.includes(role);
    if (!ok) {
      setCors(reply, origin);
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

export function requireAmbassador() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin as string | undefined;
    if (!req.authUser?.uid) {
      setCors(reply, origin);
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    try {
      const { db } = await import('../db.js');
      const userRef = db.collection('users').doc(req.authUser.uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        setCors(reply, origin);
        return reply.code(403).send({ error: 'forbidden' });
      }

      const userData = userDoc.data() as any;
      if (userData.ambassador?.status !== 'approved') {
        setCors(reply, origin);
        return reply.code(403).send({ error: 'not_an_ambassador' });
      }
    } catch (error) {
      req.log.error(error, 'requireAmbassador check failed');
      setCors(reply, origin);
      return reply.code(500).send({ error: 'internal_server_error' });
    }
  };
}
