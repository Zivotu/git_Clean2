import admin from 'firebase-admin/lib/index.js';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('./apps/api/keys/createx-e0ccc-702119a41ed8.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function checkApp() {
  try {
    const doc = await db.collection('apps').doc('203').get();
    if (!doc.exists) {
      console.log('App 203 does not exist in Firestore');
      return;
    }
    const data = doc.data();
    console.log('App 203 data:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\nbuildId:', data.buildId);
    console.log('pendingBuildId:', data.pendingBuildId);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

checkApp();
