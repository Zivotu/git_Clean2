
import { ApiError } from '@/lib/api';
import { auth } from '@/lib/firebase';

/**
 * Defines the shape of a storage patch operation.
 */
export type BatchItem =
  | { op: 'set'; key: string; value: any }
  | { op: 'del'; key: string }
  | { op: 'clear' };

/**
 * Retrieves the current JWT. If not already available, it fetches a new one
 * from the Firebase Auth SDK.
 */
export async function getJwt(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    // This will be caught by the client, which should handle auth flows.
    throw new ApiError(401, 'User not authenticated');
  }
  const token = await user.getIdToken();
  return token;
}

/**
 * Creates a namespace string for an app's storage, optionally scoped per room.
 */
export function makeNamespace(appId: string, roomCode?: string): string {
  if (roomCode) {
    return `app:${appId}:room:${roomCode}`;
  }
  return `app:${appId}`;
}

/**
 * Fetches the entire storage snapshot for a given namespace from the API.
 * @param jwt The authentication token.
 * @param ns The namespace to fetch.
 * @param roomToken Optional room access token for scoped namespaces.
 * @returns The snapshot data and its current version (ETag).
 */
export async function fetchSnapshot(
  jwt: string,
  ns: string,
  roomToken?: string | null
): Promise<{ snapshot: Record<string, unknown>; version: string }> {
  const response = await fetch(`/api/storage?ns=${encodeURIComponent(ns)}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'X-Thesara-Scope': 'shared',
      ...(roomToken ? { 'X-Thesara-Room-Token': roomToken } : {}),
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      // If the namespace doesn't exist yet, return an empty state.
      return { snapshot: {}, version: '0' };
    }
    throw new ApiError(response.status, `Failed to fetch snapshot for ns=${ns}`);
  }

  const version = response.headers.get('ETag')?.replace(/^"|"$/g, '') || '0';
  const snapshot = await response.json();
  return { snapshot, version };
}

/**
 * Applies a batch of operations to a local snapshot object for optimistic updates.
 * @param snapshot The current snapshot.
 * @param batch The operations to apply.
 * @returns A new snapshot with the operations applied.
 */
export function applyBatchOperations(
  snapshot: Record<string, unknown>,
  batch: readonly BatchItem[]
): Record<string, unknown> {
  const newSnapshot = { ...snapshot };

  for (const op of batch) {
    if (op.op === 'clear') {
      // If clear is present, it wipes everything.
      return {};
    }
    if (op.op === 'set') {
      newSnapshot[op.key] = op.value;
    } else if (op.op === 'del') {
      delete newSnapshot[op.key];
    }
  }
  return newSnapshot;
}

/**
 * Patches the remote storage with a batch of operations using optimistic locking.
 * @param jwt The authentication token.
 * @param ns The namespace to patch.
 * @param version The current version (ETag) to ensure consistency.
 * @param batch The operations to apply.
 * @param roomToken Optional room access token for scoped namespaces.
 * @returns The new version and, if provided by the API, the new snapshot.
 */
export async function patchStorage(
  jwt: string,
  ns: string,
  version: string,
  batch: BatchItem[],
  roomToken?: string | null
): Promise<{ newVersion: string; newSnapshot?: Record<string, unknown> }> {
  // Derive app id for audit/ratelimiting on the API side
  // Expected namespace format: "app:<appId>"; fall back to the raw ns if not parseable
  const appIdHeader = ns.startsWith('app:') ? ns.slice('app:'.length) : ns;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'If-Match': `"${version}"`,
    Authorization: `Bearer ${jwt}`,
    'X-Thesara-App-Id': appIdHeader,
    'X-Thesara-Scope': 'shared',
  };
  if (roomToken) {
    headers['X-Thesara-Room-Token'] = roomToken;
  }
  const response = await fetch(`/api/storage?ns=${encodeURIComponent(ns)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    // Let the caller handle specific errors like 412 (Concurrency)
    // Try to extract a machine-readable error code (string) if provided by the API
    let code: string | undefined = undefined;
    try {
      const body = await response.json();
      if (body && typeof body.code === 'string') code = body.code;
    } catch {}
    throw new ApiError(response.status, `Failed to patch storage for ns=${ns}`, code);
  }

  const newVersion = response.headers.get('ETag')?.replace(/^"|"$/g, '') || String(Date.now());
  const body = await response.json();
  
  return { newVersion, newSnapshot: body.snapshot };
}
