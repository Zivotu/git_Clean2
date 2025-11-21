
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./service-account.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function findProblematicData() {
    console.log('Searching for problematic data...');

    // 1. Search Listings
    const listingsRef = db.collection('listings');
    // Try searching by author name roughly
    const snapshot = await listingsRef.get();

    console.log(`Total listings found: ${snapshot.size}`);

    let found = false;
    snapshot.forEach(doc => {
        const data = doc.data();
        const author = data.author || {};
        const authorName = author.name || '';
        const authorHandle = author.handle || '';
        const authorEmail = author.email || ''; // If exists

        if (authorName.includes('John') || authorName.includes('Rilly') ||
            authorHandle.includes('John') ||
            JSON.stringify(data).includes('John O\'Rilly')) {
            console.log('---------------------------------------------------');
            console.log(`FOUND SUSPICIOUS LISTING: ${doc.id}`);
            console.log(`Title: ${data.title}`);
            console.log(`Slug: ${data.slug}`);
            console.log(`Author Name: ${authorName}`);
            console.log(`Author Handle: ${authorHandle}`);
            console.log(`Author UID: ${author.uid}`);
            console.log('Full Data:', JSON.stringify(data, null, 2));
            found = true;
        }
    });

    if (!found) {
        console.log('No listings found with "John O\'Rilly" in the name or handle.');
    }

    // 2. Search Creators/Users
    console.log('\nSearching users/creators...');
    const usersRef = db.collection('users');
    const creatorsRef = db.collection('creators');

    const userSnap = await usersRef.get();
    userSnap.forEach(doc => {
        const data = doc.data();
        if (JSON.stringify(data).includes('John') && JSON.stringify(data).includes('Rilly')) {
            console.log(`FOUND SUSPICIOUS USER: ${doc.id}`);
            console.log(JSON.stringify(data, null, 2));
        }
    });

    const creatorSnap = await creatorsRef.get();
    creatorSnap.forEach(doc => {
        const data = doc.data();
        if (JSON.stringify(data).includes('John') && JSON.stringify(data).includes('Rilly')) {
            console.log(`FOUND SUSPICIOUS CREATOR: ${doc.id}`);
            console.log(JSON.stringify(data, null, 2));
        }
    });
}

findProblematicData().catch(console.error);
