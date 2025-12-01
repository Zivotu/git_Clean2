import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import extract from 'extract-zip';

import { BUNDLE_ROOT, getBuildDir } from '../paths.js';
import { REDIS_URL } from '../config.js';
import { sseEmitter } from '../sse.js';
import { updateBuild, getBuildData, type BuildInfoMetadata } from '../models/Build.js';
import { notifyAdmins } from '../notifier.js';
import { normalizeSupportedLocale } from '../lib/locale.js';

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

const FRIENDLY_FAILURE_MESSAGES: Record<'hr' | 'en' | 'de', string> = {
  hr: '--- Thesara obavijest ---\nPrimijetili smo neocekivanu gresku u tvojoj aplikaciji i nas tim je vec zapoceo istragu. Cim otkrijemo uzrok javit cemo ti se s detaljima i rjesenjem, a vrlo brzo ces dobiti i email s dodatnim informacijama.\nHvala ti na strpljenju! - Thesara tim',
  en: '--- Thesara Support ---\nWe detected an unexpected issue in your app and our team already started investigating it. As soon as we find the cause we will follow up with details and a fix, and you should receive an email with more information shortly.\nThanks for your patience! - The Thesara Team',
  de: '--- Thesara Hinweis ---\nWir haben ein unerwartetes Problem in deiner App erkannt und unser Team untersucht es bereits. Sobald wir die Ursache gefunden haben, melden wir uns mit Details und einer Losung, und du erhaeltst in Kurze eine E-Mail mit weiteren Informationen.\nDanke fur deine Geduld! - Dein Thesara Team',
};

function getFriendlyFailureMessage(locale?: string | null): string {
  const normalized = normalizeSupportedLocale(locale);
  return FRIENDLY_FAILURE_MESSAGES[normalized] ?? FRIENDLY_FAILURE_MESSAGES.en;
}

async function notifyBuildFailureAdmins(opts: {
  buildId: string;
  reason: string;
  error: any;
  meta?: BuildInfoMetadata;
  llmApiKey?: string;
  customAssets?: { name: string; path: string }[];
}): Promise<void> {
  const { buildId, reason, error, meta, llmApiKey, customAssets } = opts;
  try {
    const subjectParts = ['Build failed', meta?.appTitle || '', `#${meta?.listingId || '?'}`]
      .map((part) => part && part.trim())
      .filter(Boolean);
    const subject = `[bundle-worker] ${subjectParts.join(' · ') || buildId}`;
    const lines: string[] = [];
    lines.push(`Build ID: ${buildId}`);
    if (meta?.listingId) lines.push(`Listing ID: ${meta.listingId}`);
    if (meta?.slug) lines.push(`Slug: ${meta.slug}`);
    if (meta?.appTitle) lines.push(`Naslov: ${meta.appTitle}`);
    if (meta?.creatorLanguage) lines.push(`Creator lang: ${meta.creatorLanguage}`);
    if (meta?.authorUid) lines.push(`Author UID: ${meta.authorUid}`);
    if (meta?.authorName) lines.push(`Author name: ${meta.authorName}`);
    if (meta?.authorHandle) lines.push(`Author handle: @${meta.authorHandle}`);
    if (meta?.authorEmail) lines.push(`Author email: ${meta.authorEmail}`);
    if (meta?.submitterUid && meta.submitterUid !== meta.authorUid) {
      lines.push(`Submitted by UID: ${meta.submitterUid}`);
    }
    if (meta?.submitterEmail && meta.submitterEmail !== meta.authorEmail) {
      lines.push(`Submitted by email: ${meta.submitterEmail}`);
    }
    lines.push(`LLM API key supplied: ${llmApiKey ? 'yes' : 'no'}`);
    if (customAssets?.length) {
      lines.push(`Custom assets: ${customAssets.length} (${customAssets.map((a) => a.name).join(', ')})`);
    }
    lines.push('');
    lines.push(`Error: ${reason}`);
    if (error?.stack) {
      lines.push('');
      lines.push('Stack trace:');
      lines.push(error.stack);
    }
    await notifyAdmins(subject, lines.join('\n'));
  } catch (notifyErr) {
    console.warn('[bundle-worker] Failed to notify admins about build failure', { buildId, notifyErr });
  }
}

async function applyCustomAssets(
  projectDir: string,
  assets: { name: string; path: string }[] | undefined,
  preferPublic: boolean,
): Promise<string[]> {
  if (!assets?.length) return [];
  const targetDir = preferPublic ? path.join(projectDir, 'public') : projectDir;
  await fs.mkdir(targetDir, { recursive: true });

  const copiedAssets: string[] = [];
  for (const asset of assets) {
    const safeName = path.basename(asset.name || '');
    const dest = path.join(targetDir, safeName || `asset-${Date.now()}`);
    await fs.copyFile(asset.path, dest);
    copiedAssets.push(safeName);
  }

  console.log(
    `[bundle-worker] Added ${assets.length} custom asset(s) to ${preferPublic ? 'public/' : 'project root'}:`,
    copiedAssets.join(', ')
  );

  return copiedAssets;
}

async function ensureAssetsInDist(
  distDir: string,
  publicDir: string,
  assetNames: string[]
): Promise<void> {
  if (!assetNames?.length) return;

  let copiedCount = 0;
  for (const assetName of assetNames) {
    const distPath = path.join(distDir, assetName);
    const publicPath = path.join(publicDir, assetName);

    // Check if asset exists in dist
    const existsInDist = await fileExists(distPath);

    if (!existsInDist && await fileExists(publicPath)) {
      // Copy from public to dist if missing
      await fs.copyFile(publicPath, distPath);
      copiedCount++;
      console.log(`[bundle-worker] ⚠️  Copied missing asset to dist/: ${assetName}`);
    }
  }

  if (copiedCount > 0) {
    console.log(`[bundle-worker] ✅ Ensured ${copiedCount} custom asset(s) are in dist/`);
  } else if (assetNames.length > 0) {
    console.log(`[bundle-worker] ✅ All ${assetNames.length} custom asset(s) already in dist/`);
  }
}

function isIgnorableUnzipEntry(name: string): boolean {
  const lowered = name.toLowerCase();
  if (lowered === '__macosx' || lowered.startsWith('__macosx/')) return true;
  if (lowered === '.ds_store') return true;
  if (name.startsWith('._')) return true;
  return false;
}

async function findLikelyProjectDir(workspaceDir: string): Promise<string> {
  const entries = await fs.readdir(workspaceDir, { withFileTypes: true });
  const meaningful = entries.filter((entry) => !isIgnorableUnzipEntry(entry.name));

  const hasRootPackage = await fileExists(path.join(workspaceDir, 'package.json'));
  const hasRootIndex = await fileExists(path.join(workspaceDir, 'index.html'));
  if (hasRootPackage || hasRootIndex) {
    return workspaceDir;
  }

  const dirs = meaningful.filter((entry) => entry.isDirectory());
  if (dirs.length === 0) {
    return workspaceDir;
  }
  if (dirs.length === 1) {
    return path.join(workspaceDir, dirs[0].name);
  }

  const scored = await Promise.all(
    dirs.map(async (entry) => {
      const dirPath = path.join(workspaceDir, entry.name);
      let score = 0;
      if (await fileExists(path.join(dirPath, 'package.json'))) score += 4;
      if (await fileExists(path.join(dirPath, 'index.html'))) score += 2;
      if (await fileExists(path.join(dirPath, 'dist', 'index.html'))) score += 1;
      if (await fileExists(path.join(dirPath, 'app.js'))) score += 1;
      return { dirPath, score };
    }),
  );

  scored.sort((a, b) => b.score - a.score);
  const winner = scored.find((entry) => entry.score > 0);
  if (winner) return winner.dirPath;
  return scored[0]?.dirPath ?? workspaceDir;
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

const BLOCKED_SCRIPT_PATTERNS = [
  /https?:\/\/(?:www\.)?googletagmanager\.com/i,
  /https?:\/\/www\.google-analytics\.com/i,
  /https?:\/\/www\.clarity\.ms/i,
  /https?:\/\/fundingchoicesmessages\.google\.com/i,
];

function stripDisallowedScripts(html: string): string {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  return html.replace(scriptRegex, (tag) => {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && BLOCKED_SCRIPT_PATTERNS.some((pattern) => pattern.test(srcMatch[1]))) {
      return '';
    }
    if (!srcMatch && /clarity|googletag|fundingchoices/i.test(tag)) {
      return '';
    }
    return tag;
  });
}

const API_KEY_PLACEHOLDERS = [
  'PLACEHOLDER_API_KEY',
  'YOUR_API_KEY',
  'YOUR_GOOGLE_API_KEY',
];

async function replaceApiKeyPlaceholders(rootDir: string, apiKey: string) {
  const targetExts = new Set(['.js', '.mjs', '.cjs', '.html', '.txt']);
  let filesTouched = 0;
  let replacements = 0;

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!targetExts.has(ext)) continue;
      let contents = await fs.readFile(abs, 'utf8');
      let next = contents;
      for (const placeholder of API_KEY_PLACEHOLDERS) {
        const segments = next.split(placeholder);
        if (segments.length > 1) {
          replacements += segments.length - 1;
          next = segments.join(apiKey);
        }
      }
      if (next !== contents) {
        await fs.writeFile(abs, next, 'utf8');
        filesTouched += 1;
      }
    }
  }

  await walk(rootDir);
  return { filesTouched, replacements };
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
  npm_config_include: 'dev',
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

const BUILD_TOOL_MARKERS = ['vite', 'tsup', 'webpack', 'rollup', 'parcel', 'gulp', 'esbuild'];

function isMissingBuildToolError(err: any): boolean {
  const text = [
    err?.stderr,
    err?.stdout,
    err?.message,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  if (!text.includes('not found') && !text.includes('command not found')) {
    return false;
  }
  return BUILD_TOOL_MARKERS.some((tool) => text.includes(tool));
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
      installArgs: ['ci', '--include=dev'],
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
    await runCommand('npm', ['install', '--package-lock-only', '--ignore-scripts', '--include=dev'], {
      cwd: projectDir,
      timeoutMs,
      logPrefix: '[bundle-worker][npm lock synth]',
      env: {
        ...INSTALL_ENV_OVERRIDES,
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

const AI_FIX_JS_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js']);
const AI_FIX_HTML_EXTENSIONS = new Set(['.html', '.htm']);
const REACT_ATTR_ALIASES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
};

type HtmlTagSegment = { segment: string; endIndex: number };
type JsxExpressionCapture = { expression: string; endIndex: number };

function escapeHtmlAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n|\r/g, ' ')
    .trim();
}

function normalizeTemplateLiteral(literal: string): { literal: string; expressions: string[] } {
  const expressions: string[] = [];
  const withoutExpressions = literal.replace(/\$\{([^}]*)\}/g, (_, expr) => {
    const trimmed = (expr || '').trim();
    if (trimmed) expressions.push(trimmed);
    return '';
  });
  const normalized = withoutExpressions.replace(/\s+/g, ' ').trim();
  return { literal: normalized, expressions };
}

function toDataAttrKey(name: string): string {
  const dashed = name
    .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    .replace(/[^a-z0-9:-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return dashed || 'attr';
}

function fixReactLikeAttributesInTag(tag: string): { tag: string; changed: boolean } {
  let updated = tag;
  let changed = false;

  updated = updated.replace(/(^|[\s"'`])(className|htmlFor)(?=\s*=)/g, (match, prefix, attr) => {
    changed = true;
    return `${prefix}${REACT_ATTR_ALIASES[attr] ?? attr}`;
  });

  const doubleBraceRe = /([A-Za-z_:][\w:.-]*)\s*=\s*{{([\s\S]*?)}}/g;
  updated = updated.replace(doubleBraceRe, (match, rawName, expr) => {
    changed = true;
    const mapped = REACT_ATTR_ALIASES[rawName] ?? rawName;
    return `${mapped}="${escapeHtmlAttributeValue(expr)}"`;
  });

  const expressionResult = replaceJsxExpressionAttributes(updated);
  updated = expressionResult.output;
  if (expressionResult.changed) {
    changed = true;
  }

  return { tag: updated, changed };
}

function captureJsxExpression(text: string, startIndex: number): JsxExpressionCapture | null {
  let i = startIndex;
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  while (i < text.length) {
    const ch = text[i];
    const prev = text[i - 1];

    if (inSingle) {
      if (ch === "'" && prev !== '\\') inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== '\\') inDouble = false;
      i += 1;
      continue;
    }
    if (inBacktick) {
      if (ch === '`' && prev !== '\\') inBacktick = false;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      i += 1;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { expression: text.slice(startIndex, i), endIndex: i + 1 };
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return null;
}

function buildAttributeReplacement(rawName: string, expr: string): string {
  const mapped = REACT_ATTR_ALIASES[rawName] ?? rawName;
  const trimmed = expr.trim();
  if (!trimmed) {
    return `${mapped}=""`;
  }
  const firstChar = trimmed[0];
  if ((firstChar === '"' || firstChar === "'") && trimmed.endsWith(firstChar)) {
    const inner = trimmed.slice(1, -1);
    return `${mapped}="${escapeHtmlAttributeValue(inner)}"`;
  }
  if (firstChar === '`' && trimmed.endsWith('`')) {
    const inner = trimmed.slice(1, -1);
    const { literal, expressions } = normalizeTemplateLiteral(inner);
    let replacement = `${mapped}="${escapeHtmlAttributeValue(literal)}"`;
    if (expressions.length) {
      replacement += ` data-ai-${toDataAttrKey(mapped)}-expr="${escapeHtmlAttributeValue(
        expressions.join('; '),
      )}"`;
    }
    return replacement;
  }
  if (/^(true|false|null|undefined|\d+(\.\d+)?)/i.test(trimmed)) {
    return `${mapped}="${escapeHtmlAttributeValue(trimmed)}"`;
  }
  const dataAttr = `data-ai-${toDataAttrKey(mapped)}-expr`;
  return `${dataAttr}="${escapeHtmlAttributeValue(trimmed)}"`;
}

function replaceJsxExpressionAttributes(tag: string): { output: string; changed: boolean } {
  const attrStartRe = /([A-Za-z_:][\w:.-]*)\s*=\s*{/g;
  let cursor = 0;
  let result = '';
  let mutated = false;

  while (cursor < tag.length) {
    attrStartRe.lastIndex = cursor;
    const match = attrStartRe.exec(tag);
    if (!match) {
      result += tag.slice(cursor);
      break;
    }
    const matchIndex = match.index;
    const matchText = match[0];
    const rawName = match[1];
    const exprStart = matchIndex + matchText.length;
    const capture = captureJsxExpression(tag, exprStart);
    if (!capture) {
      result += tag.slice(cursor);
      return { output: result, changed: mutated };
    }
    result += tag.slice(cursor, matchIndex);
    result += buildAttributeReplacement(rawName, capture.expression);
    cursor = capture.endIndex;
    mutated = true;
  }

  return { output: result, changed: mutated };
}

function captureHtmlTagSegment(html: string, startIndex: number): HtmlTagSegment | null {
  let i = startIndex + 1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let braceDepth = 0;

  while (i < html.length) {
    const ch = html[i];
    const prev = html[i - 1];

    if (inSingle) {
      if (ch === "'" && prev !== '\\') inSingle = false;
      i += 1;
      continue;
    }

    if (inDouble) {
      if (ch === '"' && prev !== '\\') inDouble = false;
      i += 1;
      continue;
    }

    if (inBacktick) {
      if (ch === '`' && prev !== '\\') {
        inBacktick = false;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      i += 1;
      continue;
    }

    if (ch === '{') {
      braceDepth += 1;
      i += 1;
      continue;
    }
    if (ch === '}' && braceDepth > 0) {
      braceDepth -= 1;
      i += 1;
      continue;
    }

    if (ch === '>' && braceDepth === 0) {
      return { segment: html.slice(startIndex, i + 1), endIndex: i + 1 };
    }

    i += 1;
  }

  return null;
}

function sanitizeReactSyntaxInHtml(html: string): { output: string; changed: boolean } {
  let mutated = false;
  let index = 0;
  let output = '';

  while (index < html.length) {
    const nextTagStart = html.indexOf('<', index);
    if (nextTagStart === -1) {
      output += html.slice(index);
      break;
    }

    const capture = captureHtmlTagSegment(html, nextTagStart);
    if (!capture) {
      output += html.slice(index);
      break;
    }

    output += html.slice(index, nextTagStart);
    const { segment, endIndex } = capture;
    const trimmed = segment.trimStart();
    if (
      !trimmed.startsWith('<') ||
      /^<\s*\/.*/.test(trimmed) ||
      /^<\s*!/.test(trimmed) ||
      /^<\s*\?/.test(trimmed)
    ) {
      output += segment;
    } else {
      const { tag, changed } = fixReactLikeAttributesInTag(segment);
      if (changed) mutated = true;
      output += tag;
    }
    index = endIndex;
  }

  return { output, changed: mutated };
}

async function fixCommonAiErrors(projectDir: string) {
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(abs);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const isScriptLike = AI_FIX_JS_EXTENSIONS.has(ext);
        const isHtmlLike = AI_FIX_HTML_EXTENSIONS.has(ext);
        if (!isScriptLike && !isHtmlLike) {
          continue;
        }

        let content = await fs.readFile(abs, 'utf8');
        let changed = false;

        if (isScriptLike) {
          // Fix 1: Adjacent JSX elements in object property without Fragment
          const adjacentJsxRegex =
            /((?:['"][^'"]+['"]|[\w$]+)\s*:\s*)(\(?\s*)((?:<[a-zA-Z0-9]+[^>]*\/>\s*){2,})(\s*\)?)(,|})/g;
          let next = content.replace(
            adjacentJsxRegex,
            (match, key, before, nodes, after, suffix) => {
              const trimmedNodes = (nodes as string).trimStart();
              if (trimmedNodes.startsWith('<>') || trimmedNodes.startsWith('<React.Fragment')) {
                return match;
              }
              return `${key}${before}<>${nodes}</>${after}${suffix}`;
            },
          );

          // Fix 2: Remove leading slash from img.src assignments to support base href
          // Matches: img.src = `/${...}` or img.src = "/..."
          // We want to turn `/${def.filename}` into `${def.filename}` so it respects <base>
          const imgSrcRegex = /(img\.src\s*=\s*[`"'])(\/)([^`"'])/g;
          next = next.replace(imgSrcRegex, '$1$3');

          if (next !== content) {
            content = next;
            changed = true;
          }
        }

        if (isHtmlLike) {
          const sanitized = sanitizeReactSyntaxInHtml(content);
          if (sanitized.changed) {
            content = sanitized.output;
            changed = true;
          }
        }

        if (changed) {
          console.log(`[bundle-worker] Fixed AI syntax/path error in ${abs}`);
          await fs.writeFile(abs, content, 'utf8');
        }
      }
    }
  }
  try {
    await walk(projectDir);
  } catch (err) {
    console.warn('[bundle-worker] Failed to run AI error fixer', err);
  }
}

export async function enqueueBundleBuild(
  buildId: string,
  zipPath: string,
  opts?: { llmApiKey?: string; customAssets?: { name: string; path: string }[] },
): Promise<string> {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    // Assuming same env var controls this worker
    throw new Error('Build queue is disabled');
  }
  const queue = await ensureQueue();
  if (!queue) {
    throw new Error('Build queue is disabled');
  }
  await queue.add(
    'build-bundle',
    { buildId, zipPath, llmApiKey: opts?.llmApiKey, customAssets: opts?.customAssets || [] },
    { removeOnComplete: true, removeOnFail: 1000 },
  );
  return buildId;
}

async function runBundleBuildProcess(
  buildId: string,
  zipPath: string,
  options?: { llmApiKey?: string; customAssets?: { name: string; path: string }[] },
): Promise<void> {
  const llmApiKey = options?.llmApiKey?.trim() ? options.llmApiKey.trim() : undefined;
  const baseDir = getBuildDir(buildId);
  const workspaceDir = path.join(baseDir, 'workspace');
  const buildDir = path.join(baseDir, 'build');
  const uploadRoot = path.dirname(zipPath);
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
    let projectDir = await findLikelyProjectDir(workspaceDir);
    if (projectDir !== workspaceDir) {
      console.log(`[bundle-worker] Using nested project directory: ${path.relative(workspaceDir, projectDir) || '.'}`);
    }

    // Attempt to fix common AI generation errors (e.g. missing fragments in icon maps)
    await fixCommonAiErrors(projectDir);

    // If package.json exists, attempt dependency install + build
    const packageJsonPath = path.join(projectDir, 'package.json');
    const hasPackageJson = await fileExists(packageJsonPath);

    let customAssetNames: string[] = [];
    if (options?.customAssets?.length) {
      try {
        customAssetNames = await applyCustomAssets(projectDir, options.customAssets, hasPackageJson);
      } catch (err) {
        console.warn('[bundle-worker] Failed to apply custom assets.', err);
        throw err;
      }
    }

    if (hasPackageJson) {
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

      let didDevRetry = false;
      try {
        await runCommand(installPlan.installCommand, installPlan.installArgs, {
          cwd: projectDir,
          timeoutMs: INSTALL_TIMEOUT_MS,
          logPrefix: `[bundle-worker][${installPlan.manager} install]`,
          env: installEnv,
        });

        const runBuild = () =>
          runCommand(installPlan.buildCommand, installPlan.buildArgs, {
            cwd: projectDir,
            timeoutMs: BUILD_TIMEOUT_MS,
            logPrefix: `[bundle-worker][${installPlan.manager} build]`,
            env: buildEnv,
          });

        try {
          await runBuild();
        } catch (err) {
          if (
            !didDevRetry &&
            installPlan.manager === 'npm' &&
            isMissingBuildToolError(err)
          ) {
            didDevRetry = true;
            console.warn(
              `[bundle-worker] Build tool missing after install; retrying npm install with --include=dev.`,
            );
            await runCommand('npm', ['install', '--include=dev'], {
              cwd: projectDir,
              timeoutMs: INSTALL_TIMEOUT_MS,
              logPrefix: `[bundle-worker][npm install --include=dev]`,
              env: installEnv,
            });
            await runBuild();
          } else {
            throw err;
          }
        }
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

      // Ensure custom assets are in dist/ before copying to buildDir
      if (customAssetNames.length > 0) {
        const publicDir = path.join(projectDir, 'public');
        await ensureAssetsInDist(distDir, publicDir, customAssetNames);
      }

      await fs.rm(buildDir, { recursive: true, force: true });
      await copyDir(distDir, buildDir);
    } else {
      await copyDir(projectDir, buildDir);
    }

    if (llmApiKey) {
      try {
        const stats = await replaceApiKeyPlaceholders(buildDir, llmApiKey);
        if (stats.replacements > 0) {
          console.log(
            `[bundle-worker] Replaced ${stats.replacements} API key placeholders across ${stats.filesTouched} files.`,
          );
        }
      } catch (err) {
        console.warn('[bundle-worker] Failed to replace API key placeholders.', err);
      }
    }

    // 2. Inject shims + base href into the final index.html
    const indexPath = path.join(buildDir, 'index.html');
    try {
      let html = await fs.readFile(indexPath, 'utf8');
      const listingId = (await getBuildData(buildId))?.listingId;
      const aiSnippet = llmApiKey
        ? `
          (function() {
            const __AI_KEY__ = ${JSON.stringify(llmApiKey)};
            const assignEnv = (env) => {
              const next = Object.assign({}, env);
              next.THESARA_AI_API_KEY = __AI_KEY__;
              next.GOOGLE_API_KEY = __AI_KEY__;
              next.GEMINI_API_KEY = __AI_KEY__;
              next.GENERATIVE_LANGUAGE_API_KEY = __AI_KEY__;
              return next;
            };

            globalThis.__THESARA_AI_API_KEY__ = __AI_KEY__;
            globalThis.thesara = globalThis.thesara || {};
            globalThis.thesara.ai = Object.assign({}, globalThis.thesara.ai, {
              apiKey: __AI_KEY__,
              provider: 'user',
              updatedAt: new Date().toISOString(),
            });
            if (typeof globalThis.process !== 'object' || globalThis.process === null) {
              globalThis.process = {};
            }
            globalThis.process.env = assignEnv(globalThis.process.env);

            const originalFetch = globalThis.fetch;
            if (typeof originalFetch === 'function' && !globalThis.__THESARA_AI_FETCH_SHIM__) {
              globalThis.__THESARA_AI_FETCH_SHIM__ = true;
              globalThis.fetch = function(input, init) {
                try {
                  const url =
                    typeof input === 'string'
                      ? input
                      : input instanceof Request
                      ? input.url
                      : input && typeof input.url === 'string'
                      ? input.url
                      : '';
                  if (url && url.startsWith('https://generativelanguage.googleapis.com')) {
                    const nextInit = Object.assign({}, init);
                    const headers = new Headers(
                      nextInit.headers ||
                        (input instanceof Request ? input.headers : undefined) ||
                        undefined,
                    );
                    if (!headers.has('x-goog-api-key')) {
                      headers.set('x-goog-api-key', __AI_KEY__);
                    }
                    nextInit.headers = headers;
                    if (input instanceof Request) {
                      const request = new Request(input, nextInit);
                      return originalFetch.call(this, request);
                    }
                    return originalFetch.call(this, input, nextInit);
                  }
                } catch (err) {
                  console.warn('[thesara] ai_fetch_shim_failed', err);
                }
                return originalFetch.call(this, input, init);
              };
            }
          })();
        `
        : '';
      const shimScript = `
        <script>
          window.__THESARA_APP_NS = ${JSON.stringify('app:' + String(listingId))};
          window.__THESARA_APP_ID__ = ${JSON.stringify(String(listingId))};
          window.thesara = window.thesara || {};
          window.thesara.app = Object.assign({}, window.thesara.app, { id: ${JSON.stringify(String(listingId))} });
          ${aiSnippet}
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
    if (process.env.BUNDLE_WORKER_SKIP_CLEANUP === '1') {
      console.log('[bundle-worker] Skipping cleanup (BUNDLE_WORKER_SKIP_CLEANUP=1).');
    } else {
      // 3. Cleanup temporary zip file and per-build npm cache
      await fs.rm(zipPath, { force: true });
      await fs.rm(npmCacheDir, { recursive: true, force: true });
      await fs.rm(workspaceDir, { recursive: true, force: true });
      await fs.rm(uploadRoot, { recursive: true, force: true });
      console.log('[bundle-worker] Cleaned up temporary zip file and workspace.');
    }
  }
}

export function startBundleBuildWorker(): BundleBuildWorkerHandle {
  if (process.env.CREATEX_WORKER_ENABLED !== 'true') {
    console.warn('[bundle-worker] CREATEX_WORKER_ENABLED is not "true" – worker disabled');
    return { close: async () => { } };
  }
  console.log('[bundle-worker] Starting bundle build worker...');
  let handle: BundleBuildWorkerHandle = { close: async () => { } };

  const start = async () => {
    queueConnection = await resolveRedisConnection();
    if (!queueConnection) {
      console.warn('[bundle-worker] Redis connection not configured – worker disabled');
      return;
    }
    const worker = new Worker(
      BUNDLE_BUILD_QUEUE_NAME,
      async (job) => {
        const { buildId, zipPath, llmApiKey, customAssets } = job.data as {
          buildId: string;
          zipPath: string;
          llmApiKey?: string;
          customAssets?: { name: string; path: string }[];
        };
        console.log(`[bundle-worker] Processing job: ${buildId}`);
        try {
          sseEmitter.emit(buildId, 'status', { status: 'bundling' });
          await updateBuild(buildId, { state: 'build', progress: 20, error: undefined });

          await runBundleBuildProcess(buildId, zipPath, { llmApiKey, customAssets });

          await updateBuild(buildId, { state: 'pending_review', progress: 100 });

          const listingId = (await getBuildData(buildId))?.listingId;
          sseEmitter.emit(buildId, 'final', { status: 'success', buildId, listingId });

        } catch (err: any) {
          console.error(`[bundle-worker] Job ${buildId} failed:`, err);
          const reason = err?.message || 'Unknown error';
          const meta = await getBuildData(buildId);
          const friendly = getFriendlyFailureMessage(meta?.creatorLanguage);
          await updateBuild(buildId, {
            state: 'failed',
            progress: 100,
            error: reason,
            publicMessage: friendly,
          });
          await notifyBuildFailureAdmins({
            buildId,
            reason,
            error: err,
            meta,
            llmApiKey,
            customAssets,
          });
          sseEmitter.emit(buildId, 'final', {
            status: 'failed',
            reason: friendly,
            detailReason: reason,
            buildId,
            listingId: meta?.listingId,
          });
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
