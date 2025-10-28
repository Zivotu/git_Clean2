import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export default async function creatorsRoutes(app: FastifyInstance) {
  app.get('/creators/id/:uid', async (req: FastifyRequest, reply: FastifyReply) => {
    const { uid } = req.params as { uid: string }

    if (uid === 'dev-user') {
      // Minimalni shape koji naslovnica može prikazati
      const data = {
        id: 'dev-user',
        displayName: 'Dev User',
        username: 'devuser',
        avatarUrl: '/api/avatar/dev-user?url=https://lh3.googleusercontent.com/a/default-user',
        badges: [],
        stats: { apps: 1, followers: 0 },
      }
      return reply.code(200).send(data)
    }

    return reply.code(404).send({ error: 'not_found' })
  })
}