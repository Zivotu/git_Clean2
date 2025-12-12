import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { getBucket } from '../storage.js';
import { getBuildDir, PREVIEW_ROOT } from '../paths.js';
import { AppError } from '../lib/errors.js';
import { fileExists, dirExists } from '../lib/fs.js';
import * as tar from 'tar';
import type { SafePublishResult } from '../safePublish.js';

function injectBaseHref(html: string, baseHref: string): string {
  const baseRegex = /<base\s+[^>]*href\s*=\s*["'][^"']*["'][^>]*>/i;
  const baseTag = `<base href="${baseHref}">`;
  if (baseRegex.test(html)) return html.replace(baseRegex, baseTag);
  const headRegex = /<head[^>]*>/i;
  const match = html.match(headRegex);
  if (match) return html.replace(match[0], `${match[0]}\n${baseTag}`);
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

function rewriteAbsoluteAssetUrls(html: string): string {
  const absoluteRegex = /(src|href)\s*=\s*(['"])\/(?!\/|https?:|data:)([^"' ]*)(\2)/gi;
  const buildPrefixRegex = /(src|href)\s*=\s*(['"])(?:\.\/)?build\/([^"' ]*)(\2)/gi;

  const rewrite = (match: string, attr: string, quote: string, pathPart: string) => {
    const lowered = String(pathPart || '').toLowerCase();
    if (
      !pathPart ||
      lowered.startsWith('shims/') ||
      lowered.startsWith('builds/') ||
      lowered.startsWith('api/')
    ) {
      return match;
    }
    const normalizedPath = pathPart.startsWith('./') ? pathPart : `./${pathPart}`;
    return `${attr}=${quote}${normalizedPath}${quote}`;
  };

  let nextHtml = html.replace(absoluteRegex, (match, attr, quote, pathPart) =>
    rewrite(match, attr, quote, pathPart),
  );
  nextHtml = nextHtml.replace(buildPrefixRegex, (match, attr, quote, pathPart) => {
    const sanitized = pathPart.startsWith('./') ? pathPart : pathPart;
    return `${attr}=${quote}./${sanitized.replace(/^\.\/+/, '')}${quote}`;
  });
  return nextHtml;
}

async function sanitizeBundleIndex(dir: string, buildId: string): Promise<void> {
  const indexPath = path.join(dir, 'index.html');
  try {
    let html = await fs.readFile(indexPath, 'utf8');
    html = stripDisallowedScripts(html);
    html = injectBaseHref(html, `/builds/${buildId}/bundle/`);
    html = rewriteAbsoluteAssetUrls(html);
    await fs.writeFile(indexPath, html, 'utf8');
  } catch (err) {
    console.warn('sanitizeBundleIndex_failed', { dir, buildId, err });
  }
}

function normaliseScriptReference(baseDir: string, scriptSrc: string): string | null {
  if (!scriptSrc) return null;
  const trimmed = scriptSrc.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) return null;
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? '';
  if (!withoutQuery) return null;
  let relativePath = withoutQuery;
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.slice(1);
  }
  relativePath = relativePath.replace(/^\.\/+/, '');
  if (!relativePath) return null;
  return path.resolve(baseDir, relativePath);
}

async function findFirstJsRecursive(dir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const jsFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.js'))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (jsFiles.length) {
      return path.join(dir, jsFiles[0].name);
    }
    for (const subDir of entries.filter((entry) => entry.isDirectory())) {
      const nested = await findFirstJsRecursive(path.join(dir, subDir.name));
      if (nested) return nested;
    }
  } catch {
    // ignore
  }
  return null;
}

async function detectEntrypointScript(searchDir: string): Promise<string | null> {
  const indexPath = path.join(searchDir, 'index.html');
  let html: string | null = null;
  try {
    html = await fs.readFile(indexPath, 'utf8');
  } catch {
    html = null;
  }

  if (html) {
    const scriptRegex = /<script\b[^>]*\bsrc\s*=\s*(['"])([^"'#?]+\.js(?:[?#][^"' ]*)?)\1[^>]*>/gi;
    type Candidate = { path: string; priority: number };
    const candidates: Candidate[] = [];
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html))) {
      const rawSrc = match[2];
      const absolutePath = normaliseScriptReference(searchDir, rawSrc);
      if (!absolutePath) continue;
      let priority = 0;
      const tag = match[0];
      if (/type\s*=\s*['"]module['"]/i.test(tag)) priority += 5;
      if (/index|main|app/i.test(rawSrc)) priority += 3;
      if (/crossorigin/i.test(tag)) priority += 1;
      candidates.push({ path: absolutePath, priority });
    }
    candidates.sort((a, b) => b.priority - a.priority);
    for (const candidate of candidates) {
      if (await fileExists(candidate.path)) {
        return candidate.path;
      }
    }
  }

  const assetsDir = path.join(searchDir, 'assets');
  if (await dirExists(assetsDir)) {
    const assetJs = await findFirstJsRecursive(assetsDir);
    if (assetJs) return assetJs;
  }
  return findFirstJsRecursive(searchDir);
}

export type BuildState =
  | 'queued'
  | 'init'
  | 'analyze'
  | 'build'
  | 'bundle'
  | 'verify'
  | 'ai_scan'
  | 'llm_waiting'
  | 'llm_generating'
  | 'pending_review'
  | 'pending_review_llm'
  | 'approved'
  | 'publishing'
  | 'publish_failed'
  | 'published'
  | 'rejected'
  | 'failed'
  | 'deleted';

export interface BuildRecord {
  id: string;
  state: BuildState;
  progress: number;
  timeline: Array<{ state: BuildState; at: number }>;
  createdAt: number;
  error?: string;
  publicMessage?: string;
  errorAnalysis?: string; // AI-generated user-friendly error explanation
  errorFixPrompt?: string; // AI-generated prompt to fix the error
  errorCategory?: 'syntax' | 'dependency' | 'build-config' | 'runtime' | 'unknown';
  creatorLanguage?: string;
  reasons?: string[];
  llmAttempts?: number;
  llmAttemptWindowStart?: number;
  // relative path to stored LLM review report (llm.json)
  llmReportPath?: string;
  networkPolicy?: 'NO_NET' | 'MEDIA_ONLY' | 'OPEN_NET';
  networkPolicyReason?: string;
  previousState?: Exclude<BuildState, 'deleted'>;
  deletedAt?: number;
}

const { BUNDLE_STORAGE_PATH } = getConfig();
const BUILDS_ROOT = path.join(BUNDLE_STORAGE_PATH, 'builds');
const INDEX_PATH = path.join(BUILDS_ROOT, 'index.json');

interface BuildIndexEntry {
  id: string;
  createdAt: number;
}

async function readIndex(): Promise<BuildIndexEntry[]> {
  try {
    const txt = await fs.readFile(INDEX_PATH, 'utf8');
    return JSON.parse(txt) as BuildIndexEntry[];
  } catch {
    return [];
  }
}

async function writeIndex(items: BuildIndexEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(INDEX_PATH, JSON.stringify(items, null, 2));
}

async function ensureIndexEntry(id: string, createdAt: number): Promise<void> {
  const idx = await readIndex();
  if (!idx.find((e) => e.id === id)) {
    idx.push({ id, createdAt });
    idx.sort((a, b) => b.createdAt - a.createdAt);
    await writeIndex(idx);
  }
}

function recordPath(id: string): string {
  return path.join(BUILDS_ROOT, id, 'build.json');
}

export async function readBuild(id: string): Promise<BuildRecord | undefined> {
  try {
    const txt = await fs.readFile(recordPath(id), 'utf8');
    return JSON.parse(txt) as BuildRecord;
  } catch {
    return undefined;
  }
}

export async function writeBuild(rec: BuildRecord): Promise<void> {
  const p = recordPath(rec.id);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(rec, null, 2));
  await ensureIndexEntry(rec.id, rec.createdAt);
}

export async function initBuild(id: string): Promise<BuildRecord> {
  const rec: BuildRecord = {
    id,
    state: 'queued',
    progress: 0,
    timeline: [{ state: 'queued', at: Date.now() }],
    createdAt: Date.now(),
  };
  await writeBuild(rec);
  return rec;
}

export async function updateBuild(
  id: string,
  patch: Partial<
    Pick<
      BuildRecord,
      |
      'state'
      | 'progress'
      | 'error'
      | 'publicMessage'
      | 'errorAnalysis'
      | 'errorFixPrompt'
      | 'errorCategory'
      | 'reasons'
      | 'creatorLanguage'
      | 'llmReportPath'
      | 'networkPolicy'
      | 'networkPolicyReason'
      | 'llmAttempts'
      | 'llmAttemptWindowStart'
      | 'previousState'
      | 'deletedAt'
    >
  >,
): Promise<BuildRecord> {
  const current = (await readBuild(id)) || (await initBuild(id));
  const next: BuildRecord = { ...current, ...patch };
  if (patch.state && patch.state !== current.state) {
    next.timeline = [...current.timeline, { state: patch.state, at: Date.now() }];
  } else {
    next.timeline = current.timeline;
  }
  await writeBuild(next);
  return next;
}

export async function applyPipelineResult(
  id: string,
  result: SafePublishResult,
): Promise<BuildRecord> {
  const stateMap: Record<SafePublishResult['status'], BuildState> = {
    approved: 'approved',
    'pending-review': 'pending_review',
    'pending-review-llm': 'pending_review_llm',
    rejected: 'rejected',
  };
  const patch: Partial<BuildRecord> = { state: stateMap[result.status] };
  if (result.status === 'pending-review' || result.status === 'rejected') {
    patch.reasons = result.reasons;
    patch.error = result.reasons?.[0];
  }
  return updateBuild(id, patch);
}

export async function listBuilds(
  cursor?: number,
  limit = 20,
): Promise<{ items: BuildRecord[]; nextCursor?: number }> {
  const index = await readIndex();
  const sorted = index.sort((a, b) => b.createdAt - a.createdAt);
  const filtered = cursor ? sorted.filter((e) => e.createdAt < cursor) : sorted;
  const slice = filtered.slice(0, limit);
  const items: BuildRecord[] = [];
  for (const entry of slice) {
    const rec = await readBuild(entry.id);
    if (rec) items.push(rec);
  }
  const nextCursor = filtered.length > limit ? slice[slice.length - 1]?.createdAt : undefined;
  return { items, nextCursor };
}

export interface ArtifactInfo {
  exists: boolean;
  url?: string;
}

export interface BuildArtifacts {
  preview: ArtifactInfo;
  ast: ArtifactInfo;
  manifest: ArtifactInfo;
  llm: ArtifactInfo;
  bundle: ArtifactInfo;
  imports: ArtifactInfo;
  transformPlan: ArtifactInfo;
  transformReport: ArtifactInfo;
  previewIndex: ArtifactInfo;
  networkPolicy?: string;
  networkPolicyReason?: string;
}

export async function getBuildArtifacts(id: string): Promise<BuildArtifacts> {
  const dir = getBuildDir(id);
  const buildDir = path.join(dir, 'build');
  const astPath = path.join(buildDir, 'AST_SUMMARY.json');
  const manifestPath = path.join(buildDir, 'manifest_v1.json');
  const planPath = path.join(buildDir, 'transform_plan_v1.json');
  const reportPath = path.join(buildDir, 'transform_report_v1.json');
  const importsPath = path.join(buildDir, 'imports_v1.json');
  const llmPath = path.join(dir, 'llm.json');
  const rec = await readBuild(id);
  const bucket = getBucket();
  const bundleFile = bucket.file(`builds/${id}/bundle.tar.gz`);
  const [bundleExists] = await bundleFile.exists();
  // Also expose bundle if local build directory exists (pre-publish fallback)
  const localBundleDir = path.join(getBuildDir(id), 'bundle');
  const localBundleExists = await dirExists(localBundleDir);

  // Bundle-first: provjeri postoji li `bundle/index.html`
  const bundleIndexPath = path.join(BUNDLE_STORAGE_PATH, 'builds', id, 'bundle', 'index.html');
  const bundleIndexExists = await fileExists(bundleIndexPath);

  // Fallback: provjeri postoji li legacy preview
  const legacyPreviewPath = path.join(PREVIEW_ROOT, id, 'index.html');
  const legacyPreviewExists = await fileExists(legacyPreviewPath);

  let previewIndex: ArtifactInfo;
  if (bundleIndexExists) {
    previewIndex = { exists: true, url: `/review/builds/${id}/bundle/index.html` };
  } else if (legacyPreviewExists) {
    previewIndex = { exists: true, url: `/review/previews/${id}/index.html` };
  } else {
    previewIndex = { exists: false };
  }

  return {
    ast: (await fileExists(astPath))
      ? { exists: true, url: `/builds/${id}/build/AST_SUMMARY.json` }
      : { exists: false },
    manifest: (await fileExists(manifestPath))
      ? { exists: true, url: `/builds/${id}/build/manifest_v1.json` }
      : { exists: false },
    llm: (await fileExists(llmPath))
      ? { exists: true, url: `/review/builds/${id}/llm` }
      : { exists: false },
    bundle: bundleExists || localBundleExists
      ? { exists: true, url: `/review/code/${id}` }
      : { exists: false },
    imports: (await fileExists(importsPath))
      ? { exists: true, url: `/builds/${id}/build/imports_v1.json` }
      : { exists: false },
    transformPlan: (await fileExists(planPath))
      ? { exists: true, url: `/builds/${id}/build/transform_plan_v1.json` }
      : { exists: false },
    transformReport: (await fileExists(reportPath))
      ? { exists: true, url: `/builds/${id}/build/transform_report_v1.json` }
      : { exists: false },
    preview: previewIndex,
    previewIndex,
    networkPolicy: rec?.networkPolicy,
    networkPolicyReason: rec?.networkPolicyReason,
  };
}

export interface BuildInfoMetadata {
  listingId?: string;
  creatorLanguage?: string;
  appTitle?: string;
  slug?: string;
  authorUid?: string;
  authorName?: string;
  authorHandle?: string;
  authorEmail?: string;
  submitterUid?: string;
  submitterEmail?: string;
  submittedAt?: number;
}

const BUILD_INFO_FILENAME = 'build-info.json';

async function readBuildInfoFile(id: string): Promise<BuildInfoMetadata> {
  try {
    const dir = getBuildDir(id);
    const raw = await fs.readFile(path.join(dir, BUILD_INFO_FILENAME), 'utf8');
    return JSON.parse(raw) as BuildInfoMetadata;
  } catch {
    return {};
  }
}

export async function writeBuildInfo(id: string, patch: BuildInfoMetadata): Promise<void> {
  const dir = getBuildDir(id);
  await fs.mkdir(dir, { recursive: true });
  const current = await readBuildInfoFile(id);
  const next: BuildInfoMetadata = { ...current, ...patch };
  await fs.writeFile(path.join(dir, BUILD_INFO_FILENAME), JSON.stringify(next, null, 2), 'utf8');
}

// Lightweight metadata persisted by publish routes for worker to read
export async function getBuildData(id: string): Promise<BuildInfoMetadata | undefined> {
  try {
    return await readBuildInfoFile(id);
  } catch {
    return undefined;
  }
}

export async function publishBundle(id: string): Promise<string> {
  // Prefer whichever directory already contains a full bundle (build/ first, then bundle/)
  const baseDir = path.join(BUILDS_ROOT, id);
  await fs.mkdir(baseDir, { recursive: true });
  const buildCandidate = path.join(baseDir, 'build');
  const bundleCandidate = path.join(baseDir, 'bundle');
  const candidates = [buildCandidate, bundleCandidate];

  let src: string | null = null;
  for (const candidate of candidates) {
    if (!(await dirExists(candidate))) continue;
    const hasIndex = await fileExists(path.join(candidate, 'index.html'));
    if (hasIndex) {
      src = candidate;
      break;
    }
    if (!src) src = candidate;
  }

  if (!src) {
    throw new AppError('BUNDLE_SRC_NOT_FOUND');
  }

  // verify essential files exist before publishing; if missing try to hydrate from root copies
  const required = ['index.html'];
  for (const file of required) {
    const target = path.join(src, file);
    const rootCopy = path.join(baseDir, file);
    if (!(await fileExists(target))) {
      if (await fileExists(rootCopy)) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(rootCopy, target);
      }
    }
    if (!(await fileExists(target))) {
      throw new AppError(
        'BUILD_REQUIRED_FILE_MISSING',
        `Missing required file(s): ${file}`,
      );
    }
  }

  const cfg = getConfig();
  const publicUrl = `/public/builds/${id}/index.html`;

  const copyDir = async (from: string, to: string): Promise<void> => {
    if (from === to) return;
    await fs.mkdir(to, { recursive: true });
    const entries = await fs.readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      const fromPath = path.join(from, entry.name);
      const toPath = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await copyDir(fromPath, toPath);
      } else {
        await fs.copyFile(fromPath, toPath);
      }
    }
  };

  const firstExisting = async (paths: string[]): Promise<string | null> => {
    for (const candidate of paths) {
      if (await fileExists(candidate)) return candidate;
    }
    return null;
  };

  const canonicalBundleDir = bundleCandidate;
  if (src !== canonicalBundleDir) {
    await fs.rm(canonicalBundleDir, { recursive: true, force: true });
    await copyDir(src, canonicalBundleDir);
  }
  await sanitizeBundleIndex(canonicalBundleDir, id);
  src = canonicalBundleDir;

  const canonicalBuildDir = buildCandidate;
  if (src !== canonicalBuildDir) {
    await fs.rm(canonicalBuildDir, { recursive: true, force: true });
    await copyDir(src, canonicalBuildDir);
  }
  await sanitizeBundleIndex(canonicalBuildDir, id);

  const ensureRootFile = async (name: string) => {
    const dest = path.join(baseDir, name);
    const source =
      (await firstExisting([path.join(src, name)])) ??
      (await firstExisting([path.join(canonicalBuildDir, name)])) ??
      (await firstExisting([dest]));
    if (!source) {
      throw new AppError(
        'BUILD_REQUIRED_FILE_MISSING',
        `Missing required file(s): ${name}`,
      );
    }
    if (source !== dest) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(source, dest);
    }
  };

  await ensureRootFile('index.html');

  const ensureAppEntrypoint = async () => {
    const bundleApp = path.join(src, 'app.js');
    const canonicalApp = path.join(canonicalBuildDir, 'app.js');
    if (!(await fileExists(bundleApp)) && !(await fileExists(canonicalApp))) {
      const resolved =
        (await detectEntrypointScript(canonicalBuildDir)) ?? (await detectEntrypointScript(src));
      if (resolved) {
        await fs.mkdir(path.dirname(canonicalApp), { recursive: true });
        await fs.copyFile(resolved, canonicalApp);
        await fs.mkdir(path.dirname(bundleApp), { recursive: true });
        await fs.copyFile(canonicalApp, bundleApp);
        console.log(
          `publishBundle: synthesized app.js from ${path.relative(canonicalBuildDir, resolved)}`,
        );
      }
    }
    await ensureRootFile('app.js');
  };

  await ensureAppEntrypoint();

  const manifestCandidates = [
    path.join(src, 'manifest_v1.json'),
    path.join(canonicalBuildDir, 'manifest_v1.json'),
    path.join(baseDir, 'manifest_v1.json'),
    path.join(src, 'manifest.json'),
    path.join(canonicalBuildDir, 'manifest.json'),
  ];
  let manifestSource = await firstExisting(manifestCandidates);
  const manifestDest = path.join(baseDir, 'manifest_v1.json');

  if (!manifestSource) {
    let metadata: { name?: string; title?: string; description?: string; networkDomains?: string[] } = {};
    try {
      const rawMeta = await fs.readFile(path.join(baseDir, 'metadata.json'), 'utf8');
      metadata = JSON.parse(rawMeta);
    } catch {
      // best-effort; metadata is optional
    }
    const networkDomains = Array.isArray(metadata.networkDomains)
      ? metadata.networkDomains
        .map((domain) => (domain == null ? undefined : String(domain)))
        .filter((domain): domain is string => Boolean(domain))
      : [];

    const manifestPayload = {
      id,
      entry: 'app.js',
      name: String(metadata.name || metadata.title || 'Untitled Bundle'),
      description: String(metadata.description || ''),
      networkPolicy: 'OPEN_NET',
      networkDomains,
      source: 'bundle-upload',
    };
    await fs.writeFile(manifestDest, JSON.stringify(manifestPayload, null, 2), 'utf8');
    manifestSource = manifestDest;
  }

  if (manifestSource !== manifestDest) {
    await fs.copyFile(manifestSource, manifestDest);
  }
  const manifestBundlePath = path.join(src, 'manifest_v1.json');
  if (!(await fileExists(manifestBundlePath))) {
    await fs.copyFile(manifestDest, manifestBundlePath);
  }
  const manifestBuildPath = path.join(canonicalBuildDir, 'manifest_v1.json');
  if (!(await fileExists(manifestBuildPath))) {
    await fs.copyFile(manifestDest, manifestBuildPath);
  }

  // In local dev mode or non-firebase storage, skip cloud upload and keep local directory.
  // Review download endpoint can stream a tar.gz from this local folder.
  const KEEP_LOCAL_BUNDLE = process.env.KEEP_LOCAL_BUNDLE === 'true';
  if (cfg.STORAGE_DRIVER !== 'firebase') {
    console.log(`publishBundle: skip cloud upload (STORAGE_DRIVER=${cfg.STORAGE_DRIVER})`);
    // Keep local bundle for direct serving under /builds/:id/*
    return publicUrl;
  }

  const tmpTar = path.join(cfg.TMP_PATH, `${id}-bundle.tar.gz`);
  await fs.mkdir(path.dirname(tmpTar), { recursive: true });
  await tar.c({ gzip: true, cwd: src, file: tmpTar }, ['.']);

  const bucket = getBucket();
  console.log('publishBundle: uploading to bucket', bucket.name, `builds/${id}/bundle.tar.gz`);
  await bucket.upload(tmpTar, {
    destination: `builds/${id}/bundle.tar.gz`,
    contentType: 'application/gzip',
  });
  console.log('publishBundle: upload complete');

  // Also upload exploded bundle directory so /public/builds/:id/index.html works
  const uploadDirRecursive = async (dir: string, base: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(base, abs).replace(/\\/g, '/');
      const dest = `builds/${id}/${rel}`;
      if (e.isDirectory()) {
        await uploadDirRecursive(abs, base);
      } else {
        // Set a reasonable content-type for common assets to avoid ORB/CORB issues
        const ext = path.extname(abs).toLowerCase();
        const contentType =
          ext === '.html' ? 'text/html; charset=utf-8'
            : ext === '.js' ? 'application/javascript; charset=utf-8'
              : ext === '.css' ? 'text/css; charset=utf-8'
                : ext === '.json' ? 'application/json; charset=utf-8'
                  : ext === '.png' ? 'image/png'
                    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                      : ext === '.svg' ? 'image/svg+xml'
                        : undefined;
        const metadata: any = {};
        if (contentType) metadata.contentType = contentType;
        metadata.cacheControl = 'public, max-age=600';
        await bucket.upload(abs, { destination: dest, metadata });
      }
    }
  };
  try {
    await uploadDirRecursive(src, src);
    console.log('publishBundle: uploaded exploded bundle directory to bucket');
  } catch (err) {
    console.warn('publishBundle: failed to upload exploded bundle directory', err);
  }

  await fs.rm(tmpTar, { force: true });
  if (!KEEP_LOCAL_BUNDLE) {
    await fs.rm(src, { recursive: true, force: true });
  }

  return publicUrl;
}
