#!/usr/bin/env node
// Sync KV storage (local JSON files) to Firestore
// This fixes the split-brain problem where publish writes to KV but approve reads from Firestore

import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, '.env'), override: false });
dotenv.config({ path: join(__dirname, '.env.local'), override: true });

// Direct Firebase Admin setup
import admin from 'firebase-admin';

const serviceAccountPath = join(__dirname, '../../keys/createx-e0ccc-3510ddb20df0.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

(async () => {
  try {
    console.log('🔄 Syncing KV storage to Firestore...\n');
    
    const kvDir = join(__dirname, '../../storage/kv');
    const files = readdirSync(kvDir).filter(f => f.startsWith('listing-') && f.endsWith('.json'));
    
    console.log(`Found ${files.length} listing files in KV storage\n`);
    
    const batch = db.batch();
    let count = 0;
    
    for (const file of files) {
      const kvPath = join(kvDir, file);
      const kv = JSON.parse(readFileSync(kvPath, 'utf8'));
      
      const listingId = kv.id;
      console.log(`📦 Listing ${listingId}: ${kv.title || 'Untitled'}`);
      console.log(`   Status: ${kv.status}`);
      console.log(`   PendingBuildId: ${kv.pendingBuildId || 'NONE'}`);
      console.log(`   BuildId: ${kv.buildId || 'NONE'}`);
      
      // Check if build exists
      if (kv.pendingBuildId) {
        const buildPath = join(__dirname, `../../storage/bundles/builds/${kv.pendingBuildId}/build.json`);
        try {
          const build = JSON.parse(readFileSync(buildPath, 'utf8'));
          if (build.id !== kv.pendingBuildId) {
            console.log(`   ⚠️  WARNING: Build ID mismatch!`);
            console.log(`      KV has: ${kv.pendingBuildId}`);
            console.log(`      Build has: ${build.id}`);
          } else {
            console.log(`   ✅ Build verified`);
          }
        } catch {
          console.log(`   ❌ Build NOT found in storage`);
        }
      }
      
      // Prepare Firestore document
      const doc = {
        id: listingId,
        title: kv.title || 'Untitled',
        status: kv.status || 'draft',
        state: kv.status === 'published' ? 'active' : 'pending',
        authorUid: kv.authorUid || null,
        createdAt: kv.createdAt || Date.now(),
        updatedAt: kv.updatedAt || Date.now(),
        visibility: kv.status === 'published' ? 'public' : 'private',
      };
      
      // Add buildId fields
      if (kv.buildId) {
        doc.buildId = kv.buildId;
      }
      if (kv.pendingBuildId) {
        doc.pendingBuildId = kv.pendingBuildId;
      }
      
      // Add to batch
      const docRef = db.collection('apps').doc(listingId);
      batch.set(docRef, doc, { merge: true });
      count++;
      
      console.log(`   → Writing to Firestore (merge)\n`);
    }
    
    console.log(`\n📝 Committing batch write for ${count} documents...`);
    await batch.commit();
    
    console.log(`\n✅ SUCCESS! Synced ${count} listings to Firestore`);
    console.log('\nNext steps:');
    console.log('1. Refresh your app in browser');
    console.log('2. Check that listings load correctly');
    console.log('3. Test approve workflow');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  }
})();
