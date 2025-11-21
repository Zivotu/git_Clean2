
import 'dotenv/config';
import { db } from '../firebase';

async function findProblematicData() {
    console.log('Searching for problematic data...');

    // 1. Search Listings
    const listingsRef = db.collection('listings');
    const snapshot = await listingsRef.get();

    console.log(`Total listings found: ${snapshot.size}`);

    let found = false;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const author = data.author || {};
        const authorName = author.name || '';
        const authorHandle = author.handle || '';

        if (authorName.includes('John') || authorName.includes('Rilly') ||
            authorHandle.includes('John') ||
            JSON.stringify(data).includes("John O'Rilly")) {
            console.log('---------------------------------------------------');
            console.log(`FOUND SUSPICIOUS LISTING: ${doc.id}`);
            console.log(`Title: ${data.title}`);
            console.log(`Slug: ${data.slug}`);
            console.log('Full Data:', JSON.stringify(data, null, 2));
            found = true;
        }
    }

    if (!found) {
        console.log('No listings found with "John O\'Rilly" in the name or handle.');
    }

    // 2. Search Creators/Users
    console.log('\nSearching users/creators...');
    const usersRef = db.collection('users');
    const creatorsRef = db.collection('creators');

    const userSnap = await usersRef.get();
    for (const doc of userSnap.docs) {
        const data = doc.data();
        if (JSON.stringify(data).includes('John') && JSON.stringify(data).includes('Rilly')) {
            console.log(`FOUND SUSPICIOUS USER: ${doc.id}`);
            console.log(JSON.stringify(data, null, 2));
        }
    }

    const creatorSnap = await creatorsRef.get();
    for (const doc of creatorSnap.docs) {
        const data = doc.data();
        if (JSON.stringify(data).includes('John') && JSON.stringify(data).includes('Rilly')) {
            console.log(`FOUND SUSPICIOUS CREATOR: ${doc.id}`);
            console.log(JSON.stringify(data, null, 2));
        }
    }

    // 3. Search Apps
    console.log('\nSearching apps...');
    const appsRef = db.collection('apps');
    const appsSnap = await appsRef.get();
    console.log(`Total apps found: ${appsSnap.size}`);

    for (const doc of appsSnap.docs) {
        const data = doc.data();
        // Check by author ID found previously
        if (data.authorId === 'Ap45R9BSeBSDQX3WYxmRP6VdwQI2' ||
            (data.author && data.author.uid === 'Ap45R9BSeBSDQX3WYxmRP6VdwQI2')) {
            console.log(`FOUND APP BY AUTHOR ID: ${doc.id}`);
            console.log(`Title: ${data.title}`);
            console.log(`Name: ${data.name}`);
            console.log(`Slug: ${data.slug}`);
            console.log('Full Data:', JSON.stringify(data, null, 2));
        }
    }
}

findProblematicData().catch(console.error).finally(() => process.exit(0));
