import type { Plugin } from 'esbuild';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

interface CDNPluginOptions {
  cacheDir: string;
  rootDir?: string;
  allowAny?: boolean;
}

// The versions map for external dependencies
const DEPENDENCY_VERSIONS = {
  'react': '18.2.0',
  'react-dom': '18.2.0',
  'react/jsx-runtime': '18.2.0',
  'react/jsx-dev-runtime': '18.2.0',
  'framer-motion': '10.16.4',
  'recharts': '2.9.1',
  'html-to-image': '1.11.11',
  'lucide-react': '0.292.0',
  '@radix-ui/react-label': '2.0.2',
  '@radix-ui/react-slider': '1.1.2',
  '@/components/ui/button': null, // local alias, will be handled separately
  '@/components/ui/input': null,  // local alias, will be handled separately 
  '@/components/ui/label': null,  // local alias, will be handled separately
  '@/components/ui/slider': null, // local alias, will be handled separately
  '@/components/ui/card': null    // local alias, will be handled separately
} as const;

const CDN_URL = 'https://esm.sh';

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function downloadFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location!, (res2) => {
          res2.on('data', (chunk) => chunks.push(chunk));
          res2.on('end', () => {
            if (res2.headers['content-encoding'] === 'gzip') {
              zlib.gunzip(Buffer.concat(chunks), (err, result) => {
                if (err) reject(err);
                else resolve(result.toString());
              });
            } else {
              resolve(Buffer.concat(chunks).toString());
            }
          });
        }).on('error', reject);
        return;
      }
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.headers['content-encoding'] === 'gzip') {
          zlib.gunzip(Buffer.concat(chunks), (err, result) => {
            if (err) reject(err);
            else resolve(result.toString());
          });
        } else {
          resolve(Buffer.concat(chunks).toString());
        }
      });
    }).on('error', reject);
  });
}

function getVersion(moduleName: keyof typeof DEPENDENCY_VERSIONS): string | null {
  return DEPENDENCY_VERSIONS[moduleName] || null;
}

export function cdnPlugin(options: CDNPluginOptions): Plugin {
  const { cacheDir, rootDir, allowAny = false } = options;
  const cdnCachePath = path.join(cacheDir, '.cdn-cache');

  if (!fs.existsSync(cdnCachePath)) {
    fs.mkdirSync(cdnCachePath, { recursive: true });
  }

  return {
    name: 'cdn-plugin',
    setup(build) {
      const resolveCache = new Map<string, string>();

      build.onResolve({ filter: /.*/ }, async (args) => {
        const moduleName = args.path as keyof typeof DEPENDENCY_VERSIONS;

        // Handle aliased imports starting with @/
        if (moduleName.startsWith('@/')) {
          if (rootDir) {
            const fullPath = path.join(rootDir, 'components', moduleName.slice(2));
            if (fs.existsSync(fullPath + '.tsx') || fs.existsSync(fullPath + '.ts')) {
              return { path: fullPath, external: false };
            }
          }
          return null; // Let esbuild handle it normally
        }

        const version = getVersion(moduleName);
        
        // If not in our version map and allowAny is false, let esbuild handle it
        if (!version && !allowAny) {
          return null;
        }

        // For bare specifiers not in our version map but allowAny is true
        const effectiveVersion = version || 'latest';
        let cdnUrl = `${CDN_URL}/${moduleName}@${effectiveVersion}`;

        // Special handling for React packages to ensure consistency
        if (moduleName.startsWith('react/')) {
          const reactVersion = DEPENDENCY_VERSIONS['react'];
          cdnUrl = `${CDN_URL}/${moduleName}@${reactVersion}`;
        } else if (typeof moduleName === 'string' && moduleName.startsWith('react-dom/')) {
          const reactDomVersion = DEPENDENCY_VERSIONS['react-dom'];
          const submodulePath = moduleName.replace('react-dom/', '');
          cdnUrl = `${CDN_URL}/react-dom@${reactDomVersion}/${submodulePath}`;
        }
        
        // Check cache first
        const cacheKey = sha256(`${moduleName}@${effectiveVersion}`);
        const moduleCachePath = path.join(cdnCachePath, `${cacheKey}.js`);
        
        if (resolveCache.has(cacheKey)) {
          return {
            path: resolveCache.get(cacheKey),
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
          console.error(`Failed to download ${moduleName}@${effectiveVersion}:`, error);
          if (allowAny) {
            // Let esbuild try to resolve it as a fallback
            return null;
          }
          throw error;
        }
      });
    }
  };
}