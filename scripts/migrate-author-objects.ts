/**
 * Migration script to add author object to existing apps that only have authorUid
 * 
 * This fixes the issue where apps published by non-admin users weren't visible
 * in "My Projects" because the filter logic expects author.uid but only authorUid
 * was stored in Firestore.
 * 
 * Run with: node scripts/migrate-author-objects.js
 */

import { readApps, writeApps, db } from '../apps/api/src/db.js';

async function migrateAuthorObjects() {
    console.log('[Migration] Starting author object migration...');

    const apps = await readApps();
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const app of apps) {
        try {
            // Skip if app already has author object with uid
            if (app.author?.uid) {
                skippedCount++;
                continue;
            }

            // Check if app has authorUid but no author object
            const authorUid = (app as any).authorUid;
            if (!authorUid) {
                skippedCount++;
                continue;
            }

            console.log(`[Migration] Processing app ${app.id} (${app.title}) - authorUid: ${authorUid}`);

            // Try to fetch user data from Firestore
            let author: { uid: string; name?: string; photo?: string; handle?: string } = {
                uid: authorUid,
            };

            try {
                const userDoc = await db.collection('users').doc(authorUid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data() as any;
                    if (userData.displayName) author.name = userData.displayName;
                    if (userData.photoURL || userData.photo) author.photo = userData.photoURL || userData.photo;
                    if (userData.handle || userData.username) author.handle = userData.handle || userData.username;
                }
            } catch (err) {
                console.warn(`[Migration] Failed to fetch user data for ${authorUid}:`, err);
            }

            // Update the app with author object
            (app as any).author = author;
            migratedCount++;
            console.log(`[Migration] ✅ Migrated app ${app.id} - author:`, author);
        } catch (err) {
            errorCount++;
            console.error(`[Migration] ❌ Error processing app ${app.id}:`, err);
        }
    }

    // Save all apps back to Firestore
    if (migratedCount > 0) {
        console.log(`[Migration] Saving ${migratedCount} migrated apps to Firestore...`);
        await writeApps(apps);
        console.log('[Migration] ✅ All apps saved successfully');
    }

    console.log('\n[Migration] Summary:');
    console.log(`  - Migrated: ${migratedCount}`);
    console.log(`  - Skipped: ${skippedCount}`);
    console.log(`  - Errors: ${errorCount}`);
    console.log(`  - Total: ${apps.length}`);
}

// Run migration
migrateAuthorObjects()
    .then(() => {
        console.log('\n[Migration] ✅ Migration completed successfully');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n[Migration] ❌ Migration failed:', err);
        process.exit(1);
    });
