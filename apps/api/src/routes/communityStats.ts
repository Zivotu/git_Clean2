import type { FastifyInstance } from 'fastify';
import { db, readApps } from '../db.js';

type CommunityStats = {
  publishedApps: number;
  membersCount: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { data: CommunityStats; expiresAt: number } | null = null;

async function fetchMembersCount(): Promise<number> {
  try {
    const snapshot = await db.collection('users').count().get();
    const count = snapshot.data().count;
    return typeof count === 'number' ? count : 0;
  } catch {
    const firstBatch = await db.collection('users').limit(1000).get();
    if (firstBatch.size < 1000) return firstBatch.size;
    // Fallback for environments that don't support count(): estimate via pagination.
    let total = firstBatch.size;
    let lastDoc = firstBatch.docs[firstBatch.docs.length - 1];
    let batchSize = firstBatch.size;
    while (batchSize === 1000 && lastDoc) {
      const nextSnap = await db.collection('users').startAfter(lastDoc).limit(1000).get();
      if (nextSnap.empty) break;
      batchSize = nextSnap.size;
      total += batchSize;
      lastDoc = nextSnap.docs[nextSnap.docs.length - 1];
    }
    return total;
  }
}

async function calculateStats(): Promise<CommunityStats> {
  const [apps, membersCount] = await Promise.all([
    readApps(['status', 'state', 'deletedAt']),
    fetchMembersCount(),
  ]);
  const publishedApps = apps.filter(
    (app) => !app?.deletedAt && (app?.status === 'published' || app?.state === 'active'),
  ).length;
  return { publishedApps, membersCount };
}

export default async function communityStatsRoutes(app: FastifyInstance) {
  const handler = async () => {
    const now = Date.now();
    if (!cached || cached.expiresAt < now) {
      const data = await calculateStats();
      cached = { data, expiresAt: now + CACHE_TTL_MS };
    }
    return cached.data;
  };

  app.get('/community/stats', handler);
  app.get('/api/community/stats', handler);
}
