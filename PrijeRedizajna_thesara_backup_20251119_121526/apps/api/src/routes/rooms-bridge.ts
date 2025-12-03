import { FastifyPluginAsync } from 'fastify';

const roomsBridgeDeprecated: FastifyPluginAsync = async (app) => {
  const gone = {
    error: 'Deprecated',
    message: 'Use PATCH /api/storage instead.',
    docs: '/docs/API_STORAGE.md',
  };

  const deprecatedPaths = [
    '/rooms/bridge',
    '/rooms/bridge/*',
    '/rooms/v1/bridge',
    '/rooms/v1/bridge/*',
    '/rooms/autobridge',
    '/rooms/autobridge/*',
  ];

  for (const path of deprecatedPaths) {
    app.all(path, async (_req, reply) => {
      reply.code(410).send(gone);
    });
  }
};

export default roomsBridgeDeprecated;
