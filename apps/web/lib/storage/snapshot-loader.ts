import { apiFetch, ApiError } from '@/lib/api';

export type Snapshot = {
  version: string;
  data: Record<string, any>;
};

export type PatchOperation =
  | { op: 'set'; key: string; value: any }
  | { op: 'del'; key: string }
  | { op: 'clear' };

export class ConcurrencyError extends Error {
  public code = 412;
  public snapshot: Snapshot;

  constructor(message: string, snapshot: Snapshot) {
    super(message);
    this.name = 'ConcurrencyError';
    this.snapshot = snapshot;
  }
}

function stripQuotes(etag: string | null | undefined): string {
  if (!etag) return '0';
  return etag.replace(/^"|"$/g, '');
}

/**
 * Loads the storage snapshot for a given namespace.
 * @param ns The storage namespace.
 * @returns A promise that resolves to the snapshot.
 */
export async function loadSnapshot(ns: string): Promise<Snapshot> {
  try {
    const response = await fetch(`/api/storage?ns=${encodeURIComponent(ns)}`, {
      headers: {
        'Authorization': `Bearer ${await (window as any).getAuthToken()}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { version: '0', data: {} };
      }
      throw new ApiError(response.status, `Failed to load snapshot for ns=${ns}`);
    }

    const version = stripQuotes(response.headers.get('ETag'));
    const data = await response.json();
    return { version, data };
  } catch (err) {
    console.error('[storage] loadSnapshot failed', err);
    throw err;
  }
}

/**
 * Patches the storage for a given namespace with optimistic locking.
 * @param ns The storage namespace.
 * @param ops An array of patch operations.
 * @param ifMatch The ETag/version to match.
 * @returns A promise that resolves to the new snapshot.
 * @throws {ConcurrencyError} If a 412 Precondition Failed error occurs.
 */
export async function patchStorage(ns: string, ops: PatchOperation[], ifMatch: string): Promise<Snapshot> {
  try {
    const { version, snapshot } = await apiFetch<{ version: string; snapshot: any }>(`/storage?ns=${encodeURIComponent(ns)}`, {
      method: 'PATCH',
      body: ops,
      headers: { 'If-Match': `"${ifMatch}"` },
    });
    return { version, data: snapshot };
  } catch (err) {
    if (err instanceof ApiError && err.status === 412) {
      const freshVersion = stripQuotes(err.response?.headers.get('ETag'));
      const freshData = err.body || {};
      throw new ConcurrencyError('Precondition Failed', { version: freshVersion, data: freshData });
    }
    console.error('[storage] patchStorage failed', err);
    throw err;
  }
}