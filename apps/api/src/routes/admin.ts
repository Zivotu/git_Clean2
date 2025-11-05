
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
}
