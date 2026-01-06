// Quick script to check app status
// Usage: node check-app-status.js <appSlug>

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, 'serviceAccountKey.json');

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
    });
} catch (err) {
    console.error('Firebase initialization failed:', err.message);
    process.exit(1);
}

const db = admin.firestore();

async function checkAppStatus(slug) {
    try {
        // Get all apps
        const appsSnapshot = await db.collection('apps').get();

        const app = appsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .find(a => a.slug === slug || a.id === slug);

        if (!app) {
            console.log(`❌ App not found: ${slug}`);
            return;
        }

        console.log('\n📱 App Status:');
        console.log('================');
        console.log(`ID: ${app.id}`);
        console.log(`Slug: ${app.slug}`);
        console.log(`Title: ${app.title}`);
        console.log(`Status: ${app.status}`);
        console.log(`State: ${app.state}`);
        console.log('\n🔧 Build IDs:');
        console.log('================');
        console.log(`buildId: ${app.buildId || 'NOT SET'}`);
        console.log(`pendingBuildId: ${app.pendingBuildId || 'NOT SET'}`);
        console.log(`pendingVersion: ${app.pendingVersion || 'NOT SET'}`);
        console.log('\n📊 Other Info:');
        console.log('================');
        console.log(`Version: ${app.version || 'NOT SET'}`);
        console.log(`Published At: ${app.publishedAt ? new Date(app.publishedAt).toISOString() : 'NOT SET'}`);
        console.log(`Updated At: ${app.updatedAt ? new Date(app.updatedAt).toISOString() : 'NOT SET'}`);

        if (app.moderation) {
            console.log('\n🛡️ Moderation:');
            console.log('================');
            console.log(`Status: ${app.moderation.status || 'NOT SET'}`);
            console.log(`At: ${app.moderation.at ? new Date(app.moderation.at).toISOString() : 'NOT SET'}`);
            console.log(`By: ${app.moderation.by || 'NOT SET'}`);
        }

    } catch (error) {
        console.error('Error checking app status:', error);
    } finally {
        process.exit(0);
    }
}

const slug = process.argv[2];
if (!slug) {
    console.error('Usage: node check-app-status.js <appSlug>');
    process.exit(1);
}

checkAppStatus(slug);
