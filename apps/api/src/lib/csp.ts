import { createHash } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import { load, type Cheerio, type CheerioOptions } from 'cheerio';
import * as esbuild from 'esbuild';

interface VendoredResource {
  url: string;
  localPath: string;
  size: number;
  hash: string;
  type: 'script' | 'style' | 'module' | 'other';
}

export interface InlineScriptReport {
  fileName: string;
  hash: string;
  size: number;
  module: boolean;
}

interface InlineStyleReport {
  tag: string;
  location: string;
  snippet: string;
}

interface InlineEventHandlerReport {
  tag: string;
  attribute: string;
  snippet: string;
}

interface ModuleBundleReport {
  created: boolean;
  inputs: number;
  warnings: string[];
}

interface RoomsEntry {
  src: string;
  attrs?: Record<string, string>;
}

export interface HtmlTransformResult {
  changed: boolean;
  baseRemoved: boolean;
  inlineScripts: InlineScriptReport[];
  totalInlineScripts: number;
  inlineStyles: InlineStyleReport[];
  totalInlineStyles: number;
  inlineEventHandlers: InlineEventHandlerReport[];
  vendored: VendoredResource[];
  moduleBundle: ModuleBundleReport;
  warnings: string[];
}

export interface HtmlTransformOptions {
  indexPath: string;
  rootDir?: string;
  extractInlineScripts?: boolean;
  extractInlineStyleTags?: boolean;
  bundleModuleScripts?: boolean;
  vendorExternalResources?: boolean;
  vendorMaxBytes?: number;
  vendorTimeoutMs?: number;
  failOnInlineHandlers?: boolean;
  
  apiBase?: string;
  log?: (message: string) => void;
}

function makeRoomsConfigScript(keys: string[], entries: RoomsEntry[], apiBase?: string) {
  const normalisedEntries = entries.map((entry) => {
    const attrs =
      entry.attrs && Object.keys(entry.attrs).length > 0 ? entry.attrs : undefined;
    return {
      src: entry.src,
      ...(attrs ? { attrs } : {}),
    };
  });
  const firstEntry = normalisedEntries[0]?.src ?? null;
  const config: Record<string, unknown> = {
    keys,
    entries: normalisedEntries,
    entry: firstEntry,
    ...(apiBase ? { apiBase } : {}),
  };
  const lines = [
    `window.__THESARA_ROOMS_CONFIG__ = ${JSON.stringify(config)};`,
    'window.__THESARA_ROOMS_KEYS__ = window.__THESARA_ROOMS_CONFIG__.keys;',
    'window.__THESARA_ROOMS_ENTRIES__ = window.__THESARA_ROOMS_CONFIG__.entries;',
    'window.__THESARA_ROOMS_ENTRY__ = window.__THESARA_ROOMS_CONFIG__.entry;',
  ];
  if (apiBase) {
    lines.push('window.__THESARA_API_BASE__ = window.__THESARA_ROOMS_CONFIG__.apiBase;');
  }
  lines.push('');
  return lines.join('\n');
}





const DEFAULT_VENDOR_LIMIT = 20 * 1024 * 1024; // 20 MB
const DEFAULT_VENDOR_TIMEOUT = 15000; // 15s

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function toPosix(input: string): string {
  return input.replace(/\\/g, '/');
}

function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned.length ? cleaned : '_';
}

async function writeFileUnique(baseDir: string, baseName: string, ext: string, contents: string | Buffer) {
  await fs.mkdir(baseDir, { recursive: true });
  let candidate = `${baseName}${ext}`;
  let counter = 0;
  while (await pathExists(path.join(baseDir, candidate))) {
    counter += 1;
    candidate = `${baseName}-${counter}${ext}`;
  }
  const outPath = path.join(baseDir, candidate);
  await fs.writeFile(outPath, contents);
  return outPath;
}

async function downloadResource(
  url: string,
  options: { timeoutMs: number; remainingBudget: () => number; consumeBudget: (size: number) => void },
): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs));
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(`download_failed_${res.status}`);
    }
    const reader = Readable.fromWeb(res.body as unknown as ReadableStream<any>);
    const chunks: Buffer[] = [];
    let downloaded = 0;
    for await (const chunk of reader) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      downloaded += buf.length;
      if (downloaded > options.remainingBudget()) {
        throw new Error('download_limit_exceeded');
      }
      chunks.push(buf);
    }
    options.consumeBudget(downloaded);
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
  }
}

function inferExtension(pathname: string, fallback: '.js' | '.css' | '.bin' = '.js'): string {
  const ext = path.extname(pathname);
  if (ext) return ext;
  return fallback;
}

interface ModuleEntry {
  element: Cheerio<any>;
  sourcePath: string;
}

/**
 * Performs CSP-friendly transformations on index.html:
 *  - normalises root-relative urls
 *  - removes <base> tags (CSP base-uri 'none')
 *  - lifts inline <script> into external files
 *  - vendorizira eksterne skripte/stylesheetove
 *  - bundla module <script type="module"> u jedan app.js
 *  - prikuplja lint izvještaj za inline stilove i event handlere
 */
export async function transformHtmlLite(options: HtmlTransformOptions): Promise<HtmlTransformResult> {
  const { indexPath, log } = options;
  const rootDir = options.rootDir || path.dirname(indexPath);
  const extractInlineScripts = options.extractInlineScripts !== false;
  const extractInlineStyleTags = options.extractInlineStyleTags === true;
  const bundleModules = options.bundleModuleScripts !== false;
  const vendorEnabled = options.vendorExternalResources !== false;
  const vendorMaxBytes = options.vendorMaxBytes ?? DEFAULT_VENDOR_LIMIT;
  const vendorTimeoutMs = options.vendorTimeoutMs ?? DEFAULT_VENDOR_TIMEOUT;

  if (!(await pathExists(indexPath))) {
    return {
      changed: false,
      baseRemoved: false,
      inlineScripts: [],
      totalInlineScripts: 0,
      inlineStyles: [],
      totalInlineStyles: 0,
      inlineEventHandlers: [],
      vendored: [],
      moduleBundle: { created: false, inputs: 0, warnings: [] },
      warnings: [],
    };
  }

  let originalHtml = await fs.readFile(indexPath, 'utf8');
  let workingHtml = originalHtml;

  workingHtml = workingHtml
    .replace(/(src|href)\s*=\s*(['"])\/(?!\/)/gi, '$1=$2./')
    .replace(/url\(\s*(['"])\/(?!\/)/gi, 'url($1./');

  const hadBaseTag = /<base\b[^>]*>/i.test(workingHtml);
  if (hadBaseTag) {
    workingHtml = workingHtml.replace(/<base\b[^>]*>/gi, '');
    log?.('[csp] removed <base> tag');
  }

  let doctype = '';
  const doctypeMatch = workingHtml.match(/^\s*<!doctype[^>]*>/i);
  if (doctypeMatch) {
    doctype = doctypeMatch[0];
    workingHtml = workingHtml.slice(doctypeMatch.index! + doctype.length);
  }

  const cheerioOptions: CheerioOptions & { decodeEntities?: boolean } = {
    decodeEntities: false,
  };
  const $ = load(workingHtml, cheerioOptions);
  await fs.mkdir(rootDir, { recursive: true });

  const inlineScripts: InlineScriptReport[] = [];
  const inlineStyles: InlineStyleReport[] = [];
  const inlineEventHandlers: InlineEventHandlerReport[] = [];
  const vendoredResources: VendoredResource[] = [];
  const warnings: string[] = [];
  const seenScriptHashes = new Map<string, string>();

  // Lint: inline styles/events
  const resolveTagName = (node: unknown): string => {
    const asElement = node as { tagName?: string; name?: string };
    if (typeof asElement.tagName === 'string') {
      return asElement.tagName;
    }
    if (typeof asElement.name === 'string') {
      return asElement.name;
    }
    return 'unknown';
  };

  $('*').each((_, node) => {
    const elem = $(node);
    const attribs = (node as any).attribs || {};
    if (attribs && typeof attribs === 'object') {
      for (const [name, value] of Object.entries(attribs)) {
        if (/^on[a-z]+$/i.test(name)) {
          inlineEventHandlers.push({
            tag: resolveTagName(node),
            attribute: name.toLowerCase(),
            snippet: String(value || '').trim().slice(0, 80),
          });
        }
      }
    }
    if (typeof attribs?.style === 'string' && attribs.style.trim().length > 0) {
      inlineStyles.push({
        tag: resolveTagName(node),
        location: 'attribute',
        snippet: attribs.style.trim().slice(0, 120),
      });
    }
  });

  if (options.failOnInlineHandlers && inlineEventHandlers.length > 0) {
    throw new Error('inline_event_handlers_detected');
  }

  if (extractInlineStyleTags) {
    const styleNodes = $('style').toArray();
    for (let idx = 0; idx < styleNodes.length; idx += 1) {
      const styleEl = styleNodes[idx];
      const elem = $(styleEl);
      const content = elem.html() ?? '';
      if (!content.trim()) continue;
      const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      const fileName = `inline-style-${hash}.css`;
      await fs.writeFile(path.join(rootDir, fileName), content, 'utf8');
      elem.replaceWith(`<link rel="stylesheet" href="./${fileName}" />`);
      inlineStyles.push({
        tag: 'style',
        location: `tag#${idx}`,
        snippet: content.trim().slice(0, 120),
      });
    }
  } else {
    const styleNodes = $('style').toArray();
    for (let idx = 0; idx < styleNodes.length; idx += 1) {
      const styleEl = styleNodes[idx];
      const content = $(styleEl).html() ?? '';
      if (!content.trim()) continue;
      inlineStyles.push({
        tag: 'style',
        location: `tag#${idx}`,
        snippet: content.trim().slice(0, 120),
      });
    }
  }

  let totalInlineScripts = 0;
  const moduleEntries: ModuleEntry[] = [];

  let totalDownloaded = 0;
  const vendorCache = new Map<string, VendoredResource>();

  const consumeBudget = (size: number) => {
    totalDownloaded += size;
  };
  const remainingBudget = () => Math.max(0, vendorMaxBytes - totalDownloaded);

  const vendorResource = async (
    url: string,
    kind: VendoredResource['type'],
  ): Promise<VendoredResource> => {
    if (!vendorEnabled) {
      throw new Error('vendor_disabled');
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('unsupported_protocol');
    }
    const cached = vendorCache.get(url);
    if (cached) return cached;

    const buffer = await downloadResource(url, {
      timeoutMs: vendorTimeoutMs,
      remainingBudget,
      consumeBudget,
    });
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const urlObj = new URL(url);
    const rawPath = urlObj.pathname || '/';
    const fallbackExt = kind === 'style' ? '.css' : '.js';
    const ext = inferExtension(rawPath, fallbackExt);
    const fileBase = path.basename(rawPath) || `asset${ext}`;
    const baseName = sanitizeSegment(fileBase.replace(ext, '')) || 'asset';
    const dirSegments = rawPath
      .split('/')
      .filter(Boolean)
      .slice(0, -1)
      .map(sanitizeSegment);
    const vendorDir = path.join(rootDir, 'vendor', sanitizeSegment(urlObj.hostname), ...dirSegments);
    const fileName = `${baseName}-${hash}${ext}`;
    const destPath = path.join(vendorDir, fileName);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, buffer);

    const relativePath = toPosix(path.relative(rootDir, destPath)).replace(/^\.\.(\/|$)/, './');
    const record: VendoredResource = {
      url,
      localPath: `./${relativePath}`,
      size: buffer.length,
      hash,
      type: kind,
    };
    vendoredResources.push(record);
    vendorCache.set(url, record);
    log?.(`[csp] vendored ${kind} ${url} -> ${record.localPath} (${buffer.length} bytes)`);
    return record;
  };

  for (const scriptNode of $('script').toArray()) {
    const elem = $(scriptNode);
    const typeAttr = (elem.attr('type') || '').toLowerCase();
    const isModule = typeAttr === 'module';
    const srcAttr = elem.attr('src');
    if (srcAttr && /^https?:\/\//i.test(srcAttr)) {
      try {
        const vendored = await vendorResource(srcAttr, isModule ? 'module' : 'script');
        elem.attr('src', vendored.localPath);
        elem.removeAttr('integrity');
        elem.removeAttr('crossorigin');
      } catch (err: any) {
        warnings.push(`vendor_failed:${srcAttr}:${err?.message || err}`);
      }
    }

    if (isModule) {
      let modulePath = elem.attr('src') || '';
      if (!modulePath) {
        const rawContent = elem.html() ?? '';
        if (!rawContent.trim()) {
          elem.text('');
          continue;
        }
        totalInlineScripts++;
        const hash = createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
        const fileName = `module-inline-${hash}.js`;
        await fs.writeFile(path.join(rootDir, fileName), rawContent, 'utf8');
        elem.text('');
        elem.attr('src', `./${fileName}`);
        modulePath = `./${fileName}`;
        inlineScripts.push({
          fileName,
          hash,
          size: Buffer.byteLength(rawContent),
          module: true,
        });
      }
      if (!modulePath.startsWith('.')) {
        modulePath = `./${modulePath}`;
      }
      moduleEntries.push({
        element: elem,
        sourcePath: toPosix(modulePath),
      });
      continue;
    }

    if (!extractInlineScripts) continue;

    if (srcAttr && srcAttr.trim().length > 0) {
      continue;
    }
    const rawContent = elem.html() ?? '';
    const trimmed = rawContent.trim();
    if (!trimmed.length) {
      elem.text('');
      continue;
    }
    totalInlineScripts++;
    const hash = createHash('sha256').update(rawContent).digest('hex').slice(0, 16);
    let fileName = seenScriptHashes.get(hash);
    if (!fileName) {
      fileName = `inline-${hash}.js`;
      seenScriptHashes.set(hash, fileName);
      await fs.writeFile(path.join(rootDir, fileName), rawContent, 'utf8');
      inlineScripts.push({ fileName, hash, size: Buffer.byteLength(rawContent), module: false });
      log?.(`[csp] inline script extracted -> ${fileName}`);
    }
    elem.attr('src', `./${fileName}`);
    elem.attr('defer', 'true');
    elem.text('');
  }

  // Vendorizacija linkova (CSS)
  for (const linkNode of $('link').toArray()) {
    const elem = $(linkNode);
    const rel = (elem.attr('rel') || '').toLowerCase();
    if (!['stylesheet', 'preload', 'modulepreload'].includes(rel)) continue;
    const href = elem.attr('href');
    if (!href || !/^https?:\/\//i.test(href)) continue;
    try {
      const type: VendoredResource['type'] = rel === 'stylesheet' ? 'style' : 'other';
      const vendored = await vendorResource(href, type);
      elem.attr('href', vendored.localPath);
      elem.removeAttr('integrity');
      elem.removeAttr('crossorigin');
    } catch (err: any) {
      warnings.push(`vendor_failed:${href}:${err?.message || err}`);
    }
  }

  // Bundle module scripts
  const moduleBundle: ModuleBundleReport = { created: false, inputs: moduleEntries.length, warnings: [] };
  if (bundleModules && moduleEntries.length > 0) {
    const tempDir = path.join(rootDir, '__csp_bundle');
    const entryFile = path.join(tempDir, '__entry.js');
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.mkdir(tempDir, { recursive: true });
      const entryDir = path.dirname(entryFile);
      const importLines = moduleEntries.map((entry) => {
        const targetPath = entry.sourcePath.replace(/^\.\//, '');
        const absTarget = path.resolve(rootDir, targetPath);
        const relative = path.relative(entryDir, absTarget);
        let spec = toPosix(relative);
        if (!spec.startsWith('.')) spec = './' + spec;
        return `import '${spec}';`;
      });
      await fs.writeFile(entryFile, importLines.join('\n') + '\n', 'utf8');
      const outfile = path.join(rootDir, 'app.js');
      const result = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: ['es2018'],
        outfile,
        absWorkingDir: rootDir,
        write: true,
        allowOverwrite: true,
        logLevel: 'silent',
      });
      moduleEntries.forEach((entry) => entry.element.remove());
      const newScript = $('<script></script>');
      newScript.attr('src', './app.js');
      newScript.attr('defer', 'true');
      $('body').append('\n  ');
      $('body').append(newScript);
      moduleBundle.created = true;
      moduleBundle.inputs = moduleEntries.length;
      moduleBundle.warnings = result.warnings?.map((w) => w.text) ?? [];
      if (moduleBundle.warnings.length) {
        warnings.push(...moduleBundle.warnings.map((t) => `esbuild:${t}`));
      }
      log?.(`[csp] bundled ${moduleEntries.length} module script(s) -> app.js`);
    } catch (err: any) {
      warnings.push(`module_bundle_failed:${err?.message || err}`);
      log?.(`[csp] module bundle failed: ${err?.message || err}`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
  const htmlOptions: CheerioOptions & { decodeEntities?: boolean } = {
    decodeEntities: false,
  };
  const serialised = $.html(htmlOptions);
  let finalHtml = doctype ? `${doctype}\n${serialised}` : serialised;
  if (originalHtml.endsWith('\n') && !finalHtml.endsWith('\n')) {
    finalHtml += '\n';
  }

  const changed = finalHtml !== originalHtml;
  if (changed) {
    await fs.writeFile(indexPath, finalHtml, 'utf8');
  }

  return {
    changed,
    baseRemoved: hadBaseTag,
    inlineScripts,
    totalInlineScripts,
    inlineStyles,
    totalInlineStyles: inlineStyles.length,
    inlineEventHandlers,
    vendored: vendoredResources,
    moduleBundle,
    warnings,
  };
}
