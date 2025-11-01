
import { db } from '../src/db';

/**
 * This script migrates the 'users' collection in Firestore.
 * It changes documents to be identified by their 'uid' instead of their 'username'.
 *
 * How it works:
 * 1. It fetches all documents from the 'users' collection.
 * 2. For each document, it checks if the document ID is already a UID.
 * 3. If the ID is a username, it creates a new document with the UID as the ID.
 * 4. It copies the data to the new document.
 * 5. It deletes the old document (the one identified by the username).
 * 6. All operations are performed in a single batch write to ensure atomicity.
 */
async function migrateUsersToUid() {
  console.log('Starting user migration...');

  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log('No users found in the collection. Nothing to do.');
    return;
  }

  const batch = db.batch();
  let migratedCount = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    const uid = data.uid;
    const currentId = doc.id;

    // Basic validation
    if (!uid || typeof uid !== 'string') {
      console.warn(`Skipping document ${currentId}: 'uid' field is missing or invalid.`);
      return;
    }

    // If the document ID is already the UID, it's already migrated.
    if (currentId === uid) {
      return;
    }

    console.log(`Preparing migration for user: ${currentId} -> ${uid}`);

    // Reference to the new document location
    const newUserRef = usersRef.doc(uid);

    // Copy data to the new document
    batch.set(newUserRef, data);

    // Delete the old document
    batch.delete(doc.ref);

    migratedCount++;
  });

  if (migratedCount > 0) {
    console.log(`Committing batch of ${migratedCount} migrations...`);
    await batch.commit();
    console.log(`Successfully migrated ${migratedCount} user documents.`);
  } else {
    console.log('All user documents are already migrated.');
  }
}

migrateUsersToUid()
  .then(() => {
    console.log('Migration script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('An error occurred during migration:', error);
    process.exit(1);
  });
