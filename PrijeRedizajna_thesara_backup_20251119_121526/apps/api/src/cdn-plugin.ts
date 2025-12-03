import type { Plugin } from 'esbuild';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

interface CDNPluginOptions {
  dependencies: Record<string, string>;
  cachePath?: string;
}

const CDN_URL = 'https://esm.sh';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          zlib.gunzip(buffer, (err, result) => {
            if (err) reject(err);
            else resolve(result.toString());
          });
        } else {
          resolve(buffer.toString());
        }
      });
    }).on('error', reject);
  });
}

export function cdnPlugin(options: CDNPluginOptions): Plugin {
  const { dependencies, cachePath = '.cdn-cache' } = options;

  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }

  return {
    name: 'cdn-plugin',
    setup(build) {
      const resolveCache = new Map<string, string>();

      build.onResolve({ filter: /.*/ }, async (args) => {
        const moduleName = args.path;
        const [baseModule, ...subPath] = moduleName.split('/');

        // Skip if base module is not in our dependency list
        if (!dependencies[baseModule]) {
          return null;
        }

        // Handle aliased imports
        if (baseModule.startsWith('@/')) {
          const relativePath = moduleName.replace('@/', './src/');
          return {
            path: path.resolve(args.resolveDir, relativePath),
            external: true
          };
        }

        const version = dependencies[baseModule];
        const fullModulePath = subPath.length > 0 ? `${baseModule}/${subPath.join('/')}` : baseModule;
        const cdnUrl = `${CDN_URL}/${fullModulePath}@${version}`;
        
        // Check cache first
        const cacheKey = sha256(`${fullModulePath}@${version}`);
        const moduleCachePath = path.join(cachePath, `${cacheKey}.js`);
        
        if (resolveCache.has(cacheKey)) {
          const cachedPath = resolveCache.get(cacheKey)!;
          return {
            path: cachedPath,
            external: true
          };
        }
        
        if (fs.existsSync(moduleCachePath)) {
          resolveCache.set(cacheKey, moduleCachePath);
          return {
            path: moduleCachePath,
            external: true
          };
        }

        try {
          // Download from CDN
          const content = await downloadFile(cdnUrl);
          fs.writeFileSync(moduleCachePath, content);
          resolveCache.set(cacheKey, moduleCachePath);
          
          return {
            path: moduleCachePath,
            external: true
          };
        } catch (error) {
          console.error(`Failed to download ${moduleName}@${version}:`, error);
          throw error;
        }
      });
    }
  };
}