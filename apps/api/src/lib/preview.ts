import path from 'node:path';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { getConfig } from '../config.js';
import type { AppRecord } from '../types.js';

function looksLikeImageAsset(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^data:image\//i.test(trimmed)) return true;
  // Treat known local asset paths as images even when extensions are missing
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/preview-presets/') || trimmed.startsWith('/assets/')) return true;
  // If an absolute URL was provided, examine its pathname
  try {
    const parsed = new URL(trimmed, 'http://example');
    const pathname = parsed.pathname || '';
    if (pathname.startsWith('/uploads/') || pathname.startsWith('/preview-presets/') || pathname.startsWith('/assets/')) return true;
  } catch {}
  const withoutQuery = trimmed.split(/[?#]/)[0];
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(withoutQuery);
}

export function ensureListingPreview(record: AppRecord): { next: AppRecord; changed: boolean } {
  const current = (record.previewUrl || '').trim();
  // Deprecated preview sources which are not image assets
  const deprecated =
    current.startsWith('/builds/') ||
    current.startsWith('/play/') ||
    current.startsWith('/public/builds/') ||
    current.startsWith('/review/builds/');
  if (!current || deprecated || !looksLikeImageAsset(current)) {
    if (!current) {
      return { next: record, changed: false };
    }
    const next: AppRecord = { ...record };
    delete (next as any).previewUrl;
    return { next, changed: next.previewUrl !== record.previewUrl };
  }
  return { next: record, changed: false };
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || randomBytes(4).toString('hex');
}

export async function removeExistingPreviewFile(prevUrl: string | null | undefined): Promise<void> {
  if (!prevUrl) return;
  try {
    // Accept absolute URLs (http(s)...) and extract the pathname
    let candidate = prevUrl;
    try {
      const parsed = new URL(prevUrl);
      candidate = parsed.pathname;
    } catch {
      // not an absolute URL, leave as-is
    }
    // Normalize and ensure it points at uploads/
    const rel = candidate.replace(/^\/+/, '');
    if (!rel.startsWith('uploads/')) return;
    const cfg = getConfig();
    const abs = path.join(cfg.LOCAL_STORAGE_DIR, rel.replace(/^uploads\//, ''));
    await fs.unlink(abs);
  } catch {
    // Ignore cleanup failures (best-effort)
  }
}

export async function saveListingPreviewFile(options: {
  listingId: string;
  slug?: string;
  buffer: Buffer;
  mimeType?: string;
  previousUrl?: string | null;
}): Promise<string> {
  const { listingId, slug, buffer, mimeType, previousUrl } = options;
  const safeSegment = sanitizeSegment(listingId || slug || randomBytes(4).toString('hex'));
  const cfg = getConfig();
  // Prefer a proper extension based on mimeType; default to .png
  const ext =
    mimeType && /^image\/jpe?g/i.test(mimeType)
      ? '.jpg'
      : mimeType && /^image\/png/i.test(mimeType)
      ? '.png'
      : mimeType && /^image\/webp/i.test(mimeType)
      ? '.webp'
      : mimeType && /^image\/gif/i.test(mimeType)
      ? '.gif'
      : mimeType && /^image\/svg\+xml/i.test(mimeType)
      ? '.svg'
      : '.png';
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const dir = path.join(cfg.LOCAL_STORAGE_DIR, 'listings', safeSegment);
  await fs.mkdir(dir, { recursive: true });
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, buffer);
  // Remove the previous preview if it pointed to uploads/
  await removeExistingPreviewFile(previousUrl);
  // Always return an absolute-path-style URL starting with '/uploads/'
  return `/uploads/listings/${safeSegment}/${filename}`;
}

export const PREVIEW_PRESET_PATHS = [
  '/preview-presets/thesara_screenshot_1.png',
  '/preview-presets/thesara_screenshot_2.png',
  '/preview-presets/thesara_screenshot_3.png',
  '/preview-presets/thesara_screenshot_4.png',
  '/preview-presets/thesara_screenshot_5.png',
  '/preview-presets/thesara_screenshot_6.png',
  '/preview-presets/thesara_screenshot_7.png',
  '/preview-presets/thesara_screenshot_8.png',
  '/preview-presets/thesara_screenshot_9.png',
] as const;

export function pickRandomPreviewPreset(): string {
  const arr = PREVIEW_PRESET_PATHS as readonly string[];
  return arr[Math.floor(Math.random() * arr.length)];
}
