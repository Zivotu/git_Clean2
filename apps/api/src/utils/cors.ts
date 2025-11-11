import { ALLOWED_ORIGINS as CONFIG_ALLOWED_ORIGINS } from '../config.js';
import { DEFAULT_ALLOWED_ORIGINS } from '../constants/origins.js';

export const ALLOWED_ORIGINS = new Set(CONFIG_ALLOWED_ORIGINS);

const FALLBACK_ORIGIN = DEFAULT_ALLOWED_ORIGINS[0] ?? 'https://thesara.space';

export function setCors(reply: any, origin?: string | null) {
  let allow: string;
  if (origin === 'null') {
    allow = 'null';
  } else if (origin && ALLOWED_ORIGINS.has(origin)) {
    allow = origin;
  } else {
    allow = FALLBACK_ORIGIN;
  }
  reply.header('Access-Control-Allow-Origin', allow);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Authorization, If-Match, Content-Type, X-Thesara-App-Id, X-Thesara-Scope');
  reply.header('Access-Control-Expose-Headers', 'ETag, X-Storage-Backend');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Max-Age', '600');
}

export default setCors;
