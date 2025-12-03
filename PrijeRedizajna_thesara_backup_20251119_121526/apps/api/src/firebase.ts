import * as admin from 'firebase-admin';
import { getConfig } from './config.js';
import path from 'node:path';
import fs from 'node:fs';

function getFirebaseInitOptions(): admin.AppOptions {
  const projectIdFromEnv =
    process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

  // When the Firestore emulator is enabled we don't need real credentials. Instead we only
  // provide a projectId so firebase-admin talks to the emulator endpoint. This lets local
  // development proceed without placing service account files on disk.
  if (process.env.FIREBASE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    return {
      projectId: projectIdFromEnv || 'thesara-local',
    };
  }

  const tried: string[] = [];
  const logSource = (label: string) => {
    console.info(`[firebase] Using credentials from ${label}`);
  };

  const buildFromRaw = (raw: any, label: string): admin.AppOptions => {
    const serviceAccount: admin.ServiceAccount = {
      projectId: raw.project_id || raw.projectId || projectIdFromEnv,
      clientEmail: raw.client_email || raw.clientEmail,
      privateKey: ((raw.private_key || raw.privateKey || '') as string).replace(/\\n/g, '\n'),
    };
    if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
      throw new Error('missing private_key or client_email');
    }
    logSource(label);
    return {
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.projectId || projectIdFromEnv,
    };
  };

  const tryServiceAccount = (value: string, label: string, parser: () => any) => {
    tried.push(label);
    try {
      const raw = parser();
      return buildFromRaw(raw, label);
    } catch (error: any) {
      console.warn(`[firebase] Failed to use ${label}: ${error?.message || error}`);
      return undefined;
    }
  };

  const fromBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (fromBase64) {
    const parsed = () =>
      JSON.parse(Buffer.from(fromBase64, 'base64').toString('utf8')) as Record<string, unknown>;
    const appOptions = tryServiceAccount(fromBase64, 'FIREBASE_SERVICE_ACCOUNT_BASE64', parsed);
    if (appOptions) return appOptions;
  }

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inlineJson) {
    const parsed = () => JSON.parse(inlineJson) as Record<string, unknown>;
    const appOptions = tryServiceAccount(inlineJson, 'FIREBASE_SERVICE_ACCOUNT', parsed);
    if (appOptions) return appOptions;
  }

  const credentialPaths = new Set<string>();
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credentialPaths.add(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }
  credentialPaths.add(path.resolve(process.cwd(), 'keys', 'firebase-sa.json'));

  const keysDir = path.resolve(process.cwd(), 'keys');
  if (fs.existsSync(keysDir)) {
    const firstJson =
      fs
        .readdirSync(keysDir)
        .find((file) => file.toLowerCase().endsWith('.json'));
    if (firstJson) {
      credentialPaths.add(path.resolve(keysDir, firstJson));
    }
  }
  credentialPaths.add('/etc/thesara/creds/firebase-sa.json');

  for (const candidate of credentialPaths) {
    const label = `file:${candidate}`;
    tried.push(label);
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, unknown>;
      return buildFromRaw(raw, label);
    } catch (error: any) {
      console.warn(`[firebase] Failed to read ${label}: ${error?.message || error}`);
    }
  }

  const pemCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PEM &&
      path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PEM),
    path.join(keysDir, 'firebase-sa.pem'),
    '/etc/thesara/creds/firebase-sa.pem',
  ].filter(Boolean) as string[];

  for (const pemPath of pemCandidates) {
    const label = `pem:${pemPath}`;
    tried.push(label);
    if (!fs.existsSync(pemPath)) continue;
    const clientEmail =
      process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL_ADDRESS;
    const projectId = projectIdFromEnv || process.env.FIREBASE_PROJECT_ID;
    if (!clientEmail || !projectId) {
      console.warn(
        `[firebase] Skipping ${label}: set FIREBASE_CLIENT_EMAIL and FIREBASE_PROJECT_ID to use PEM credentials.`, 
      );
      continue;
    }
    const privateKey = fs.readFileSync(pemPath, 'utf8');
    logSource(label);
    return {
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    };
  }

  throw new Error(
    `No Firebase credentials found. Tried: ${tried.join(
      ', ',
    )}. Set FIREBASE_SERVICE_ACCOUNT(_BASE64) or GOOGLE_APPLICATION_CREDENTIALS.`, 
  );
}

function initializeFirebase() {
  if (admin.apps.length) return;
  const options = getFirebaseInitOptions();
  try {
    admin.initializeApp(options);
  } catch (err) {
    console.error('[firebase] Failed to initialize:', err);
    throw err;
  }
}

initializeFirebase();

const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

export { firestore as db };
export default admin;