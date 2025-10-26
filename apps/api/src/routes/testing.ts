
import { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createJob } from '../buildQueue.js';
import { getBuildDir } from '../paths.js';
import { prisma } from '../db.js';
import { writeApps, readApps } from '../db.js';

// This plugin should only be registered in a test environment
export default async function (fastify: FastifyInstance) {
  if (process.env.NODE_ENV !== 'test') {
    fastify.log.warn('Test routes should not be enabled in production');
    return;
  }

  fastify.post(
    '/testing/create-legacy-build',
    async (request: FastifyRequest<{ Body: { inlineCode: string } }>, reply) => {
      const { inlineCode } = request.body;
      const buildId = randomUUID();
      const listingId = `test-${randomUUID().slice(0, 8)}`;

      try {
        // 1. Create Build Record
        await prisma.build.create({
          data: {
            id: buildId,
            listingId: listingId,
            status: 'queued',
            mode: 'legacy',
          },
        });

        // 2. Create mock app files
        const buildDir = getBuildDir(buildId);
        const appDir = path.join(buildDir, 'build');
        await fs.mkdir(appDir, { recursive: true });
        await fs.writeFile(path.join(appDir, 'app.js'), inlineCode, 'utf8');

        // 3. Create legacy manifest
        const manifest = {
          id: buildId,
          entry: 'app.js',
          name: `Legacy Test App ${listingId}`,
        };
        await fs.writeFile(path.join(appDir, 'manifest_v1.json'), JSON.stringify(manifest), 'utf8');

        // 4. Create a dummy app record in the JSON db
        const apps = await readApps();
        apps.push({
            id: listingId,
            slug: listingId,
            title: manifest.name,
            buildId: buildId,
            status: 'published',
            state: 'active',
            playUrl: `/play/${listingId}/`,
            // ... other required fields
        } as any);
        await writeApps(apps);

        // 5. Mark build as successful
        await prisma.build.update({
            where: { id: buildId },
            data: { status: 'success' }
        });

        return reply.send({ listingId });

      } catch (err: any) {
        request.log.error(err, 'Failed to create legacy build for testing');
        return reply.code(500).send({ error: 'Failed to create legacy build', details: err.message });
      }
    }
  );
}
