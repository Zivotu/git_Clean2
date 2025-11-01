import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { Storage, Bucket } from '@google-cloud/storage';
import { getConfig } from './config.js';

// --- Interface ---

export class StorageError extends Error {
  constructor(message: string, public statusCode: number, public etag?: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface IStorageBackend {
  read(ns: string): Promise<{ etag: string; json: any }>;
  patch(ns: string, ops: any[], ifMatch: string | '0'): Promise<{ etag: string; json: any }>;
  readonly kind: 'local' | 'gcs';
  readonly debug: { kind: 'local' | 'gcs'; kvPath?: string; bucket?: string };
}

// --- GCS Backend ---

class GcsBackend implements IStorageBackend {
  private bucket: Bucket;
  readonly kind = 'gcs';
  readonly debug: { kind: 'gcs'; bucket: string };

  constructor(bucketName: string) {
    const { FIREBASE } = getConfig();
    const options: any = { projectId: FIREBASE.projectId };
    if (FIREBASE.clientEmail && FIREBASE.privateKey) {
      options.credentials = {
        client_email: FIREBASE.clientEmail,
        private_key: FIREBASE.privateKey,
      };
    }
    const storage = new Storage(options);
    this.bucket = storage.bucket(bucketName);
    this.debug = { kind: 'gcs', bucket: bucketName };
    console.info(`[storage] backend=gcs bucket=${bucketName}`);
  }

  private getFilePath(ns: string): string {
    return `userAppData/${ns}.json`;
  }

  async read(ns: string): Promise<{ etag: string; json: any }> {
    const file = this.bucket.file(this.getFilePath(ns));
    const [exists] = await file.exists();
    if (!exists) return { etag: '0', json: {} };

    const [[metadata], content] = await Promise.all([
      file.getMetadata(),
      file.download(),
    ]);
    const etag = String(metadata.generation);
    const json = JSON.parse(content.toString('utf-8'));
    return { json, etag };
  }

  async patch(ns: string, ops: any[], ifMatch: string | '0'): Promise<{ etag: string; json: any }> {
    const file = this.bucket.file(this.getFilePath(ns));
    const generation = ifMatch === '0' ? 0 : parseInt(ifMatch, 10);
    if (isNaN(generation)) {
      throw new StorageError('Invalid If-Match header format.', 400);
    }

    try {
      const { json: currentJson } = await this.read(ns);
      const newJson = applyPatch(currentJson, ops);

      const [newFile] = await file.save(JSON.stringify(newJson), {
        contentType: 'application/json',
        resumable: false,
        validation: false,
        preconditionOpts: { ifGenerationMatch: generation },
      });
      const newEtag = String(newFile.metadata.generation);
      return { etag: newEtag, json: newJson };
    } catch (e: any) {
      if (e.code === 412) {
        const [metadata] = await file.getMetadata();
        throw new StorageError('Precondition Failed', 412, String(metadata.generation));
      }
      if (e.code === 403 || e.code === 401) {
        throw new StorageError('Permission denied for storage operation.', 403);
      }
      if (e.code === 400) {
        throw new StorageError('Invalid data format or payload.', 400);
      }
      // Default to 500
      throw new StorageError('storage_write_failed', 500);
    }
  }
}

// --- Local Backend ---

class LocalBackend implements IStorageBackend {
  readonly kind = 'local';
  readonly debug: { kind: 'local'; kvPath: string };

  constructor(private rootPath: string) {
    fs.mkdirSync(this.rootPath, { recursive: true });
    this.debug = { kind: 'local', kvPath: this.rootPath };
    console.info(`[storage] backend=local kvPath=${this.rootPath}`);
  }

  private sanitizeNs(ns: string): string {
    return ns.replace(/[^a-z0-9_-]/gi, '-');
  }

  private getFilePath(ns: string): string {
    return path.join(this.rootPath, `${this.sanitizeNs(ns)}.json`);
  }

  async read(ns: string): Promise<{ etag: string; json: any }> {
    const filePath = this.getFilePath(ns);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      // Simple generation counter based on mtime
      const etag = String(Math.floor(stat.mtime.getTime() / 1000));
      const data = JSON.parse(content);
      
      // Read generation from meta file if it exists
      const metaPath = filePath + '.meta';
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        return { etag: String(meta.generation), json: data };
      }

      // Fallback for files without meta
      return { etag: "1", json: data };

    } catch (e: any) {
      if (e.code === 'ENOENT') return { etag: '0', json: {} };
      throw e;
    }
  }

  async patch(ns: string, ops: any[], ifMatch: string | '0'): Promise<{ etag: string; json: any }> {
    const filePath = this.getFilePath(ns);
    const metaPath = filePath + '.meta';
    const lockPath = filePath + '.lock';

    // Acquire lock
    let attempts = 0;
    while (fs.existsSync(lockPath)) {
      attempts++;
      if (attempts > 10) {
        throw new StorageError('Failed to acquire lock', 500);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    fs.writeFileSync(lockPath, '');

    try {
      let currentEtag = '0';
      let currentJson = {};

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        currentJson = JSON.parse(content);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        currentEtag = String(meta.generation);
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }

      if (ifMatch !== currentEtag) {
        throw new StorageError('Precondition Failed', 412, currentEtag);
      }

      const newJson = applyPatch(currentJson, ops);
      const newEtag = String(Number(currentEtag) + 1);

      fs.writeFileSync(filePath, JSON.stringify(newJson, null, 2), 'utf-8');
      fs.writeFileSync(metaPath, JSON.stringify({ generation: newEtag }), 'utf-8');

      return { etag: newEtag, json: newJson };
    } finally {
      // Release lock
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }
  }
}

function applyPatch(doc: any, ops: any[]): any {
    let newDoc = { ...doc };
    for (const op of ops) {
        switch (op.op) {
            case 'set':
                newDoc[op.key] = op.value;
                break;
            case 'del':
                delete newDoc[op.key];
                break;
            case 'clear':
                newDoc = {};
                break;
        }
    }
    return newDoc;
}


// --- Factory ---

let _memo: IStorageBackend | null = null;

async function createStorageBackend(): Promise<IStorageBackend> {
  const mode = (process.env.STORAGE_BACKEND || 'LOCAL').toUpperCase();

  if (mode === 'GCS') {
    const bucketName = getConfig().FIREBASE.storageBucket;
    if (!bucketName) {
      throw new Error('GCS backend selected but no bucket name is configured.');
    }
    return new GcsBackend(bucketName);
  }

  // LOCAL backend
  let kvPath = process.env.KV_STORAGE_PATH;
  if (!kvPath) {
    const thesaraStorageRoot = process.env.THESARA_STORAGE_ROOT;
    if (thesaraStorageRoot) {
      kvPath = path.resolve(thesaraStorageRoot, 'kv');
    } else {
      kvPath = path.resolve(process.cwd(), '..', '..', 'storage', 'kv');
    }
  }
  return new LocalBackend(kvPath);
}

export async function getStorageBackend(): Promise<IStorageBackend> {
  if (_memo) return _memo;
  _memo = await createStorageBackend();
  return _memo;
}