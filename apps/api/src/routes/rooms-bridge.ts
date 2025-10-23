import { FastifyPluginAsync } from 'fastify';

const roomsBridgeDeprecated: FastifyPluginAsync = async (app) => {
  const gone = {
    error: 'Deprecated',
    message: 'Use PATCH /api/storage instead.',
    docs: '/docs/API_STORAGE.md',
  };

  app.all('/rooms/bridge/*', async (_req, reply) => {
    reply.code(410).send(gone);
  });

  app.all('/rooms/v1/bridge/*', async (_req, reply) => {
    reply.code(410).send(gone);
  });
};

export default roomsBridgeDeprecated;