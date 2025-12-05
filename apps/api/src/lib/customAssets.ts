import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { publishBundle } from '../models/Build.js';
import { getBuildDir } from '../paths.js';
import { dirExists } from './fs.js';
import type { CustomAsset } from '../types.js';

export const MAX_CUSTOM_ASSET_COUNT = 60;
export const MAX_REGULAR_ASSET_BYTES = 100 * 1024;
export const MAX_LARGE_ASSET_BYTES = 500 * 1024;
export const ALLOWED_CUSTOM_ASSET_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'audio/wav',
  'audio/mpeg',
]);

const sanitizeAssetName = (input: string): string => {
  const normalized = (input || '').replace(/[\r\n]/g, '').trim();
  if (!normalized) return `custom-${Date.now()}.png`;
  return normalized.replace(/[\\/]+/g, '-').slice(0, 160) || `custom-${Date.now()}.png`;
};

export function decodeDataUrl(input: string): { buffer: Buffer; mimeType: string } {
  if (!input || typeof input !== 'string') {
    throw new Error('invalid_data_url');
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(input.trim());
  if (!match) {
    throw new Error('invalid_data_url');
  }
  const mimeType = (match[1] || '').toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  return { buffer, mimeType };
}

export function normalizeCustomAssetList(
  input: unknown,
  existing?: CustomAsset[],
): CustomAsset[] {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_CUSTOM_ASSET_COUNT) {
    throw new Error('too_many_custom_assets');
  }
  const existingMap = new Map((existing || []).map((asset) => [asset.id, asset]));
  const resultMap = new Map<string, CustomAsset>(); // Use map to auto-replace duplicates
  let largeAssetCount = 0;

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('invalid_custom_asset');
    }
    const rawName = typeof (entry as any).name === 'string' ? (entry as any).name : '';
    const name = sanitizeAssetName(rawName);
    const lowerName = name.toLowerCase();

    const hasDataUrl =
      typeof (entry as any).dataUrl === 'string' &&
      (entry as any).dataUrl.trim().startsWith('data:');
    let size = 0;
    let assetToPush: CustomAsset | null = null;

    if (hasDataUrl) {
      const { buffer, mimeType } = decodeDataUrl((entry as any).dataUrl);
      if (!ALLOWED_CUSTOM_ASSET_MIME_TYPES.has(mimeType)) {
        throw new Error('invalid_custom_asset_type');
      }
      size = buffer.length;
      assetToPush = {
        id: randomUUID(),
        name,
        mimeType,
        size,
        dataUrl: (entry as any).dataUrl.trim(),
        updatedAt: Date.now(),
      };
    } else {
      const refId = typeof (entry as any).id === 'string' ? (entry as any).id : '';
      if (!refId || !existingMap.has(refId)) {
        throw new Error('invalid_custom_asset_reference');
      }
      const referenced = existingMap.get(refId)!;
      size = referenced.size || 0;
      assetToPush = {
        ...referenced,
        name,
        updatedAt: Date.now(),
      };
    }

    if (size > MAX_LARGE_ASSET_BYTES) {
      throw new Error('custom_asset_too_large');
    }
    if (size > MAX_REGULAR_ASSET_BYTES) {
      if (largeAssetCount >= 1) {
        throw new Error('too_many_large_assets');
      }
      largeAssetCount++;
    }

    if (assetToPush) {
      // If duplicate name exists, this will replace the previous one (last wins)
      resultMap.set(lowerName, assetToPush);
    }
  }
  return Array.from(resultMap.values());
}

export async function materializeCustomAssets(
  assets: CustomAsset[],
  destDir: string,
): Promise<{ name: string; path: string }[]> {
  if (!assets.length) return [];
  await fs.mkdir(destDir, { recursive: true });
  const files: { name: string; path: string }[] = [];
  for (const asset of assets) {
    const { buffer } = decodeDataUrl(asset.dataUrl);
    const safeName = sanitizeAssetName(asset.name);
    const target = path.join(destDir, safeName);
    await fs.writeFile(target, buffer);
    files.push({ name: safeName, path: target });
  }
  return files;
}

import { getConfig } from '../config.js';

export async function saveCustomAssetToStorage(asset: CustomAsset, appId: string): Promise<string> {
  const { buffer } = decodeDataUrl(asset.dataUrl);
  const config = getConfig();
  const safeName = sanitizeAssetName(asset.name);
  const relPath = path.join('custom-assets', appId, safeName);
  const fullPath = path.join(config.LOCAL_STORAGE_DIR, relPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  return relPath;
}

export async function applyCustomAssetsToBuild(
  buildId: string,
  nextAssets: CustomAsset[],
  previousAssets?: CustomAsset[],
): Promise<void> {
  if (!buildId) return;
  const baseDir = getBuildDir(buildId);
  const dirs = [
    path.join(baseDir, 'build'),
    path.join(baseDir, 'bundle'),
  ];
  const previousNames = new Set(
    (previousAssets || []).map((asset) => sanitizeAssetName(asset.name).toLowerCase()),
  );
  const nextNames = new Set(
    nextAssets.map((asset) => sanitizeAssetName(asset.name).toLowerCase()),
  );
  const namesToRemove = [...previousNames].filter((name) => !nextNames.has(name));

  for (const dir of dirs) {
    if (!(await dirExists(dir))) continue;
    for (const name of namesToRemove) {
      const candidate = path.join(dir, name);
      await fs.rm(candidate, { force: true });
    }
  }

  const config = getConfig();
  for (const dir of dirs) {
    if (!(await dirExists(dir))) continue;
    for (const asset of nextAssets) {
      let buffer: Buffer;
      if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
        const decoded = decodeDataUrl(asset.dataUrl);
        buffer = decoded.buffer;
      } else if (asset.storagePath) {
        const fullPath = path.join(config.LOCAL_STORAGE_DIR, asset.storagePath);
        buffer = await fs.readFile(fullPath);
      } else {
        continue;
      }

      const target = path.join(dir, sanitizeAssetName(asset.name));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
    }
  }

  await publishBundle(buildId);
}
