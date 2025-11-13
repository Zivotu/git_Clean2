import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import * as esbuild from 'esbuild';
import { getBuildDir } from '../paths.js';
import { REDIS_URL } from '../config.js';
import { sseEmitter } from '../sse.js';
import { DEPENDENCY_VERSIONS } from '../lib/dependencies.js';
import { updateBuild, getBuildData } from '../models/Build.js';

const QUEUE_NAME = 'createx-build';

export type BuildWorkerHandle = { close: () => Promise<void> };

export class QueueDisabledError extends Error {
  code = 'QUEUE_DISABLED';
  constructor(message = 'Build queue is disabled') {
    super(message);
    this.name = 'QueueDisabledError';
  }
}

let queueConnection: ConnectionOptions | null = null;
let createxBuildQueue: Queue | null = null;

function createChildEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  delete env.NODE_OPTIONS;
  return env;
}

async function resolveRedisConnection(): Promise<ConnectionOptions | null> {
  if (REDIS_URL) {
    const url = new URL(REDIS_URL);
    return { host: url.hostname, port: Number(url.port) || 6379 };
  }
  const host = process.env.REDIS_HOST;
  if (host) {
    const port = Number(process.env.REDIS_PORT || 6379);
    return { host, port };
  }
  return null;
}

async function ensureQueue(): Promise<Queue | null> {
  if (!queueConnection) {
    queueConnection = await resolveRedisConnection();
  }
  if (!queueConnection) return null;
  if (!createxBuildQueue) {
    createxBuildQueue = new Queue(QUEUE_NAME, { connection: queueConnection as any });
  }
  return createxBuildQueue;
}

function queueDisabled(): QueueDisabledError {
  return new QueueDisabledError();
}

function createNoopHandle(): BuildWorkerHandle {
  return { close: async () => {} };
}

export async function enqueueCreatexBuild(buildId: string = randomUUID()): Promise<string> {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    throw queueDisabled();
  }
  const queue = await ensureQueue();
  if (!queue) {
    throw queueDisabled();
  }
  await queue.add('build', { buildId }, { removeOnComplete: true, removeOnFail: 1000 });
  return buildId;
}

async function runBuildProcess(buildId: string): Promise<void> {
  const baseDir = getBuildDir(buildId);
  const buildDir = path.join(baseDir, 'build');
  const entryPoint = path.join(buildDir, '_app_entry.tsx');
  const outFile = path.join(buildDir, 'app.js');

  console.log(`[worker] Starting build for ${buildId}...`);
  console.log(`[worker] Entry point: ${entryPoint}`);
  console.log(`[worker] Output file: ${outFile}`);

  // Check if entry file exists. If missing, create a minimal stub to avoid
  // failing the build due to a race where publish hasn't yet written the
  // generated `_app_entry.tsx` file. This keeps the worker robust in dev.
  try {
    await fs.access(entryPoint);
    console.log(`[worker] Entry file exists: ${entryPoint}`);
  } catch {
    console.warn(`[worker] Entry file NOT found: ${entryPoint} — creating minimal stub`);
    try {
      const stub = `export default function App(){ return null; }\n`;
      await fs.writeFile(entryPoint, stub, 'utf8');
      console.log(`[worker] Wrote stub entry file: ${entryPoint}`);
    } catch (err) {
      console.error(`[worker] Failed to write stub entry file: ${entryPoint}`, err);
      throw new Error(`Entry file not found and stub write failed: ${entryPoint}`);
    }
  }

  // Ensure package.json exists. It should be created earlier by ensureDependencies().
  // If missing, create a minimal one with React as a fallback.
  const pkgPath = path.join(buildDir, 'package.json');
  try {
    await fs.access(pkgPath);
    console.log(`[worker] Using existing package.json in ${buildDir}`);
  } catch {
    const minimalDeps: Record<string, string> = {
      react: DEPENDENCY_VERSIONS['react'],
      'react-dom': DEPENDENCY_VERSIONS['react-dom'],
    } as any;
    const packageJson = {
      name: `build-${buildId}`,
      private: true,
      version: '1.0.0',
      dependencies: minimalDeps,
    };
    await fs.writeFile(pkgPath, JSON.stringify(packageJson, null, 2), 'utf8');
    console.log(`[worker] Created minimal package.json in ${buildDir}`);
  }

  // Install npm dependencies in buildDir
  console.log(`[worker] Installing dependencies in ${buildDir}...`);
  const installEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    npm_config_production: 'false',
    YARN_PRODUCTION: 'false',
    pnpm_config_prod: 'false',
    BUN_INSTALL_DEV_DEPENDENCIES: '1',
  };

  await new Promise<void>((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    
    const npm = spawn('npm', ['install', '--no-audit', '--loglevel=error'], { 
      cwd: buildDir, // Install in buildDir where package.json is
      shell: true,
      windowsHide: true,
      env: createChildEnv(installEnv),
    });
    
    npm.stdout?.on('data', (data) => {
      output += data.toString();
    });
    
    npm.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    npm.on('close', (code) => {
      if (code === 0) {
        console.log(`[worker] npm install completed successfully`);
        if (output) console.log(`[worker] npm output:`, output.trim());
        resolve();
      } else {
        console.error(`[worker] npm install failed with code ${code}`);
        if (output) console.error(`[worker] npm stdout:`, output.trim());
        if (errorOutput) console.error(`[worker] npm stderr:`, errorOutput.trim());
        reject(new Error(`npm install failed with code ${code}: ${errorOutput || output}`));
      }
    });
    
    npm.on('error', (err) => {
      console.error(`[worker] npm process error:`, err);
      reject(err);
    });
  });

  // Helper to extract missing packages from esbuild error output
  const resolveMissing = (err: any): string[] => {
    const out = new Set<string>();
    const addSpec = (s: string) => {
      if (!s) return;
      if (s.startsWith('.') || s.startsWith('/') || s.startsWith('data:')) return;
      const base = s.split('/')[0];
      out.add(base);
    };
    try {
      const list = (err?.errors || []) as any[];
      for (const e of list) {
        const m = /Could not resolve\s+"([^"]+)"|Could not resolve\s+'([^']+)'/i.exec(e?.text || '');
        if (m) addSpec((m[1] || m[2] || '').trim());
      }
      const text = String(err?.message || '');
      const re = /Could not resolve\s+"([^"]+)"|Could not resolve\s+'([^']+)'/ig;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(text)) !== null) {
        addSpec((mm[1] || mm[2] || '').trim());
      }
    } catch {}
    return Array.from(out);
  };

  const buildOnce = async () => {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: outFile,
      format: 'iife',
      globalName: 'AppComponent',
      platform: 'browser',
      external: [],
      minify: true,
      treeShaking: true,
    });
  };

  try {
    await buildOnce();
    console.log(`[worker] esbuild completed successfully for ${buildId}`);
  } catch (err: any) {
    console.warn(`[worker] esbuild initial build failed, attempting dependency resolution...`);
    const missing = resolveMissing(err);
    const catalog = DEPENDENCY_VERSIONS as Record<string, string | null>;
    const toInstall = missing.filter((m) => catalog[m]);

    if (toInstall.length) {
      console.log(`[worker] Detected missing packages: ${toInstall.join(', ')}`);
      // Merge into package.json and install
      const pkgPath = path.join(buildDir, 'package.json');
      const pkgRaw = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgRaw);
      pkg.dependencies = pkg.dependencies || {};
      for (const name of toInstall) {
        pkg.dependencies[name] = catalog[name];
      }
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

      // Install only the newly added packages to be faster
      await new Promise<void>((resolve, reject) => {
        let output = '';
        let errorOutput = '';
        const args = ['install', '--no-audit', '--loglevel=error', ...toInstall.map((n) => `${n}@${catalog[n]}`)];
        const npm = spawn('npm', args, {
          cwd: buildDir,
          shell: true,
          windowsHide: true,
          env: createChildEnv(),
        });
        npm.stdout?.on('data', (d) => (output += d.toString()));
        npm.stderr?.on('data', (d) => (errorOutput += d.toString()));
        npm.on('close', (code) => {
          if (code === 0) return resolve();
          reject(new Error(`npm install ${toInstall.join(' ')} failed: ${errorOutput || output}`));
        });
        npm.on('error', reject);
      });

      // Retry build once
      await buildOnce();
      console.log(`[worker] esbuild completed successfully on retry for ${buildId}`);
    } else {
      console.error(`[worker] Missing packages not in allowlist or none detected. Failing build.`);
      throw err;
    }
  }
}

export function startCreatexBuildWorker(): BuildWorkerHandle {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    console.warn('[worker] CREATEX_WORKER_ENABLED is not "true" – build worker disabled');
    return createNoopHandle();
  }
  console.log('[worker] Starting createx build worker...');
  const startWorker = async () => {
    queueConnection = await resolveRedisConnection();
    console.log('[worker] Redis connection resolved:', queueConnection);
    if (!queueConnection) {
      console.warn('[worker] REDIS_URL missing – build worker disabled');
      return createNoopHandle();
    }
    const queue = await ensureQueue();
    if (!queue) {
      console.warn('[worker] Failed to initialise queue connection – build worker disabled');
      return createNoopHandle();
    }
    console.log(`[worker] Queue initialized. Listening on queue: ${QUEUE_NAME}`);
    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { buildId } = job.data as { buildId: string };
        console.log(`[worker] Processing build job: ${buildId}`);
        try {
          // keep frontend UX consistent: treat preparing as bundling
          sseEmitter.emit(buildId, 'status', { status: 'bundling' });
          // reflect state in filesystem model for admin
          try { await updateBuild(buildId, { state: 'build', progress: 20, error: undefined }); } catch {}

          await runBuildProcess(buildId);

          // update FS build state so it appears as pending review in admin
          try { await updateBuild(buildId, { state: 'pending_review', progress: 100 }); } catch {}

          // include listingId in final event for client redirect (from build-info.json)
          let listingId: string | null = null;
          try {
            const info = await getBuildData(buildId);
            listingId = (info?.listingId ? String(info.listingId) : null);
          } catch {}
          sseEmitter.emit(buildId, 'final', { status: 'success', buildId, listingId });

        } catch (err: any) {
          console.error('[worker] Build job failed:', err);
          console.error('[worker] Full error object:', JSON.stringify(err, null, 2));
          const reason = err?.message || 'Unknown error';
          try { await updateBuild(buildId, { state: 'failed', progress: 100, error: reason }); } catch {}
          sseEmitter.emit(buildId, 'final', { status: 'failed', reason, buildId });
        }
      },
      { connection: queueConnection as any },
    );
    return {
      async close() {
        await worker.close();
        if (createxBuildQueue) {
          await createxBuildQueue.close();
        }
        if (queueConnection && (queueConnection as any).connection) {
          await (queueConnection as any).connection.quit();
          createxBuildQueue = null;
        }
        queueConnection = null;
      },
    };
  };

  let handle: BuildWorkerHandle = createNoopHandle();
  startWorker().then(h => { handle = h; }).catch(err => console.error("Failed to start build worker", err));
  
  return { async close() { await handle.close(); } };
}
