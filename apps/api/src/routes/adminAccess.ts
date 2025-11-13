import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../db.js';
import { rateLimit } from '../rateLimit.js';
import { requireRole } from '../middleware/auth.js';

type AdminAccessDoc = {
  allowedEmails?: string[];
};

const ACCESS_DOC = db.collection('adminSettings').doc('accessControl');
const PIN_HASH_ENV = (process.env.ADMIN_ACCESS_PIN_HASH || '').trim();
const PIN_SALT = process.env.ADMIN_ACCESS_PIN_SALT || '';
const RATE_LIMIT_WINDOW_MS = Number(process.env.ADMIN_ACCESS_WINDOW_MS || 5 * 60_000);
const RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.ADMIN_ACCESS_MAX_ATTEMPTS || 5);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function loadAllowedEmails(): Promise<string[]> {
  const snap = await ACCESS_DOC.get();
  const data = snap.data() as AdminAccessDoc | undefined;
  if (Array.isArray(data?.allowedEmails)) {
    return data.allowedEmails.map((entry) => normalizeEmail(String(entry)));
  }
  return [];
}

async function saveAllowedEmails(emails: string[]): Promise<string[]> {
  const normalized = emails.map((email) => normalizeEmail(email)).filter(Boolean);
  normalized.sort();
  await ACCESS_DOC.set({ allowedEmails: normalized }, { merge: true });
  return normalized;
}

function isConfigured(): boolean {
  return Boolean(PIN_HASH_ENV);
}

function timingSafeMatchPin(pin: string): boolean {
  if (!PIN_HASH_ENV) return false;
  let expected: Buffer | null = null;
  let attempt: Buffer | null = null;
  try {
    expected = Buffer.from(PIN_HASH_ENV, 'hex');
  } catch {
    return false;
  }
  attempt = crypto.createHash('sha256').update(pin + PIN_SALT).digest();
  if (expected.length !== attempt.length) return false;
  return crypto.timingSafeEqual(expected, attempt);
}

async function enforceRateLimit(req: FastifyRequest): Promise<void> {
  if (!req.authUser?.uid) {
    throw Object.assign(new Error('unauthenticated'), { statusCode: 401 });
  }
  try {
    await rateLimit(
      db,
      'adminAccessAttempts',
      `${req.authUser.uid}:${req.ip || 'unknown'}`,
      RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_ATTEMPTS,
    );
  } catch (err: any) {
    if (err?.message === 'RATE_LIMITED') {
      throw Object.assign(new Error('too_many_attempts'), { statusCode: 429 });
    }
    throw err;
  }
}

async function resolveUserEmail(uid: string, claims: Record<string, any> | undefined) {
  const claimEmail = claims?.email;
  if (typeof claimEmail === 'string' && claimEmail.includes('@')) {
    return claimEmail;
  }
  const userRecord = await getAuth().getUser(uid);
  return userRecord.email;
}

export default async function adminAccessRoutes(app: FastifyInstance) {
  const unlockSchema = z.object({
    pin: z.string().min(4).max(128),
  });

  const unlockHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = req.authUser?.uid;
    if (!uid) {
      return reply
        .code(401)
        .send({ error: 'unauthenticated', code: 'unauthenticated', message: 'Prijavite se prije pokušaja.' });
    }
    if (!isConfigured()) {
      req.log.error('ADMIN_ACCESS_PIN_HASH not configured; refusing unlock request');
      return reply
        .code(500)
        .send({ error: 'config_error', code: 'config_error', message: 'Admin access nije konfiguriran.' });
    }
    let pin: string;
    try {
      ({ pin } = unlockSchema.parse(req.body ?? {}));
    } catch {
      return reply.code(400).send({ error: 'invalid_body', code: 'invalid_body', message: 'PIN nije ispravan oblik.' });
    }

    try {
      await enforceRateLimit(req);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      if (status === 429) {
        return reply
          .code(429)
          .send({
            error: 'too_many_attempts',
            code: 'too_many_attempts',
            message: 'Previše pokušaja. Pričekajte i pokušajte ponovno.',
          });
      }
      throw err;
    }

    const email = await resolveUserEmail(uid, req.authUser?.claims as any);
    if (!email) {
      return reply
        .code(403)
        .send({ error: 'missing_email', code: 'missing_email', message: 'Račun nema potvrđenu adresu e-pošte.' });
    }
    const normalizedEmail = normalizeEmail(email);
    const allowedEmails = await loadAllowedEmails();
    if (!allowedEmails.includes(normalizedEmail)) {
      req.log.warn({ uid, email: normalizedEmail }, 'admin_access:not_allowed');
      return reply
        .code(403)
        .send({ error: 'not_allowed', code: 'not_allowed', message: 'Nemate dopuštenje za admin sučelje.' });
    }

    if (!timingSafeMatchPin(pin)) {
      req.log.warn({ uid, email: normalizedEmail }, 'admin_access:invalid_pin');
      return reply.code(403).send({ error: 'invalid_pin', code: 'invalid_pin', message: 'PIN nije točan.' });
    }

    const auth = getAuth();
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims || {};
    const alreadyAdmin =
      currentClaims.admin === true ||
      String(currentClaims.role).toLowerCase() === 'admin' ||
      currentClaims.isAdmin === true;

    if (!alreadyAdmin) {
      const nextClaims = {
        ...currentClaims,
        admin: true,
        isAdmin: true,
        role: 'admin',
      };
      await auth.setCustomUserClaims(uid, nextClaims);
      req.log.info({ uid }, 'admin_access:granted');
    } else {
      req.log.info({ uid }, 'admin_access:already_admin');
    }

    return reply.send({
      ok: true,
      admin: true,
      requiresRefresh: !alreadyAdmin,
    });
  };

  app.post('/admin/access/unlock', unlockHandler);
  app.post('/api/admin/access/unlock', unlockHandler);

  const updateAllowedSchema = z.object({
    emails: z
      .array(
        z
          .string()
          .min(3)
          .max(320)
          .transform((value) => normalizeEmail(value)),
      )
      .max(100),
  });

  const listAllowedHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    const emails = await loadAllowedEmails();
    return reply.send({ emails });
  };

  app.get('/admin/access/allowed', { preHandler: [requireRole('admin')] }, listAllowedHandler);
  app.get('/api/admin/access/allowed', { preHandler: [requireRole('admin')] }, listAllowedHandler);

  const saveHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    let emails: string[];
    try {
      ({ emails } = updateAllowedSchema.parse(req.body ?? {}));
    } catch {
      return reply.code(400).send({ error: 'invalid_body', code: 'invalid_body', message: 'Popis e-pošta nije ispravan.' });
    }
    const filtered = emails.filter(Boolean);
    const deduped = Array.from(new Set(filtered));
    const saved = await saveAllowedEmails(deduped);
    req.log.info({ count: saved.length }, 'admin_access:allowed_updated');
    return reply.send({ ok: true, emails: saved });
  };

  app.post('/admin/access/allowed', { preHandler: [requireRole('admin')] }, saveHandler);
  app.post('/api/admin/access/allowed', { preHandler: [requireRole('admin')] }, saveHandler);
  app.put('/admin/access/allowed', { preHandler: [requireRole('admin')] }, saveHandler);
  app.put('/api/admin/access/allowed', { preHandler: [requireRole('admin')] }, saveHandler);
}
