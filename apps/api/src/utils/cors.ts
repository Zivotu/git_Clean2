export const ALLOWED_ORIGINS = new Set([
  'https://thesara.space',
  'https://apps.thesara.space',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function setCors(reply: any, origin?: string) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://thesara.space';
  reply.header('Access-Control-Allow-Origin', allow);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Authorization, If-Match, Content-Type, X-Thesara-App-Id, X-Thesara-Scope');
  reply.header('Access-Control-Expose-Headers', 'ETag, X-Storage-Backend');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Max-Age', '600');
}

export default setCors;
