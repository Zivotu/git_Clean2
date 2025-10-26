import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Queue, Worker } from 'bullmq';
import { getBuildDir } from '../paths.js';
import { REDIS_URL } from '../config.js';
import { readApps, writeApps } from '../db.js';
import { bundlePlayBuild } from '../build/bundler.js';
import { generateSri } from '../lib/fsx.js';
import { prisma } from '../db.js';
import { sseEmitter } from '../lib/sseEmitter.js';

const QUEUE_NAME = 'createx-build';

export type BuildWorkerHandle = { close: () => Promise<void> };

export class QueueDisabledError extends Error {
  code = 'QUEUE_DISABLED';
  constructor(message = 'Build queue is disabled') {
    super(message);
    this.name = 'QueueDisabledError';
  }
}

type RedisConnection =
  | { connectionString: string }
  | { host: string; port: number };

let queueConnection: RedisConnection | null = null;
let createxBuildQueue: Queue | null = null;

function resolveRedisConnection(): RedisConnection | null {
  if (REDIS_URL) {
    return { connectionString: REDIS_URL };
  }
  const host = process.env.REDIS_HOST;
  if (host) {
    return {
      host,
      port: Number(process.env.REDIS_PORT || 6379),
    };
  }
  return null;
}

function ensureQueue(): Queue | null {
  if (!queueConnection) {
    queueConnection = resolveRedisConnection();
  }
  if (!queueConnection) return null;
  if (!createxBuildQueue) {
    createxBuildQueue = new Queue(QUEUE_NAME, { connection: queueConnection });
  }
  return createxBuildQueue;
}

function queueDisabled(): QueueDisabledError {
  return new QueueDisabledError();
}

function createNoopHandle(): BuildWorkerHandle {
  return { close: async () => {} };
}

async function ensureStorageCapabilityFlag(buildId: string): Promise<void> {
  try {
    const apps = await readApps();
    const idx = apps.findIndex(
      (app: any) => app?.pendingBuildId === buildId || app?.buildId === buildId,
    );
    if (idx < 0) return;
    const current = apps[idx] as any;
    const capabilities = { ...(current.capabilities || {}) };
    const features = new Set<string>(
      Array.isArray(capabilities.features) ? capabilities.features : [],
    );
    const hasStorageEnabled = capabilities.storage?.enabled === true;
    if (!hasStorageEnabled && !features.has('storage')) {
      return;
    }
    let changed = false;
    if (!hasStorageEnabled) {
      capabilities.storage = { ...(capabilities.storage || {}), enabled: true };
      changed = true;
    }
    if (!features.has('storage')) {
      features.add('storage');
      changed = true;
    }
    if (!changed) return;
    capabilities.features = Array.from(features);
    apps[idx] = {
      ...current,
      capabilities,
      updatedAt: Date.now(),
    };
    await writeApps(apps as any);
  } catch (err) {
    console.warn({ buildId, err }, 'storage_capability_update_failed');
  }
}

export async function enqueueCreatexBuild(buildId: string = randomUUID()): Promise<string> {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    throw queueDisabled();
  }
  const queue = ensureQueue();
  if (!queue) {
    throw queueDisabled();
  }
  await queue.add('build', { buildId });
  return buildId;
}

export function startCreatexBuildWorker(): BuildWorkerHandle {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    return createNoopHandle();
  }
  queueConnection = resolveRedisConnection();
  if (!queueConnection) {
    console.warn('[worker] REDIS_URL missing – build worker disabled');
    return createNoopHandle();
  }
  const queue = ensureQueue();
  if (!queue) {
    console.warn('[worker] Failed to initialise queue connection – build worker disabled');
    return createNoopHandle();
  }
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { buildId } = job.data as { buildId: string };
      try {
        await prisma.build.update({ where: { id: buildId }, data: { status: 'bundling' } });
        sseEmitter.emit('build_event', { buildId, event: 'status', payload: { status: 'bundling' } });

        await runBuildProcess(buildId);

        await prisma.build.update({ where: { id: buildId }, data: { status: 'verifying' } });
        sseEmitter.emit('build_event', { buildId, event: 'status', payload: { status: 'verifying' } });

        await ensureStorageCapabilityFlag(buildId);
        
        const finalBuild = await prisma.build.update({
          where: { id: buildId },
          data: { status: 'success', mode: 'bundled' },
        });

        sseEmitter.emit('build_event', {
          buildId,
          event: 'final',
          payload: { status: 'success', buildId, listingId: finalBuild.listingId },
        });

      } catch (err: any) {
        console.error({ buildId, err }, 'build:error');
        const reason = err?.message || 'Unknown error';
        const finalBuild = await prisma.build.update({
          where: { id: buildId },
          data: { status: 'failed', reason },
        });

        sseEmitter.emit('build_event', {
          buildId,
          event: 'final',
          payload: { status: 'failed', reason, buildId, listingId: finalBuild.listingId },
        });
      }
    },
    { connection: queueConnection },
  );
  return {
    async close() {
      await worker.close();
      if (createxBuildQueue) {
        await createxBuildQueue.close();
        createxBuildQueue = null;
      }
      queueConnection = null;
    },
  };
}

async function runBuildProcess(buildId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const pkgMgr = process.env.npm_execpath || 'npm';
    const proc = spawn(pkgMgr, ['run', 'createx:build'], {
      env: { ...process.env, BUILD_ID: buildId },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      try {
        const dir = path.resolve('build', 'logs');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, `${buildId}.log`), stdout + stderr);
      } catch (err) {
        console.error(err, 'build:log_error');
      }
      if (code === 0) resolve();
      else {
        if (stderr) console.error(stderr);
        reject(new Error(`exit_code_${code}`));
      }
    });
  });

  // The createx:build script has finished and populated the 'build' directory.
  const buildDir = path.resolve('build');

  const { outFile } = await bundlePlayBuild(buildDir);
  const bundleContent = await fs.readFile(outFile, 'utf-8');
  const sri = generateSri(bundleContent);

  await rewriteIndexHtml({ buildDir, sri });

  const manifestPath = path.join(buildDir, 'manifest_v1.json');
  const manifest = {
    entry: './app.bundle.js',
    integrity: sri,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}
`, 'utf-8');


  const src = path.resolve('build');
  const dest = path.join(getBuildDir(buildId), 'build');
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
  await fs.rm(src, { recursive: true, force: true });
}

async function rewriteIndexHtml({
  buildDir,
  sri,
}: {
  buildDir: string;
  sri: string;
}): Promise<void> {
  const indexPath = path.join(buildDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf-8');
  const scriptTag = `<script type="module" src="./app.bundle.js" integrity="${sri}" crossorigin="anonymous"></script>`;
  const scriptRegex = /<script[^>]+src=["'][^"']*app(?:\.bundle)?\.js["'][^>]*><\/script>/i;
  const inlineModuleRegex = /<script\s+type=["']module["'][^>]*>[\s\S]*?<\/script>/i;

  if (scriptRegex.test(html)) {
    html = html.replace(scriptRegex, scriptTag);
  } else if (inlineModuleRegex.test(html)) {
    html = html.replace(inlineModuleRegex, scriptTag);
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', `  ${scriptTag}\n</body>`);
  } else {
    html = `${html}\n${scriptTag}\n`;
  }

  await fs.writeFile(indexPath, html, 'utf-8');
}