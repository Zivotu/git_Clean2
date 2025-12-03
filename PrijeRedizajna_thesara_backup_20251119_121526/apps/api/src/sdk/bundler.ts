import path from 'node:path';
import fs from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { publishingConfig } from '../config/publishing.js';

export async function injectSDKs(buildDir: string, appId: string): Promise<void> {
  // Create SDK initialization code
  const sdkInitCode = `
    // Thesara SDK Initialization
    import { ThesaraStorage } from './storage.js';
    import { ThesaraRooms } from './rooms.js';

    const APP_ID = '${appId}';
    const API_BASE = '${process.env.API_BASE || 'https://api.thesara.space'}';
    const STORAGE_BASE = '${process.env.STORAGE_BASE || 'https://storage.thesara.space'}';

    // Initialize SDKs
    export const storage = new ThesaraStorage(APP_ID, STORAGE_BASE);
    export const rooms = new ThesaraRooms(APP_ID, API_BASE);

    // Expose to window for easier access
    window.thesaraStorage = storage;
    window.thesaraRooms = rooms;
  `;

  // Write SDK initialization code
  await fs.writeFile(path.join(buildDir, 'sdk-init.js'), sdkInitCode);

  // Bundle storage SDK
  const storageResult = await esbuild.build({
    stdin: {
      contents: await fs.readFile(path.join(__dirname, 'storage.ts'), 'utf8'),
      loader: 'ts',
    },
    write: true,
    bundle: true,
    format: 'esm',
    outfile: path.join(buildDir, 'storage.js'),
    minify: true,
  });

  // Bundle rooms SDK
  const roomsResult = await esbuild.build({
    stdin: {
      contents: await fs.readFile(path.join(__dirname, 'rooms.ts'), 'utf8'),
      loader: 'ts',
    },
    write: true,
    bundle: true,
    format: 'esm',
    outfile: path.join(buildDir, 'rooms.js'),
    minify: true,
  });

  // Update the main app.js to import SDK initialization
  const appJsPath = path.join(buildDir, 'app.js');
  const appJsContent = await fs.readFile(appJsPath, 'utf8');
  
  const updatedAppJs = `
    // Import Thesara SDKs
    import './sdk-init.js';

    ${appJsContent}
  `;

  await fs.writeFile(appJsPath, updatedAppJs);

  // Update manifest to include SDK dependencies
  const manifestPath = path.join(buildDir, 'manifest_v1.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  
  manifest.dependencies = {
    ...(manifest.dependencies || {}),
    '@thesara/storage-sdk': '*',
    '@thesara/rooms-sdk': '*'
  };

  manifest.capabilities = {
    ...(manifest.capabilities || {}),
    storage: publishingConfig.STORAGE_ENABLED,
    rooms: publishingConfig.ROOMS_ENABLED,
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}