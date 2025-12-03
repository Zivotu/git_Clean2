import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import * as esbuild from 'esbuild';
import { getBuildDir } from '../paths.js'; // getBuildDir je već bio importan, ali se nije koristio
import { writeArtifact } from '../utils/artifacts.js';
import { zipDirectoryToBuffer } from '../utils/zip.js';

interface PublishResult {
  ok: boolean;
  error?: string;
  buildId: string;
  artifacts: {
    manifestPath: string;
    bundlePath: string;
  };
}

export class EnhancedPublishPipeline {
  private log: Console;

  constructor(logger = console) {
    this.log = logger;
  }

  async processPublish(code: string, options: {
    title?: string;
    description?: string;
    storage?: boolean;
    rooms?: boolean;
  }): Promise<PublishResult> {
    const buildId = randomUUID();
    const dir = getBuildDir(buildId); // Ispravljeno da koristi ispravan helper
    
    try {
      await fs.mkdir(dir, { recursive: true });

      // Transform code
      const transformResult = await this.transformCode(code);
      if (!transformResult.ok) {
        return { ok: false, error: transformResult.error, buildId, artifacts: { manifestPath: '', bundlePath: '' } };
      }

      // Write files
      await this.writeFiles(dir, transformResult.html!, transformResult.js!);

      // Generate manifest with storage/rooms support
      const manifest = {
        id: buildId,
        entry: 'app.js',
        name: options.title || 'Untitled App',
        description: options.description || '',
        version: '1.0.0',
        capabilities: {
          storage: options.storage !== false, // Enable by default
          rooms: options.rooms !== false, // Enable by default
          network: {
            allowedDomains: [
              'api.thesara.space',
              'storage.thesara.space'
            ]
          }
        }
      };

      const manifestPath = path.join(dir, 'build', 'manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Create bundle
      const bundlePath = path.join(dir, 'build.zip'); // Zip datoteka ide u korijen buildId direktorija
      const zipBuffer = await zipDirectoryToBuffer(path.join(dir, 'build')); // Zippamo SAMO 'build' poddirektorij
      await fs.writeFile(bundlePath, zipBuffer);

      // Save artifacts
      await writeArtifact(buildId, 'manifest.json', JSON.stringify(manifest, null, 2));
      await writeArtifact(buildId, 'bundle.zip', zipBuffer);

      return {
        ok: true,
        buildId,
        artifacts: {
          manifestPath: 'build/manifest.json',
          bundlePath: 'build.zip'
        }
      };

    } catch (err) {
      this.log.error({ err, buildId }, 'publish:pipeline_failed');
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        buildId,
        artifacts: {
          manifestPath: '',
          bundlePath: ''
        }
      };
    }
  }

  private async transformCode(code: string) {
    const isHtml = code.trim().toLowerCase().startsWith('<!doctype html');
    
    if (isHtml) {
      return {
        ok: true,
        html: code,
        js: ''
      };
    }

    try {
      const result = await esbuild.transform(code, {
        loader: 'tsx',
        format: 'esm',
        jsx: 'automatic',
        jsxDev: process.env.NODE_ENV !== 'production',
        define: {
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
        },
        banner: `
          // Thesara Storage & Rooms API Integration
          import { initStorage } from '@thesara/storage-sdk';
          import { initRooms } from '@thesara/rooms-sdk';
          
          const storage = initStorage();
          const rooms = initRooms();
          
          window.thesaraStorage = storage;
          window.thesaraRooms = rooms;
        `
      });

      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            html, body { margin: 0; padding: 0; }
            body { overflow-x: hidden; }
            #root { min-height: 100vh; }
          </style>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="./build/app.js"></script>
        </body>
        </html>
      `;

      return {
        ok: true,
        html,
        js: result.code
      };

    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Transform failed'
      };
    }
  }

  private async writeFiles(dir: string, html: string, js: string) {
    const buildDir = path.join(dir, 'build');
    await fs.mkdir(buildDir, { recursive: true });

    await fs.writeFile(path.join(buildDir, 'index.html'), html);
    await fs.writeFile(path.join(buildDir, 'app.js'), js);

    // Build artefakti su sada isključivo unutar 'build' poddirektorija.
    // Nema potrebe za kopijama u korijenu.
  }
}