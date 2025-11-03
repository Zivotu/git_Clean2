import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { setCors } from '../utils/cors.js';

function maskAuthorizationHeader(header: string | undefined | null) {
  try {
    if (!header || typeof header !== 'string') return null;
    const parts = header.split(' ');
    if (parts.length >= 2) {
      const scheme = parts[0];
      const token = parts.slice(1).join(' ');
      if (!token) return scheme;
      const head = token.slice(0, 8);
      const tail = token.length > 8 ? token.slice(-8) : '';
      return `${scheme} ${head}...${tail}`;
    }
    const h = header;
    const head = h.slice(0, 8);
    const tail = h.length > 8 ? h.slice(-8) : '';
    return `${head}...${tail}`;
  } catch (e) {
    return null;
  }
}

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
    } catch (firebaseError: any) {
      // Trace-level log kept for details; also emit an explicit error-level hint
      // so administrators inspecting server logs can quickly see if Firebase
      // token verification is failing due to missing or invalid credentials.
      req.log.trace({ err: firebaseError }, 'auth: firebase token verification failed, trying fallback');
      req.log.error(
        { err: firebaseError },
        'Firebase token verification failed. Ensure Firebase Admin SDK is initialized and service account credentials are available (GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64).'
      );
      // Also emit a concise warning with only the error message/code so it is
      // visible in higher log levels without exposing token or PII.
      try {
        const short = { message: firebaseError?.message, code: firebaseError?.code, name: firebaseError?.name };
        req.log.warn(short, 'auth: firebase verify error summary');
        // Also persist a single-line, non-PII JSON record to tmp so the
        // developer running the server locally can easily paste the exact
        // concise error object for diagnosis. This file is intentionally
        // minimal and contains only timestamp, request id, method/url and
        // the short error summary (no tokens or user identifiers).
        try {
          const p = path.join(process.cwd(), 'tmp', 'auth-verify-errors.log');
          const entry = {
            ts: new Date().toISOString(),
            reqId: (req as any).id || req.headers['x-request-id'] || null,
            method: (req as any).method,
            url: (req as any).url,
            summary: short,
            // Include a safe masked preview of the Authorization header so
            // operators can see whether a malformed/partial/expired token was
            // presented without ever writing the raw token to disk.
            maskedAuthorization: maskAuthorizationHeader(auth as any),
          };
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.appendFileSync(p, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
        } catch (fsErr) {
          // swallow file system errors to avoid breaking request handling
        }
      } catch (logErr) {
        // swallow logging errors to avoid breaking request handling
      }
      // If the ID token is expired, respond with a specific 401 body so
      // clients can detect and refresh the token automatically instead of
      // guessing on a generic unauthorized response.
      try {
        if (firebaseError?.code === 'auth/id-token-expired') {
          setCors(reply, origin);
          return reply.code(401).send({ error: 'Unauthorized', reason: 'token_expired' });
        }
      } catch (sendErr) {
        // ignore send errors and continue to fallback
      }
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
