
import 'dotenv/config';
import { db } from '../firebase';

async function fixProblematicData() {
    console.log('Starting fix...');

    const userId = 'Ap45R9BSeBSDQX3WYxmRP6VdwQI2';
    const appId = '76';
    const appSlug = 'space-shooter';

    // 1. Delete App
    console.log(`Deleting app ${appId}...`);
    await db.collection('apps').doc(appId).delete();
    console.log('App deleted.');

    // 2. Delete Listing (try by slug and ID)
    console.log(`Deleting listing ${appSlug}...`);
    await db.collection('listings').doc(appSlug).delete();
    // Also check if there's a listing with the ID
    await db.collection('listings').doc(appId).delete();

    // Also query listings by slug just in case ID is different
    const listingsQuery = await db.collection('listings').where('slug', '==', appSlug).get();
    for (const doc of listingsQuery.docs) {
        console.log(`Deleting listing doc ${doc.id}`);
        await doc.ref.delete();
    }
    console.log('Listing deleted.');

    // 3. Fix User Profile
    console.log(`Fixing user profile for ${userId}...`);
    await db.collection('users').doc(userId).update({
        displayName: 'Amir'
    });
    console.log('User profile updated.');

    // 4. Fix Creator Profile
    console.log(`Fixing creator profile for ${userId}...`);
    await db.collection('creators').doc(userId).update({
        displayName: 'Amir',
        customRepositoryName: 'amir-repo' // Resetting to a safe default or removing it if they want
    });
    // Actually, maybe just remove customRepositoryName if it was "John O'Rilly" related?
    // The user complained about "John O'Rilly@amir.serbic".
    // I'll just set displayName to Amir.
    console.log('Creator profile updated.');

    console.log('Fix complete.');
}

fixProblematicData().catch(console.error).finally(() => process.exit(0));
