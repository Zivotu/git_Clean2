import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import extract from 'extract-zip';

import { BUNDLE_ROOT, getBuildDir } from '../paths.js';
import { REDIS_URL } from '../config.js';
import { sseEmitter } from '../sse.js';
import { updateBuild, getBuildData } from '../models/Build.js';

async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await fs.copyFile(from, to);
    }
  }
}

function injectBaseHref(html: string, baseHref: string): string {
  const baseRegex = /<base\s+[^>]*href\s*=\s*["'][^"']*["'][^>]*>/i;
  const baseTag = `<base href="${baseHref}">`;
  if (baseRegex.test(html)) {
    return html.replace(baseRegex, baseTag);
  }
  const headRegex = /<head[^>]*>/i;
  const match = html.match(headRegex);
  if (match) {
    return html.replace(match[0], `${match[0]}\n${baseTag}`);
  }
  return `${baseTag}\n${html}`;
}

function stripDisallowedScripts(html: string): string {
  return html;
}

const BUNDLE_BUILD_QUEUE_NAME = 'bundle-build';
const REQUIRED_LOCK_FILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'];
const DEFAULT_NPM_REGISTRY = process.env.BUNDLE_BUILD_NPM_REGISTRY ?? 'https://registry.npmjs.org/';
const LISTING_LOCK_ROOT = path.join(BUNDLE_ROOT, 'listing-locks');
const COMMAND_OUTPUT_TAIL_BYTES = Number(process.env.BUNDLE_BUILD_LOG_TAIL_BYTES ?? 8000);
const INSTALL_TIMEOUT_MS = Number(process.env.BUNDLE_BUILD_INSTALL_TIMEOUT_MS ?? 4 * 60 * 1000);
const BUILD_TIMEOUT_MS = Number(process.env.BUNDLE_BUILD_BUILD_TIMEOUT_MS ?? 4 * 60 * 1000);

export type BundleBuildWorkerHandle = { close: () => Promise<void> };

// Re-using connection logic from createxBuildWorker
let queueConnection: ConnectionOptions | null = null;
let bundleBuildQueue: Queue | null = null;

type RunCommandOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  logPrefix?: string;
  captureLimit?: number;
};

type RunCommandResult = { stdout: string; stderr: string };

function clampOutput(buffer: string, chunk: string, limit: number): string {
  const next = buffer + chunk;
  if (next.length > limit) {
    return next.slice(next.length - limit);
  }
  return next;
}

async function runCommand(command: string, args: string[], options: RunCommandOptions): Promise<RunCommandResult> {
  const captureLimit = options.captureLimit ?? COMMAND_OUTPUT_TAIL_BYTES;
  const useShell = process.platform === 'win32';
  const resolvedCommand = useShell ? command : command;
  return new Promise<RunCommandResult>((resolve, reject) => {
    const env = { ...process.env, ...options.env };
    delete env.NODE_OPTIONS;
    const child = spawn(resolvedCommand, args, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: useShell,
    });
    const prefix = options.logPrefix ?? `[bundle-worker] ${command}`;
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout = clampOutput(stdout, text, captureLimit);
      process.stdout.write(`${prefix}: ${text}`);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr = clampOutput(stderr, text, captureLimit);
      process.stderr.write(`${prefix}: ${text}`);
    });

    let didTimeout = false;
    let timeout: NodeJS.Timeout | null = null;
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        didTimeout = true;
        console.warn(`${prefix}: timed out after ${options.timeoutMs}ms. Terminating...`);
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 2000);
      }, options.timeoutMs);
    }

    const dispose = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    child.on('error', (err) => {
      dispose();
      reject(err);
    });
    child.on('exit', (code) => {
      dispose();
      if (code === 0 && !didTimeout) {
        resolve({ stdout, stderr });
      } else {
        const reason = didTimeout
          ? `Command timed out after ${options.timeoutMs}ms`
          : `${command} exited with code ${code}`;
        const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
        const details = output ? `\n--- command output ---\n${output}\n----------------------` : '';
        reject(new Error(`${reason}${details}`));
      }
    });
  });
}

async function findLockFile(projectDir: string): Promise<string | null> {
  for (const file of REQUIRED_LOCK_FILES) {
    if (await fileExists(path.join(projectDir, file))) {
      return file;
    }
  }
  return null;
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

type InstallPlan = {
  manager: PackageManager;
  installCommand: string;
  installArgs: string[];
  buildCommand: string;
  buildArgs: string[];
  installEnv?: NodeJS.ProcessEnv;
  buildEnv?: NodeJS.ProcessEnv;
  cleanup?: () => Promise<void>;
};

const INSTALL_ENV_OVERRIDES: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  npm_config_production: 'false',
  YARN_PRODUCTION: 'false',
  pnpm_config_prod: 'false',
  BUN_INSTALL_DEV_DEPENDENCIES: '1',
};

const BUILD_ENV_OVERRIDES: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
};

function getPackageManagerForLock(lockFile: string): PackageManager {
  switch (lockFile) {
    case 'package-lock.json':
      return 'npm';
    case 'pnpm-lock.yaml':
      return 'pnpm';
    case 'yarn.lock':
      return 'yarn';
    case 'bun.lockb':
      return 'bun';
    default:
      throw new Error(`Nepoznata lock datoteka: ${lockFile}`);
  }
}

function detectPackageManagerFromPackageJson(pkgJson: any): PackageManager {
  const field = typeof pkgJson?.packageManager === 'string' ? pkgJson.packageManager : '';
  if (field.startsWith('pnpm')) return 'pnpm';
  if (field.startsWith('yarn')) return 'yarn';
  if (field.startsWith('bun')) return 'bun';
  if (field.startsWith('npm')) return 'npm';
  return 'npm';
}

async function prepareInstallPlan(
  lockFile: string,
  projectDir: string,
  workspaceDir: string,
  npmCacheDir: string
): Promise<InstallPlan> {
  const manager = getPackageManagerForLock(lockFile);
  if (manager === 'npm') {
    const npmrcPath = path.join(workspaceDir, '.npmrc.thesara');
    await fs.writeFile(npmrcPath, `registry=${DEFAULT_NPM_REGISTRY}\n`, 'utf8');
    return {
      manager,
      installCommand: 'npm',
      installArgs: ['ci'],
      buildCommand: 'npm',
      buildArgs: ['run', 'build'],
      installEnv: {
        ...INSTALL_ENV_OVERRIDES,
        npm_config_cache: npmCacheDir,
        npm_config_userconfig: npmrcPath,
      },
      buildEnv: {
        ...BUILD_ENV_OVERRIDES,
        npm_config_cache: npmCacheDir,
        npm_config_userconfig: npmrcPath,
      },
      cleanup: async () => {
        await fs.rm(npmrcPath, { force: true });
      },
    };
  }

  if (manager === 'pnpm') {
    return {
      manager,
      installCommand: 'pnpm',
      installArgs: ['install', '--frozen-lockfile'],
      buildCommand: 'pnpm',
      buildArgs: ['run', 'build'],
      installEnv: INSTALL_ENV_OVERRIDES,
      buildEnv: BUILD_ENV_OVERRIDES,
    };
  }

  if (manager === 'yarn') {
    return {
      manager,
      installCommand: 'yarn',
      installArgs: ['install', '--frozen-lockfile'],
      buildCommand: 'yarn',
      buildArgs: ['run', 'build'],
      installEnv: INSTALL_ENV_OVERRIDES,
      buildEnv: BUILD_ENV_OVERRIDES,
    };
  }

  return {
    manager: 'bun',
    installCommand: 'bun',
    installArgs: ['install', '--frozen-lockfile'],
    buildCommand: 'bun',
    buildArgs: ['run', 'build'],
    installEnv: INSTALL_ENV_OVERRIDES,
    buildEnv: BUILD_ENV_OVERRIDES,
  };
}

async function tryRestorePersistedLock(listingId: string | undefined, projectDir: string): Promise<string | null> {
  if (!listingId) return null;
  for (const candidate of REQUIRED_LOCK_FILES) {
    const persistedPath = path.join(LISTING_LOCK_ROOT, String(listingId), candidate);
    if (await fileExists(persistedPath)) {
      const dest = path.join(projectDir, candidate);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(persistedPath, dest);
      return candidate;
    }
  }
  return null;
}

async function persistListingLock(listingId: string | undefined, lockFilePath: string): Promise<void> {
  if (!listingId) return;
  const dest = path.join(LISTING_LOCK_ROOT, String(listingId), path.basename(lockFilePath));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(lockFilePath, dest);
}

async function synthesizeNpmLock(
  projectDir: string,
  workspaceDir: string,
  npmCacheDir: string,
  timeoutMs: number,
): Promise<string> {
  const npmrcPath = path.join(workspaceDir, '.npmrc.synth');
  await fs.writeFile(npmrcPath, `registry=${DEFAULT_NPM_REGISTRY}\n`, 'utf8');
  try {
    await runCommand('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
      cwd: projectDir,
      timeoutMs,
      logPrefix: '[bundle-worker][npm lock synth]',
      env: {
        npm_config_cache: npmCacheDir,
        npm_config_userconfig: npmrcPath,
        npm_config_save_exact: 'true',
      },
    });
  } finally {
    await fs.rm(npmrcPath, { force: true });
  }
  const lockPath = path.join(projectDir, 'package-lock.json');
  if (!(await fileExists(lockPath))) {
    throw new Error('Sintetizacija package-lock.json je propala (datoteka nije pronađena).');
  }
  return 'package-lock.json';
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
  if (!bundleBuildQueue) {
    bundleBuildQueue = new Queue(BUNDLE_BUILD_QUEUE_NAME, { connection: queueConnection as any });
  }
  return bundleBuildQueue;
}

export async function enqueueBundleBuild(buildId: string, zipPath: string): Promise<string> {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    // Assuming same env var controls this worker
    throw new Error('Build queue is disabled');
  }
  const queue = await ensureQueue();
  if (!queue) {
    throw new Error('Build queue is disabled');
  }
  await queue.add('build-bundle', { buildId, zipPath }, { removeOnComplete: true, removeOnFail: 1000 });
  return buildId;
}

async function runBundleBuildProcess(buildId: string, zipPath: string): Promise<void> {
  const baseDir = getBuildDir(buildId);
  const workspaceDir = path.join(baseDir, 'workspace');
  const buildDir = path.join(baseDir, 'build');
  const buildMeta = await getBuildData(buildId);
  const listingId = buildMeta?.listingId;

  console.log(`[bundle-worker] Starting build for ${buildId}...`);
  await fs.rm(workspaceDir, { recursive: true, force: true });
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(buildDir, { recursive: true });

  const npmCacheDir = path.join(workspaceDir, '.npm-cache');
  await fs.rm(npmCacheDir, { recursive: true, force: true });
  await fs.mkdir(npmCacheDir, { recursive: true });

  try {
    // 1. Unzip into workspace
    console.log(`[bundle-worker] Unzipping ${zipPath} to ${workspaceDir}`);
    await extract(zipPath, { dir: workspaceDir });
    console.log(`[bundle-worker] Unzip complete.`);

    // Handle nested directory in zip
    let projectDir = workspaceDir;
    const workspaceContents = await fs.readdir(workspaceDir);
    if (workspaceContents.length === 1) {
      const nestedPath = path.join(workspaceDir, workspaceContents[0]);
      const stats = await fs.stat(nestedPath);
      if (stats.isDirectory()) {
        projectDir = nestedPath;
      }
    }

    // If package.json exists, attempt dependency install + build
    const packageJsonPath = path.join(projectDir, 'package.json');
    if (await fileExists(packageJsonPath)) {
      console.log(`[bundle-worker] Detected package.json - running dependency install/build...`);
      let packageJson: any = {};
      try {
        const raw = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(raw);
      } catch {
        throw new Error('package.json nije valjan JSON.');
      }
      const preferredManager = detectPackageManagerFromPackageJson(packageJson);

      let lockFile = await findLockFile(projectDir);
      if (!lockFile) {
        const restored = await tryRestorePersistedLock(listingId, projectDir);
        if (restored) {
          lockFile = restored;
          console.log(`[bundle-worker] Restored ${lockFile} from cached lock for listing ${listingId}.`);
        }
      }
      let synthesizedLock = false;
      if (!lockFile) {
        if (preferredManager !== 'npm') {
          throw new Error(
            `Projekt nema lock datoteku, a packageManager=${preferredManager}. Trenutačno znamo sintetizirati samo npm lock.`,
          );
        }
        console.log('[bundle-worker] Lock datoteka nedostaje - sintetiziram package-lock.json...');
        lockFile = await synthesizeNpmLock(projectDir, workspaceDir, npmCacheDir, INSTALL_TIMEOUT_MS);
        synthesizedLock = true;
      }
      if (!lockFile) {
        throw new Error(
          [
            'Ne mozemo instalirati ovisnosti jer paket nema lock datoteku.',
            `Dodaj jednu od sljedecih: ${REQUIRED_LOCK_FILES.join(', ')}`,
          'Ako ti je aplikaciju generirao LLM, zamoli ga da za ovaj projekt napravi package-lock.json (ili odgovarajuci lock) pa ponovno uploadaj ZIP.'
        ].join(' ')
      );
      }
      console.log(`[bundle-worker] Using ${lockFile} for deterministic install.`);
      const installPlan = await prepareInstallPlan(lockFile, projectDir, workspaceDir, npmCacheDir);
      const installEnv = {
        npm_config_cache: npmCacheDir,
        ...(installPlan.installEnv ?? {}),
      };
      const buildEnv = {
        npm_config_cache: npmCacheDir,
        ...(installPlan.buildEnv ?? {}),
      };

      try {
        await runCommand(installPlan.installCommand, installPlan.installArgs, {
          cwd: projectDir,
          timeoutMs: INSTALL_TIMEOUT_MS,
          logPrefix: `[bundle-worker][${installPlan.manager} install]`,
          env: installEnv,
        });

        await runCommand(installPlan.buildCommand, installPlan.buildArgs, {
          cwd: projectDir,
          timeoutMs: BUILD_TIMEOUT_MS,
          logPrefix: `[bundle-worker][${installPlan.manager} build]`,
          env: buildEnv,
        });
        console.log(`[bundle-worker] ${installPlan.manager} build finished.`);
      } finally {
        await installPlan.cleanup?.();
      }

      if (lockFile && listingId) {
        try {
          await persistListingLock(listingId, path.join(projectDir, lockFile));
          if (synthesizedLock) {
            console.log(`[bundle-worker] Saved synthesized ${lockFile} for listing ${listingId}.`);
          }
        } catch (err) {
          console.warn(`[bundle-worker] Failed to persist lock for listing ${listingId}`, err);
        }
      }

      const distDir = path.join(projectDir, 'dist');
      if (!(await dirExists(distDir))) {
        throw new Error('Build completed but no dist/ directory was produced.');
      }
      await fs.rm(buildDir, { recursive: true, force: true });
      await copyDir(distDir, buildDir);
    } else {
      await copyDir(projectDir, buildDir);
    }

    // 2. Inject shims + base href into the final index.html
    const indexPath = path.join(buildDir, 'index.html');
    try {
      let html = await fs.readFile(indexPath, 'utf8');
      const listingId = (await getBuildData(buildId))?.listingId;
      const shimScript = `
        <script>
          window.__THESARA_APP_NS = ${JSON.stringify('app:' + String(listingId))};
          window.__THESARA_APP_ID__ = ${JSON.stringify(String(listingId))};
          window.thesara = window.thesara || {};
          window.thesara.app = Object.assign({}, window.thesara.app, { id: ${JSON.stringify(String(listingId))} });
        </script>
        <script type="module" src="/shims/rooms.js"></script>
        <script type="module" src="/shims/storage.js"></script>
        <script src="/shims/localstorage.js"></script>
      `;
      const baseHref = `/builds/${buildId}/bundle/`;
      html = stripDisallowedScripts(html);
      html = injectBaseHref(html, baseHref);
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${shimScript}</head>`);
      } else {
        html += shimScript; // Fallback if no </head>
      }
      await fs.writeFile(indexPath, html, 'utf8');
      console.log(`[bundle-worker] Injected storage shim + base href into index.html.`);
    } catch (err) {
      console.warn(`[bundle-worker] Could not inject shims into ${indexPath}.`, err);
      // This might not be a fatal error if the app doesn't need storage.
    }
  } finally {
    // 3. Cleanup temporary zip file and per-build npm cache
    await fs.rm(zipPath, { force: true });
    await fs.rm(npmCacheDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
    console.log(`[bundle-worker] Cleaned up temporary zip file and workspace.`);
  }
}

export function startBundleBuildWorker(): BundleBuildWorkerHandle {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    console.warn('[bundle-worker] CREATEX_WORKER_ENABLED is not "true" – worker disabled');
    return { close: async () => {} };
  }
  console.log('[bundle-worker] Starting bundle build worker...');
  let handle: BundleBuildWorkerHandle = { close: async () => {} };

  const start = async () => {
    queueConnection = await resolveRedisConnection();
    if (!queueConnection) {
      console.warn('[bundle-worker] Redis connection not configured – worker disabled');
      return;
    }
    const worker = new Worker(
      BUNDLE_BUILD_QUEUE_NAME,
      async (job) => {
        const { buildId, zipPath } = job.data as { buildId: string; zipPath: string };
        console.log(`[bundle-worker] Processing job: ${buildId}`);
        try {
          sseEmitter.emit(buildId, 'status', { status: 'bundling' });
          await updateBuild(buildId, { state: 'build', progress: 20, error: undefined });

          await runBundleBuildProcess(buildId, zipPath);

          await updateBuild(buildId, { state: 'pending_review', progress: 100 });
          
          const listingId = (await getBuildData(buildId))?.listingId;
          sseEmitter.emit(buildId, 'final', { status: 'success', buildId, listingId });

        } catch (err: any) {
          console.error(`[bundle-worker] Job ${buildId} failed:`, err);
          const reason = err?.message || 'Unknown error';
          await updateBuild(buildId, { state: 'failed', progress: 100, error: reason });
          sseEmitter.emit(buildId, 'final', { status: 'failed', reason, buildId });
        }
      },
      { connection: queueConnection as any }
    );

    handle = {
      async close() {
        await worker.close();
        if (bundleBuildQueue) await bundleBuildQueue.close();
      },
    };
  };

  start().catch(err => console.error("[bundle-worker] Failed to start:", err));

  return {
    async close() {
      await handle.close();
    }
  };
}
