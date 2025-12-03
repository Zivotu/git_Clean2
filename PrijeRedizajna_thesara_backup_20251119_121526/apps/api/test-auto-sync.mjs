#!/usr/bin/env node
/**
 * Test script to verify auto-sync functionality
 * Publishes a test mini-app and checks if pendingBuildId appears in both KV and Firestore
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../keys/createx-e0ccc-3510ddb20df0.json'), 'utf8')
);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function testAutoSync() {
  console.log('🧪 Testing auto-sync functionality...\n');

  // Step 1: Publish a test mini-app via API
  const testTitle = `AutoSync Test ${Date.now()}`;
  const publishUrl = 'http://localhost:8789/api/publish';
  
  console.log(`📤 Publishing test app: "${testTitle}"`);
  
  const formData = new FormData();
  formData.append('title', testTitle);
  
  // Create minimal test files
  const testHtml = '<html><body>Test</body></html>';
  const htmlBlob = new Blob([testHtml], { type: 'text/html' });
  formData.append('file', htmlBlob, 'index.html');
  
  const testMeta = JSON.stringify({ name: 'test', version: '1.0.0' });
  const metaBlob = new Blob([testMeta], { type: 'application/json' });
  formData.append('file', metaBlob, 'metadata.json');

  let publishResponse;
  try {
    publishResponse = await fetch(publishUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': 'Bearer test-token' // You may need to adjust this
      }
    });
    
    if (!publishResponse.ok) {
      console.error('❌ Publish failed:', publishResponse.status, publishResponse.statusText);
      const text = await publishResponse.text();
      console.error('Response:', text);
      return;
    }
    
    const publishData = await publishResponse.json();
    console.log('✅ Publish successful:', publishData);
    
    const { listingId, buildId } = publishData;
    
    if (!listingId || !buildId) {
      console.error('❌ Missing listingId or buildId in response');
      return;
    }
    
    console.log(`\n📋 Listing ID: ${listingId}`);
    console.log(`🔑 Build ID: ${buildId}\n`);
    
    // Step 2: Check KV storage
    const kvPath = path.join(__dirname, '../../storage/kv', `listing-${listingId}.json`);
    console.log(`🔍 Checking KV storage: ${kvPath}`);
    
    let kvData;
    try {
      kvData = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
      console.log('✅ Found in KV storage:');
      console.log(`   - Title: ${kvData.title}`);
      console.log(`   - PendingBuildId: ${kvData.pendingBuildId}`);
      console.log(`   - Status: ${kvData.status}`);
    } catch (err) {
      console.error('❌ Failed to read KV storage:', err.message);
      return;
    }
    
    // Step 3: Check Firestore
    console.log(`\n🔍 Checking Firestore...`);
    
    // Wait a bit for async Firestore write to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const docRef = db.collection('apps').doc(listingId);
      const docSnap = await docRef.get();
      
      if (!docSnap.exists) {
        console.error('❌ Document not found in Firestore!');
        console.log('\n⚠️  AUTO-SYNC FAILED: Data not synced to Firestore');
        return;
      }
      
      const firestoreData = docSnap.data();
      console.log('✅ Found in Firestore:');
      console.log(`   - Title: ${firestoreData.title}`);
      console.log(`   - PendingBuildId: ${firestoreData.pendingBuildId}`);
      console.log(`   - Status: ${firestoreData.status}`);
      
      // Step 4: Verify data matches
      console.log(`\n🔍 Verifying data consistency...`);
      
      const kvBuildId = kvData.pendingBuildId;
      const firestoreBuildId = firestoreData.pendingBuildId;
      
      if (kvBuildId === firestoreBuildId && kvBuildId === buildId) {
        console.log('✅ SUCCESS! pendingBuildId matches in both storages:');
        console.log(`   KV:        ${kvBuildId}`);
        console.log(`   Firestore: ${firestoreBuildId}`);
        console.log(`   Published: ${buildId}`);
        console.log('\n🎉 AUTO-SYNC IS WORKING CORRECTLY!');
      } else {
        console.log('❌ MISMATCH detected:');
        console.log(`   KV:        ${kvBuildId}`);
        console.log(`   Firestore: ${firestoreBuildId}`);
        console.log(`   Published: ${buildId}`);
        console.log('\n⚠️  AUTO-SYNC FAILED: Data mismatch');
      }
      
    } catch (err) {
      console.error('❌ Failed to read Firestore:', err.message);
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testAutoSync().catch(console.error);
