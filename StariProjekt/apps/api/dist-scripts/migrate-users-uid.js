"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/db.ts
var admin = __toESM(require("firebase-admin"));
var import_firestore = require("firebase-admin/firestore");
var import_fs = __toESM(require("fs"));

// src/lib/versioning.ts
var ARCHIVE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;

// src/db.ts
function getFirebaseCredential() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fromEnv && import_fs.default.existsSync(fromEnv)) {
    const raw = JSON.parse(import_fs.default.readFileSync(fromEnv, "utf8"));
    const serviceAccount = {
      projectId: raw.project_id || raw.projectId,
      clientEmail: raw.client_email || raw.clientEmail,
      privateKey: (raw.private_key || raw.privateKey || "").replace(/\\n/g, "\n")
    };
    if (!serviceAccount.privateKey || !serviceAccount.clientEmail) {
      throw new Error("Invalid service account JSON: missing private_key or client_email");
    }
    return admin.credential.cert(serviceAccount);
  }
  const jsonDefaultPath = "/etc/thesara/creds/firebase-sa.json";
  if (import_fs.default.existsSync(jsonDefaultPath)) {
    return admin.credential.cert(jsonDefaultPath);
  }
  const pemDefaultPath = "/etc/thesara/creds/firebase-sa.pem";
  if (import_fs.default.existsSync(pemDefaultPath)) {
    return admin.credential.cert({
      projectId: "createx-e0ccc",
      clientEmail: "firebase-adminsdk-fbsvc@createx-e0ccc.iam.gserviceaccount.com",
      privateKey: import_fs.default.readFileSync(pemDefaultPath, "utf8")
    });
  }
  throw new Error("No Firebase credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or place firebase-sa.json/pem in /etc/thesara/creds/.");
}
if (!admin.apps.length) {
  admin.initializeApp({
    credential: getFirebaseCredential()
  });
}
var db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
var DEFAULT_COLLECTIONS = [
  "entitlements",
  "billing_events",
  "billing_events_unmapped",
  "subscriptions",
  "stripe_accounts",
  "stripe_customers",
  "stripe_events",
  "payments",
  "users",
  "creators"
];
var dbInitialization;
async function runDbInitialization() {
  await ensureCollections(DEFAULT_COLLECTIONS);
  await ensureAmirSerbicCreator();
}
function ensureDbInitialized() {
  if (!dbInitialization) {
    dbInitialization = runDbInitialization().catch((err) => {
      dbInitialization = void 0;
      throw err;
    });
  }
  return dbInitialization;
}
void ensureDbInitialized();
async function getExistingCollection(name) {
  const cols = await db.listCollections();
  const found = cols.find((c) => c.id === name);
  if (!found) {
    throw new Error(`Missing collection: ${name}`);
  }
  return db.collection(name);
}
async function ensureCollections(names) {
  const existing = await db.listCollections();
  const existingNames = new Set(existing.map((c) => c.id));
  for (const name of names) {
    if (!existingNames.has(name)) {
      await db.collection(name).doc("_init").set({ createdAt: import_firestore.Timestamp.now() });
      console.log(`Created collection '${name}'`);
    }
  }
}
var EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
async function ensureAmirSerbicCreator() {
  try {
    await ensureCollections(["creators"]);
    const col = await getExistingCollection("creators");
    const docRef = col.doc("amir.serbic");
    const data = {
      id: "amir.serbic",
      handle: "amir.serbic",
      displayName: "Amir Serbic",
      photoURL: "https://avatars.githubusercontent.com/u/583231?v=4",
      allAccessPrice: 0
    };
    const doc = await docRef.get();
    if (!doc.exists || doc.data()?.photoURL !== data.photoURL) {
      await docRef.set(data, { merge: true });
    }
  } catch {
  }
}

// scripts/migrate-users-uid.ts
async function migrateUsersToUid() {
  console.log("Starting user migration...");
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  if (snapshot.empty) {
    console.log("No users found in the collection. Nothing to do.");
    return;
  }
  const batch = db.batch();
  let migratedCount = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    const uid = data.uid;
    const currentId = doc.id;
    if (!uid || typeof uid !== "string") {
      console.warn(`Skipping document ${currentId}: 'uid' field is missing or invalid.`);
      return;
    }
    if (currentId === uid) {
      return;
    }
    console.log(`Preparing migration for user: ${currentId} -> ${uid}`);
    const newUserRef = usersRef.doc(uid);
    batch.set(newUserRef, data);
    batch.delete(doc.ref);
    migratedCount++;
  });
  if (migratedCount > 0) {
    console.log(`Committing batch of ${migratedCount} migrations...`);
    await batch.commit();
    console.log(`Successfully migrated ${migratedCount} user documents.`);
  } else {
    console.log("All user documents are already migrated.");
  }
}
migrateUsersToUid().then(() => {
  console.log("Migration script finished.");
  process.exit(0);
}).catch((error) => {
  console.error("An error occurred during migration:", error);
  process.exit(1);
});
