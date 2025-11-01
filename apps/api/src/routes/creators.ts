import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export default async function creatorsRoutes(app: FastifyInstance) {
  const byIdHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as { uid: string };

    // Minimalni shape koji naslovnica može prikazati
    const data = {
      id: uid,
      displayName: 'Dev User',
      username: 'devuser',
      avatarUrl: '/api/avatar/dev-user?url=https://lh3.googleusercontent.com/a/default-user',
      badges: [],
      stats: { apps: 1, followers: 0 },
    };
    return reply.code(200).send(data);
  };

  // Primary route
  app.route({ method: ['GET', 'HEAD'], url: '/creators/id/:uid', handler: byIdHandler });
  // Defensive alias when '/api' prefix stripping isn't applied by upstream proxy
  app.route({ method: ['GET', 'HEAD'], url: '/api/creators/id/:uid', handler: byIdHandler });
}