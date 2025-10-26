
import { FastifyInstance, FastifyRequest } from 'fastify';
import { sseEmitter, sendSse } from '../lib/sseEmitter';
import { prisma } from '../db';

export default async function (fastify: FastifyInstance) {
  fastify.get(
    '/build/:buildId/events',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            buildId: { type: 'string' },
          },
          required: ['buildId'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { buildId: string } }>, reply) => {
      const { buildId } = request.params;

      // Set headers for SSE
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      // CORS headers are likely handled globally, but we can set them here if needed

      // Immediately send the current status
      const build = await prisma.build.findUnique({ where: { id: buildId } });
      if (build) {
        sendSse(reply, 'status', { status: build.status, reason: build.reason });
      }

      const listener = (data: any) => {
        if (data.buildId === buildId) {
          sendSse(reply, data.event, data.payload);
          if (data.event === 'final') {
            reply.raw.end();
          }
        }
      };

      sseEmitter.on('build_event', listener);

      request.raw.on('close', () => {
        sseEmitter.off('build_event', listener);
      });
    }
  );
}
