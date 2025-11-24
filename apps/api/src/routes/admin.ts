
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from 'firebase-admin/auth';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { db, listEntitlements } from '../db.js';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import {
  create as createEntitlement,
  update as updateEntitlement,
  remove as removeEntitlement,
} from '../entitlements/service.js';

export default async function adminRoutes(app: FastifyInstance) {
  // Handler reused for both `/admin/users` and `/api/admin/users` to ensure
  // clients calling either URL will be served regardless of prefix-stripping
  // behavior in different environments.
  const listUsersHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      limit: z.preprocess((v) => Number(v), z.number().int().min(1).max(100)).optional().default(100),
      // Cursor based pagination for Firestore
      cursor: z.string().optional(),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.issues });
    }

    const { limit, cursor } = parsed.data;

    try {
      let query = db.collection('users').orderBy('createdAt', 'desc').limit(limit);
      if (cursor) {
        const cursorDoc = await db.collection('users').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();
      const userDocs = snapshot.docs;
      const uids = userDocs.map((d) => d.id);

      // Fetch auth data for these users
      const authUsers = await Promise.all(
        uids.map(async (uid) => {
          try {
            return await getAuth().getUser(uid);
          } catch (e) {
            return null;
          }
        })
      );

      const users = userDocs.map((doc, index) => {
        const userData = doc.data();
        const authUser = authUsers[index];

        // Safely extract `ambassador` only if it's a string; otherwise null.
        const ambassador =
          userData && typeof userData['ambassador'] === 'string' ? (userData['ambassador'] as string) : null;

        return {
          uid: doc.id,
          email: authUser?.email || userData.email || '',
          displayName: authUser?.displayName || userData.displayName || '',
          customClaims: authUser?.customClaims || {},
          disabled: authUser?.disabled || false,
          ambassador,
          firstName: userData?.firstName || null,
          lastName: userData?.lastName || null,
          birthYear: userData?.birthYear || null,
          phone: userData?.phone || null,
          gender: userData?.gender || null,
          bio: userData?.bio || null,
          photoURL: userData?.photoURL || authUser?.photoURL || null,
          createdAt: userData?.createdAt ? (userData.createdAt as any).toMillis?.() || userData.createdAt : null,
          visitCount: userData?.visitCount || 0,
          lastVisitAt: userData?.lastVisitAt || null,
        };
      });

      const lastDoc = userDocs[userDocs.length - 1];
      const nextCursor = lastDoc ? lastDoc.id : undefined;

      return reply.send({ users, nextCursor });
    } catch (error) {
      req.log.error(error, 'Failed to list users');
      return reply.code(500).send({ error: 'internal_server_error', details: (error as Error).message });
    }
  };

  app.get('/admin/users', { preHandler: [requireRole('admin')] }, listUsersHandler);
  app.get('/api/admin/users', { preHandler: [requireRole('admin')] }, listUsersHandler);

  const banUserHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as any;
    if (!uid) return reply.code(400).send({ error: 'missing_uid' });

    try {
      // Disable user in Auth
      await getAuth().updateUser(uid, { disabled: true });

      // Set all user's apps to unlisted
      const appsSnap = await db.collection('apps').where('ownerUid', '==', uid).get();
      const batch = db.batch();
      appsSnap.docs.forEach((doc) => {
        // Mark as quarantined so we know which ones to restore if unbanned
        batch.update(doc.ref, { visibility: 'unlisted', state: 'quarantined' });
      });
      await batch.commit();

      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, uid }, 'ban_user_failed');
      return reply.code(500).send({ error: 'ban_failed' });
    }
  };

  app.post('/admin/users/:uid/ban', { preHandler: [requireRole('admin')] }, banUserHandler);
  app.post('/api/admin/users/:uid/ban', { preHandler: [requireRole('admin')] }, banUserHandler);

  const unbanUserHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as any;
    if (!uid) return reply.code(400).send({ error: 'missing_uid' });

    try {
      // Enable user in Auth
      await getAuth().updateUser(uid, { disabled: false });

      // Restore quarantined apps
      const appsSnap = await db.collection('apps')
        .where('ownerUid', '==', uid)
        .where('state', '==', 'quarantined')
        .get();

      const batch = db.batch();
      appsSnap.docs.forEach((doc) => {
        batch.update(doc.ref, { visibility: 'public', state: 'published' });
      });
      await batch.commit();

      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, uid }, 'unban_user_failed');
      return reply.code(500).send({ error: 'unban_failed' });
    }
  };

  app.post('/admin/users/:uid/unban', { preHandler: [requireRole('admin')] }, unbanUserHandler);
  app.post('/api/admin/users/:uid/unban', { preHandler: [requireRole('admin')] }, unbanUserHandler);

  const deleteAndBlacklistUserHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as any;
    if (!uid) return reply.code(400).send({ error: 'missing_uid' });

    try {
      const userRecord = await getAuth().getUser(uid);
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.data() || {};

      // Add to blacklist
      await db.collection('blacklist').add({
        uid,
        email: userRecord.email,
        ip: userData.ip || null, // Assuming we might store IP
        reason: 'Permanent ban via admin',
        createdAt: Date.now(),
        createdBy: req.authUser?.uid,
      });

      // Set apps to unlisted
      const appsSnap = await db.collection('apps').where('ownerUid', '==', uid).get();
      const batch = db.batch();
      appsSnap.docs.forEach((doc) => {
        batch.update(doc.ref, { visibility: 'unlisted', state: 'deleted' });
      });
      await batch.commit();

      // Delete user
      await getAuth().deleteUser(uid);
      await db.collection('users').doc(uid).delete();

      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, uid }, 'delete_blacklist_failed');
      return reply.code(500).send({ error: 'delete_blacklist_failed' });
    }
  };

  app.post('/admin/users/:uid/delete-blacklist', { preHandler: [requireRole('admin')] }, deleteAndBlacklistUserHandler);
  app.post('/api/admin/users/:uid/delete-blacklist', { preHandler: [requireRole('admin')] }, deleteAndBlacklistUserHandler);

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

  const setNoAdsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const paramsSchema = z.object({ uid: z.string().min(1) });
    const bodySchema = z.object({
      enabled: z.boolean(),
      expiresAt: z.string().optional(),
    });

    const paramsParsed = paramsSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid_params', details: paramsParsed.error.issues });
    }
    const bodyParsed = bodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: bodyParsed.error.issues });
    }

    const { uid } = paramsParsed.data;
    const { enabled, expiresAt } = bodyParsed.data;
    let expiresAtValue: string | undefined;
    if (expiresAt) {
      const ms = Date.parse(expiresAt);
      if (Number.isNaN(ms)) {
        return reply.code(400).send({ error: 'invalid_expires_at' });
      }
      expiresAtValue = new Date(ms).toISOString();
    }

    try {
      const entitlements = await listEntitlements(uid);
      const existing = entitlements.find((ent) => ent.feature === 'noAds');
      if (enabled) {
        if (existing?.id) {
          await updateEntitlement(uid, existing.id, {
            feature: 'noAds',
            active: true,
            data: expiresAtValue ? { ...(existing.data || {}), expiresAt: expiresAtValue } : existing.data,
          });
        } else {
          await createEntitlement(uid, {
            feature: 'noAds',
            data: expiresAtValue ? { expiresAt: expiresAtValue } : undefined,
          });
        }
      } else if (existing?.id) {
        await removeEntitlement(uid, existing.id);
      }
      return reply.send({ ok: true });
    } catch (error) {
      req.log.error({ error, uid }, 'admin_set_noads_failed');
      return reply.code(500).send({ error: 'internal_server_error' });
    }
  };

  app.post(
    '/admin/users/:uid/no-ads',
    { preHandler: [requireRole('admin')] },
    setNoAdsHandler,
  );
  app.post(
    '/api/admin/users/:uid/no-ads',
    { preHandler: [requireRole('admin')] },
    setNoAdsHandler,
  );

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
