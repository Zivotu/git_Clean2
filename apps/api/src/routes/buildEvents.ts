import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { sseEmitter } from '../sse.js';

type Params = { buildId: string };

const ROUTE_SCHEMA = {
  schema: {
    params: {
      type: 'object',
      properties: {
        buildId: { type: 'string' },
      },
      required: ['buildId'],
    },
  },
} as const;

async function handler(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) {
  const { buildId } = request.params;
  const { raw } = reply;

  reply.hijack();

  // CORS for SSE when using hijack(): Fastify CORS is bypassed, so set headers manually
  const origin = request.headers.origin;
  if (origin) {
    // Note: The main CORS plugin in index.ts should handle validation.
    // We reflect the origin here because hijack() bypasses some framework hooks.
    raw.setHeader('Access-Control-Allow-Origin', origin);
    raw.setHeader('Vary', 'Origin'); // Important for caching proxies
  }
  raw.setHeader('Access-Control-Allow-Credentials', 'true');

  raw.setHeader('Access-Control-Expose-Headers', 'ETag, X-Storage-Backend');

  raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  raw.setHeader('Cache-Control', 'no-cache, no-transform');
  raw.setHeader('Connection', 'keep-alive');
  raw.setHeader('X-Accel-Buffering', 'no');

  request.raw.socket?.setTimeout?.(0);
  request.raw.socket?.setKeepAlive?.(true);

  const safeWrite = (chunk: string) => {
    try {
      raw.write(chunk);
    } catch (error) {
      request.log.debug({ err: error, buildId }, 'sse_write_failed');
    }
  };

  let eventIdCounter = 0;

  const send = (event: string, data: unknown) => {
    try {
      eventIdCounter += 1;
      safeWrite(`id: ${eventIdCounter}\n`);
      safeWrite(`event: ${event}\n`);

      const payload = typeof data === 'string' ? data : JSON.stringify(data ?? null);
      // Per SSE spec, multi-line data must have "data: " prefix on each line
      const lines = payload.split(/\r?\n/);
      for (const line of lines) safeWrite(`data: ${line}\n`);

      safeWrite('\n');
    } catch (error) {
      request.log.debug({ err: error, buildId, event }, 'sse_send_failed');
    }
  };

  // Initial empty comment to flush headers and confirm connection
  safeWrite(':\n\n');

  const HEARTBEAT_MS = 15000;
  const heartbeat = setInterval(() => {
    safeWrite(':\n\n'); // proxy keep-alive komentar
    send('ping', { ts: Date.now(), buildId });
  }, HEARTBEAT_MS);

  const lastEventIdHeader = request.headers['last-event-id'];
  const lastEventIdQuery = (request.query as any)?.lastEventId; if (lastEventIdHeader || lastEventIdQuery) {
    request.log.debug(
      { buildId, lastEventIdHeader, lastEventIdQuery },
      'sse_resume_requested',
    );
  }

  try {
    const build = await prisma.build.findUnique({ where: { id: buildId } });
    if (build) send('status', { buildId, status: build.status, reason: build.reason ?? null });
    else send('status', { buildId, status: 'unknown', reason: 'build_not_found' });
  } catch (error) {
    request.log.error({ err: error, buildId }, 'sse_build_lookup_failed');
    send('status', { status: 'unknown', reason: 'lookup_failed' });
  }

  const listener = (evt: any) => {
    if (!evt || evt.buildId !== buildId) {
      return;
    }

    const eventName = evt.event ?? 'status';
    const payload = evt.payload ?? { status: evt.status, reason: evt.reason ?? null };

    const finalPayload = { buildId, ...payload };

    send(eventName, finalPayload);
  };

  sseEmitter.on('build_event', listener);

  let cleaned = false;

  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    clearInterval(heartbeat);
    try {
      sseEmitter.off('build_event', listener);
    } catch (error) {
      request.log.debug({ err: error, buildId }, 'sse_cleanup_failed');
    }
  };

  request.raw.on('close', cleanup);
  raw.on('close', cleanup);
  request.raw.on('end', cleanup);
}

export default async function registerBuildEvents(fastify: FastifyInstance) {
  fastify.get('/build/:buildId/events', ROUTE_SCHEMA, handler);
  fastify.get('/api/build/:buildId/events', ROUTE_SCHEMA, handler);
}