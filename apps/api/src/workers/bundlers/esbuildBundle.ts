import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { cdnImportPlugin } from './cdnPlugin';

// Jednostavan alias plugin za '@/'
function aliasAtRoot(alias: string, rootDir: string) {
  return {
    name: 'alias-@-root',
    setup(pluginBuild: any) {
      pluginBuild.onResolve({ filter: /^@\// }, (args: any) => {
        const rel = args.path.replace(/^@\//, '');
        const p = path.join(rootDir, rel);
        return { path: p };
      });
    },
  };
}

export type BundleOptions = {
  entryFile: string;      // npr. apsolutna putanja do privremenog app entryja (trenutni app.js)
  outDir: string;         // npr.  .../builds/&lt;buildId&gt;/build
  appRoot: string;        // korijen korisničkog app-a (gdje '@/...' pokazuje)
};

export async function bundleApp(opts: BundleOptions) {
  fs.mkdirSync(opts.outDir, { recursive: true });

  // Support React and other external dependencies through CDN
  await build({
    entryPoints: [opts.entryFile],
    outfile: path.join(opts.outDir, 'app.js'),
    bundle: true,
    platform: 'browser',
      format: 'esm',
      target: ['es2020', 'chrome58', 'firefox57', 'safari11', 'edge16'],
    sourcemap: false,
    minify: true,
    jsx: 'automatic',
        format: 'iife',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    loader: {
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.svg': 'dataurl',
      '.gif': 'dataurl',
      '.webp': 'dataurl',
      '.css': 'css',
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.js': 'js',
      '.jsx': 'jsx',
      '.mjs': 'js',
      '.json': 'json',
    },
    plugins: [
      aliasAtRoot('@/', opts.appRoot),
      cdnImportPlugin({
        cacheDir: opts.outDir,
        rootDir: opts.appRoot,
        // Dozvoli sve UI komponente
        allowAny: true,
        // Dozvoli specifične pakete i njihove subpath-ove
        allow: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          'react/jsx-dev-runtime',
          'framer-motion',
          'recharts',
          'html-to-image',
          '@radix-ui/react-slider',
          '@radix-ui/react-label',
          '@radix-ui/react-dialog',
          '@radix-ui/react-alert-dialog',
          '@radix-ui/react-popover',
          '@radix-ui/react-select',
          '@radix-ui/react-separator',
          '@radix-ui/react-tabs',
          '@radix-ui/react-toast',
          '@radix-ui/react-tooltip',
          'class-variance-authority',
          'clsx',
          'cmdk',
          'lucide-react',
          'next-themes',
          'sonner',
          'tailwind-merge',
          'tailwindcss-animate',
          'vaul'
        ],
        // Pinaj verzije da osiguramo konzistentnost
        pin: {
          'react': '18.2.0',
          'react-dom': '18.2.0',
          'framer-motion': '11.0.3',
          'recharts': '2.12.0',
          'html-to-image': '1.11.11',
          '@radix-ui/react-slider': '1.1.2',
          '@radix-ui/react-label': '2.0.2',
          '@radix-ui/react-dialog': '1.0.5',
          '@radix-ui/react-alert-dialog': '1.0.5',
          '@radix-ui/react-popover': '1.0.7',
          '@radix-ui/react-select': '2.0.0',
          '@radix-ui/react-separator': '1.0.3',
          '@radix-ui/react-tabs': '1.0.4',
          '@radix-ui/react-toast': '1.1.5',
          '@radix-ui/react-tooltip': '1.0.7',
          'class-variance-authority': '0.7.0',
          'clsx': '2.1.0',
          'cmdk': '0.2.1',
          'lucide-react': '0.323.0',
          'next-themes': '0.2.1',
          'sonner': '1.4.0',
          'tailwind-merge': '2.2.1',
          'tailwindcss-animate': '1.0.7',
          'vaul': '0.9.0'
        }
      })
    ],
    // Jedna datoteka, bez code-splittinga za jednostavnije posluživanje
    splitting: false,
    logLevel: 'info',
  });
}