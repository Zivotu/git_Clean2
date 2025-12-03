import fs from 'node:fs';
import path from 'node:path';

const ROOMS_STORAGE_KEYS = [
  'liveblocks-auth',
  'liveblocks-storage',
  'liveblocks-who-is-here',
];

function listFiles(dir: string): string[] {
  const res: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) res.push(...listFiles(full));
    else res.push(full);
  }
  return res;
}

/**
 * Rooms storage detection stub.
 * F1 scope only needs a no-op export to satisfy SafePublish imports.
 */
export function detectRoomsStorageKeys(dir: string): string[] {
  const detectedKeys = new Set<string>();
  const files = listFiles(dir);
  const keyRegex = new RegExp(ROOMS_STORAGE_KEYS.join('|'), 'g');

  for (const file of files) {
    if (!/\.(js|jsx|ts|tsx|html)$/i.test(file)) {
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(keyRegex);
    if (matches) {
      for (const match of matches) {
        detectedKeys.add(match);
      }
    }
  }

  return Array.from(detectedKeys);
}