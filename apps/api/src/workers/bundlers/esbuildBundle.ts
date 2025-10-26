import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

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

  await build({
    entryPoints: [opts.entryFile],
    outfile: path.join(opts.outDir, 'app.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['es2020'],
    sourcemap: false,
    minify: true,
    jsx: 'automatic',
    jsxDev: false,
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
    },
    plugins: [aliasAtRoot('@/', opts.appRoot)],
    // Jedna datoteka, bez code-splittinga za jednostavnije posluživanje
    splitting: false,
    logLevel: 'info',
  });
}