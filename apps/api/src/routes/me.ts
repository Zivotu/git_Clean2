import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export default async function meRoutes(app: FastifyInstance) {
  // Minimalni entitlements za naslovnicu (gost/free)
  const ENTITLEMENTS_GUEST = {
    plan: 'free',
    features: ['play'],
    expiry: null,
  }

  app.get('/me/entitlements', async (_req: FastifyRequest, reply: FastifyReply) => {
    // U dev-u nemoj uvjetovati na JWT; vrati free plan
    return reply.code(200).send(ENTITLEMENTS_GUEST)
  })

  app.get('/me/subscribed-apps', async (_req: FastifyRequest, reply: FastifyReply) => {
    // Prazna lista je ok za dev/demo
    return reply.code(200).send({ apps: [] })
  })
}