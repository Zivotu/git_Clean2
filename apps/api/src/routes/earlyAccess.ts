import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { readEarlyAccessSettings, writeEarlyAccessSettings } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const UpdateSchema = z
  .object({
    id: z.string().min(1),
    isActive: z.boolean(),
    startsAt: z.union([z.number(), z.string()]).optional(),
    durationDays: z.number().int().nonnegative().optional(),
    perUserDurationDays: z.number().int().nonnegative().optional(),
  })
  .strict();

export default async function earlyAccessRoutes(app: FastifyInstance) {
  const readHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
    const settings = await readEarlyAccessSettings();
    return reply.send({ settings });
  };

  app.get('/early-access', readHandler);
  app.get('/api/early-access', readHandler);

  const updateHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_payload', details: parsed.error.issues });
    }
    try {
      const updated = await writeEarlyAccessSettings({
        ...parsed.data,
        updatedBy: req.authUser?.uid ?? null,
      });
      return reply.send({ settings: updated });
    } catch (err) {
      req.log.error({ err }, 'early_access_update_failed');
      return reply.code(500).send({ error: 'early_access_update_failed' });
    }
  };

  app.post(
    '/api/admin/early-access',
    { preHandler: [requireRole('admin')] },
    updateHandler,
  );
}
