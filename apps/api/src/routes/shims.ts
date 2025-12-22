import type { FastifyInstance } from 'fastify';
import { NAME_SHIM } from '../shims/nameShim.js';
import { ROOMS_CLIENT_SHIM } from '../shims/roomsClient.js';
import { STORAGE_CLIENT_SHIM } from '../shims/storageClient.js';
import { LOCALSTORAGE_BRIDGE_SHIM } from '../shims/localStorageBridge.js';

export default async function shims(app: FastifyInstance) {

  app.get('/shims/name.js', async (_req, reply) => {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.type('application/javascript').send(NAME_SHIM);
  });

  // Browser ESM client for platform rooms API

  app.get('/shims/rooms.js', async (_req, reply) => {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.type('application/javascript').send(ROOMS_CLIENT_SHIM);
  });

  // Storage bridge: postMessage → /api/storage proxy
  app.get('/shims/storage.js', async (_req, reply) => {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.type('application/javascript').send(STORAGE_CLIENT_SHIM);
  });

  // LocalStorage bridge used by Play iframe apps (parent <-> iframe batching)
  app.get('/shims/localstorage.js', async (_req, reply) => {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=3600');
    reply.type('application/javascript').send(LOCALSTORAGE_BRIDGE_SHIM);
  });

  // Alias for legacy loader compatibility
  app.get('/shim.js', async (_req, reply) => {
    return reply.code(307).header('Location', '/shims/rooms.js').send();
  });
}
