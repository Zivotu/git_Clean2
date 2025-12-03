import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { writeApps, readApps, type AppRecord } from '../db.js';

export default async function testLinkRoutes(app: FastifyInstance) {
  app.post('/api/test-link-listing', async (req: FastifyRequest, reply: FastifyReply) => {
    const { listingId, buildId } = req.body as { listingId?: string; buildId?: string };
    
    if (!listingId || !buildId) {
      return reply.code(400).send({ error: 'Missing listingId or buildId' });
    }

    try {
      const apps = await readApps();
      const existing = apps.find((a) => a.id === listingId);
      
      if (existing) {
        // Update existing
        existing.buildId = buildId;
        existing.updatedAt = Date.now();
        await writeApps(apps);
        return reply.send({ success: true, action: 'updated', app: existing });
      } else {
        // Create new
        const newApp: AppRecord = {
          id: listingId,
          buildId: buildId,
          slug: listingId,
          title: `Test App ${listingId}`,
          description: 'Auto-generated test app',
          author: { uid: 'dev-user', handle: 'Test User' },
          visibility: 'public' as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any;
        apps.push(newApp);
        await writeApps(apps);
        return reply.send({ success: true, action: 'created', app: newApp });
      }
    } catch (err: any) {
      req.log.error({ err }, 'test_link_listing_error');
      return reply.code(500).send({ error: err.message });
    }
  });
}
