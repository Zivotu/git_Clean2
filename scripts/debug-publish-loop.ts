
// scripts/debug-publish-loop.ts
import { db } from '../apps/api/src/firebase';
import { readApps, writeApps, getAppByIdOrSlug } from '../apps/api/src/db';
import { randomUUID } from 'node:crypto';

async function main() {
    console.log('=== DEBUG PUBLISH LOOP ===');

    // 1. Generate Dummy App
    const testId = 'DEBUG-' + randomUUID().split('-')[0];
    const testSlug = `debug-app-${Date.now()}`;
    console.log(`[1] Creating test app: ID=${testId}, Slug=${testSlug}`);

    const dummyApp: any = {
        id: testId,
        slug: testSlug,
        title: 'Debug Publish App',
        description: 'Created by debug script',
        status: 'pending-review',
        state: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        likesCount: 0,
        playsCount: 0,
        // Minimum valid fields
        author: { uid: 'DEBUG_USER' }
    };

    // 2. Write (Simulate Publish)
    console.log('[2] Writing to Firestore (writeApps)...');
    try {
        // We fetch existing apps first because writeApps overwrites the whole collection typically? 
        // Wait, let's check writeApps implementation...
        // appsSnap.docs.forEach((d: any) => batch.delete(d.ref)); -> WOW. 
        // writeApps DELETES EVERYTHING? Let's check db.ts again.

        // Actually, looking at db.ts:
        // export async function writeApps(items: App[]): Promise<void> {
        //   const appsSnap = await appsCol.get();
        //   ... batch.delete(d.ref) ...
        //   items.forEach(...)

        // THIS IS DESTRUCTIVE if not careful. But "publishRoutes" does:
        // const apps = await readApps();
        // apps.push(next);
        // await writeApps(apps);

        // So it reads ALL, adds one, then writes ALL back (deleting old refs first).
        // This is inefficient but "safe" if readApps works.

        const currentApps = await readApps();
        console.log(`[2a] Read ${currentApps.length} existing apps.`);

        const newAppsList = [...currentApps, dummyApp];
        await writeApps(newAppsList); // simulating exactly what publish.ts does
        console.log('[2b] writeApps completed.');
    } catch (err) {
        console.error('[2] WRITE FAILED:', err);
        return;
    }

    // 3. Read Verification (Immediate)
    console.log('[3] verifying read back...');
    try {
        const freshApps = await readApps();
        const found = freshApps.find(a => a.id === testId);
        if (found) {
            console.log(`[SUCCESS] Found app ${testId} in list.`);
        } else {
            console.error(`[FAILURE] App ${testId} NOT found in list after write!`);
            console.log('Apps found:', freshApps.map(a => a.id));
        }

        // 4. Verify slug lookup (API route logic)
        const bySlug = await getAppByIdOrSlug(testSlug);
        if (bySlug) {
            console.log(`[SUCCESS] getAppByIdOrSlug('${testSlug}') returned app.`);
        } else {
            console.error(`[FAILURE] getAppByIdOrSlug('${testSlug}') returned UNDEFINED.`);
        }

        // Cleanup
        console.log('[4] Cleaning up debug app...');
        const appsToKeep = freshApps.filter(a => a.id !== testId);
        await writeApps(appsToKeep);
        console.log('[4] Cleanup done.');

    } catch (err) {
        console.error('[3] READ FAILED:', err);
    }
}

main().catch(console.error);
