#!/usr/bin/env node
/**
 * Kreira testni Firestore dokument u 'apps' kolekciji za linking listing → build
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: false });
dotenv.config({ path: '.env.local', override: true });

import admin from 'firebase-admin';
import fs from 'node:fs';

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
  console.error('❌ GOOGLE_APPLICATION_CREDENTIALS nije postavljen ili fajl ne postoji.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || 'createx-e0ccc',
  databaseAuthVariableOverride: {
    uid: 'admin-script',
    admin: true,
  },
});

const db = admin.firestore();

async function main() {
  const listingId = 'asdf'; // iz listings.json
  const buildId = '00401757-fe2f-4d6c-9d55-ea41cc78dfe2'; // iz storage/bundles/builds/
  
  console.log(`Kreiram Firestore dokument u 'apps/${listingId}' s buildId = ${buildId}`);
  
  const appDoc = {
    id: listingId,
    buildId: buildId,
    slug: listingId,
    title: 'Grafikoni',
    description: 'Test app za pie chart',
    author: { uid: 'dev-user', handle: 'Amir' },
    visibility: 'public',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.collection('apps').doc(listingId).set(appDoc, { merge: true });
  console.log('✅ Dokument kreiran. Testiranje build alias URL-a...');
  console.log('   http://127.0.0.1:8789/asdf/build/index.html');
  console.log('   http://localhost:3000/play/asdf');
  
  // Pročitaj za potvrdu
  const snapshot = await db.collection('apps').doc(listingId).get();
  if (snapshot.exists) {
    console.log('Dokument u Firestore:', snapshot.data());
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error('Greška:', err);
  process.exit(1);
});
