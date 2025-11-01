#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: false });
dotenv.config({ path: '.env.local', override: true });

// Delete app 203 from Firestore to force re-sync
import('./src/firebase.js').then(async ({ db }) => {
  try {
    console.log('Deleting app 203 from Firestore...');
    await db.collection('apps').doc('203').delete();
    console.log('✅ App 203 deleted. Now run approve to re-create with correct buildId.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
});
