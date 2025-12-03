import { readApps, writeApps, AppRecord } from '../src/db';
import { getConfig } from '../src/config';
import { getBucket } from '../src/storage';
import path from 'node:path';
import fs from 'node:fs/promises';

async function forceDeleteApp(app: AppRecord) {
  const cfg = getConfig();
  const buildId = app.buildId;
  // Remove build artifacts
  if (buildId) {
    try {
      const dir = path.join(cfg.BUNDLE_STORAGE_PATH, 'builds', buildId);
      await fs.rm(dir, { recursive: true, force: true });
      const bucket = getBucket();
      await bucket.deleteFiles({ prefix: `builds/${buildId}/` });
    } catch (err) {
      console.error('Cleanup failed for buildId', buildId, err);
    }
  }
  // Remove app record (handled in main)
  return app.id;
}

async function main() {
  const apps = await readApps();
  // Filter published mini-apps
  const toDelete = apps.filter(app =>
    (app.status === 'published' || app.state === 'active') && app.visibility === 'public'
  );
  if (!toDelete.length) {
    console.log('No published mini-apps found.');
    return;
  }
  console.log('Deleting', toDelete.length, 'published mini-apps...');
  // Remove each app
  const remainingApps = apps.filter(app => !toDelete.some(del => del.id === app.id));
  for (const app of toDelete) {
    await forceDeleteApp(app);
    console.log('Deleted app:', app.id, app.title);
  }
  // Overwrite apps DB
  await writeApps(remainingApps);
  console.log('All published mini-apps deleted.');
}

main().catch(err => {
  console.error('Error deleting published mini-apps:', err);
  process.exit(1);
});
