
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from 'firebase-admin/auth';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../db.js';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';

export default async function adminRoutes(app: FastifyInstance) {
  // Handler reused for both `/admin/users` and `/api/admin/users` to ensure
  // clients calling either URL will be served regardless of prefix-stripping
  // behavior in different environments.
  const listUsersHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      limit: z.preprocess((v) => Number(v), z.number().int().min(1).max(100)).optional().default(100),
      page: z.preprocess((v) => Number(v), z.number().int().min(0)).optional().default(0),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    }

    const { limit, page } = parsed.data;
    const pageToken = page > 0 ? Buffer.from(JSON.stringify({ page })).toString('base64') : undefined;

    try {
      const userRecords = await getAuth().listUsers(limit, pageToken);

      const userDocs: Array<DocumentSnapshot> = await Promise.all(
        userRecords.users.map((user) => db.collection('users').doc(user.uid).get()),
      );

      const users = userRecords.users.map((user, index) => {
        const userDoc = userDocs[index];
        const userData = userDoc && userDoc.exists ? (userDoc.data() as Record<string, unknown>) : {};

        // Safely extract `ambassador` only if it's a string; otherwise null.
        const ambassador =
          userData && typeof userData['ambassador'] === 'string' ? (userData['ambassador'] as string) : null;

        return {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          customClaims: user.customClaims,
          disabled: user.disabled,
          ambassador,
        };
      });

      return reply.send({ users, nextPage: userRecords.pageToken });
    } catch (error) {
      req.log.error(error, 'Failed to list users');
      return reply.code(500).send({ error: 'internal_server_error', details: (error as Error).message });
    }
  };

  app.get('/admin/users', { preHandler: [requireRole('admin')] }, listUsersHandler);
  app.get('/api/admin/users', { preHandler: [requireRole('admin')] }, listUsersHandler);

  const setClaimsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ uid: z.string() });
    const bodySchema = z.object({ claims: z.record(z.any()) });

    const paramsParsed = paramsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid_params', details: paramsParsed.error.issues });
    }

    const bodyParsed = bodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: bodyParsed.error.issues });
    }

    const { uid } = paramsParsed.data;
    const { claims } = bodyParsed.data;

    try {
      await getAuth().setCustomUserClaims(uid, claims);
      return reply.send({ status: 'ok' });
    } catch (error) {
      req.log.error(error, `Failed to set custom claims for user ${uid}`);
      return reply.code(500).send({ error: 'internal_server_error' });
    }
  };

  app.post('/admin/users/:uid/claims', { preHandler: [requireRole('admin')] }, setClaimsHandler);
  app.post('/api/admin/users/:uid/claims', { preHandler: [requireRole('admin')] }, setClaimsHandler);

  // Email templates management (Firestore-backed)
  const listEmailTemplatesHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const col = db.collection('emailTemplates');
      const snap = await col.get();
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      return reply.send({ items });
    } catch (err) {
      req.log.error({ err }, 'list_email_templates_failed');
      return reply.code(500).send({ error: 'list_failed' });
    }
  };

  app.get('/admin/email-templates', { preHandler: [requireRole('admin')] }, listEmailTemplatesHandler);
  app.get('/api/admin/email-templates', { preHandler: [requireRole('admin')] }, listEmailTemplatesHandler);

  const getEmailTemplateHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    if (!id) return reply.code(400).send({ error: 'missing_id' });
    try {
      const doc = await db.collection('emailTemplates').doc(id).get();
      if (!doc.exists) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ id: doc.id, ...(doc.data() as Record<string, any>) });
    } catch (err) {
      req.log.error({ err, id }, 'get_email_template_failed');
      return reply.code(500).send({ error: 'get_failed' });
    }
  };

  app.get('/admin/email-templates/:id', { preHandler: [requireRole('admin')] }, getEmailTemplateHandler);
  app.get('/api/admin/email-templates/:id', { preHandler: [requireRole('admin')] }, getEmailTemplateHandler);

  const upsertEmailTemplateHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    const body = (req.body || {}) as Record<string, any>;
    if (!id) return reply.code(400).send({ error: 'missing_id' });
    try {
      const allowed = ['subject', 'body', 'description'];
      const patch: Record<string, any> = {};
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
      }
      patch.updatedAt = Date.now();
      patch.updatedBy = req.authUser?.uid ?? null;
      await db.collection('emailTemplates').doc(id).set(patch, { merge: true });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, id, body }, 'upsert_email_template_failed');
      return reply.code(500).send({ error: 'upsert_failed' });
    }
  };

  app.post('/admin/email-templates/:id', { preHandler: [requireRole('admin')] }, upsertEmailTemplateHandler);
  app.post('/api/admin/email-templates/:id', { preHandler: [requireRole('admin')] }, upsertEmailTemplateHandler);

  // Fallback/default templates for known template ids. Useful for preview/restore in admin UI.
  const getFallbackEmailTemplateHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as any;
    if (!id) return reply.code(400).send({ error: 'missing_id' });

    const known: Record<string, { subject: string; body: string }> = {
      welcome: {
        subject: 'Dobrodošli u Thesaru',
        body:
          'Bok {{displayName}},\n\nDobrodošli u Thesaru! Spremni smo pomoći vam u stvaranju i objavi vaših aplikacija.\n\nAko trebate pomoć, javite nam se na {{supportEmail}}.\n\nTHESARA tim',
      },
      'review:approval_notification': {
        subject: 'Vaša aplikacija "{{appTitle}}" je odobrena',
        body:
          'Bok {{displayName}},\n\nVaša aplikacija "{{appTitle}}" (ID: {{appId}}) je odobrena i objavljena.\n\nLink za upravljanje: {{manageUrl}}\n\nTHESARA tim',
      },
      'review:reject_notification': {
        subject: 'Aplikacija "{{appTitle}}" nije prihvaćena',
        body:
          'Bok {{displayName}},\n\nNažalost, Vaša aplikacija "{{appTitle}}" (ID: {{appId}}) nije prošla pregled.\nRazlog: {{reason}}\n\nMožete urediti aplikaciju i ponovno je poslati.\n\nTHESARA tim',
      },
      'publish:pending_notification': {
        subject: 'Vaša aplikacija "{{appTitle}}" čeka odobrenje',
        body:
          'Bok {{displayName}},\n\nZaprimili smo vaš zahtjev za objavu aplikacije "{{appTitle}}". Naš tim će pregledati sadržaj i obavijestiti vas o odluci.\n\nTHESARA tim',
      },
    };

    if (known[id]) return reply.send({ id, ...known[id] });

    return reply.code(404).send({ error: 'no_fallback' });
  };

  app.get('/admin/email-templates/:id/fallback', { preHandler: [requireRole('admin')] }, getFallbackEmailTemplateHandler);
  app.get('/api/admin/email-templates/:id/fallback', { preHandler: [requireRole('admin')] }, getFallbackEmailTemplateHandler);
}
