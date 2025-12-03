#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: false });
dotenv.config({ path: '.env.local', override: true });

// Import readApps function
import('../src/db.js').then(async (db) => {
  try {
    console.log('Čitam apps iz Firestore...');
    const apps = await db.readApps(['id', 'buildId', 'pendingBuildId', 'slug', 'title']);
    console.log(`Pronađeno ${apps.length} apps dokumenata:`);
    apps.forEach((app) => {
      console.log({
        id: app.id,
        buildId: app.buildId,
        pendingBuildId: app.pendingBuildId,
        slug: app.slug,
        title: app.title,
      });
    });
    if (apps.length === 0) {
      console.log('\n⚠️ Firestore apps kolekcija je PRAZNA - zato build alias vraća 404.');
      console.log('Need to create app documents in Firestore linking listings to builds.');
    }
    process.exit(0);
  } catch (err) {
    console.error('Greška:', err);
    process.exit(1);
  }
});
