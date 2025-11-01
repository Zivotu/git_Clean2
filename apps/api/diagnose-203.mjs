// Quick diagnostic script to check and fix listing 203 buildId corruption
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read KV storage to get correct pendingBuildId
const kvPath = join(__dirname, '../../storage/kv/listing-203.json');
const kv = JSON.parse(readFileSync(kvPath, 'utf8'));

console.log('📋 KV Storage (source of truth for pending builds):');
console.log(`   id: ${kv.id}`);
console.log(`   pendingBuildId: ${kv.pendingBuildId}`);
console.log(`   status: ${kv.status}`);

// Read build.json to confirm build exists
const buildPath = join(__dirname, `../../storage/bundles/builds/${kv.pendingBuildId}/build.json`);
try {
  const build = JSON.parse(readFileSync(buildPath, 'utf8'));
  console.log('\n✅ Build exists in storage:');
  console.log(`   id: ${build.id}`);
  console.log(`   state: ${build.state}`);
  console.log(`   Match: ${build.id === kv.pendingBuildId ? '✅' : '❌'}`);
} catch (err) {
  console.log('\n❌ Build NOT found in storage!');
  console.log(`   Expected path: ${buildPath}`);
}

console.log('\n📝 SOLUTION:');
console.log('Since Firestore has corrupted buildId, you need to:');
console.log('1. Start API server: cd apps/api && pnpm run dev');
console.log('2. Call approve endpoint to re-sync with correct buildId:');
console.log(`   curl -X POST "http://localhost:8789/review/approve/${kv.pendingBuildId}" -H "Content-Type: application/json" -d "{}"`);
console.log('\nThis will read correct buildId from build.json and write it to Firestore.');
