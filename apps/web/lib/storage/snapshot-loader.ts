export type BatchItem = { op: 'set'; key: string; value: unknown } | { op: 'del'; key: string } | { op: 'clear' };

import { PUBLIC_API_URL } from '../config';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.thesara.space/api';
const SIGN_JWT_ENDPOINTS = ['/jwt', '/api/jwt'];

// --- JWT and Auth ---
// Note: This section is preserved from the original file to handle authentication.
let _token: string | null = null;
let _exp = 0; // epoch seconds
let _refreshPromise: Promise<string> | null = null;

function nowSec() { return Math.floor(Date.now() / 1000); }
function parseJwtExp(tok: string) { try { return JSON.parse(atob(tok.split('.')[1])).exp ?? 0; } catch { return 0; } }

export async function setInitialJwt(token: string) { _token = token; _exp = parseJwtExp(token); }

export async function refreshJwt(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    const token = await fetchJwtToken('refresh');
    _token = token; _exp = parseJwtExp(token); return token;
  })();
  try { return await _refreshPromise; } finally { _refreshPromise = null; }
}

export async function getJwt(): Promise<string> {
  if (_token && (_exp - nowSec()) > 60) return _token;
  if (_token) { try { return await refreshJwt(); } catch { return _token; } }
  const t = await fetchJwtToken('initial');
  _token = t; _exp = parseJwtExp(t); return t;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getJwt();
  const doFetch = () => fetch(input, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${_token || token}` } });
  let res = await doFetch();
  if (res.status === 401 || res.status === 403) {
    try { await refreshJwt(); } catch { return res; }
    res = await doFetch();
  }
  return res;
}

// --- New Storage Implementation ---

function stripQuotes(v?: string | null) {
  return (v || '').replace(/^W\//, '').replace(/^"|"$/g, '');
}

function readEtag(resp: Response): string {
  return stripQuotes(resp.headers.get('ETag'));
}

// --- State Management ---
let jwtRef: { current: string | null } = { current: null };
let namespaceRef: { current: string | null } = { current: null };
export let snapshotRef: { current: Record<string, unknown> } = { current: {} };
export let storageVersionRef: { current: string } = { current: '0' };
let bc: BroadcastChannel | null = null;
const queue: BatchItem[] = [];
let flushTimer: any = null;

// --- Core API Functions ---

export async function fetchSnapshot(jwt: string, ns:string): Promise<{ snapshot: Record<string, unknown>; version: string; }> {
  console.debug(`[Thesara storage] GET ns=${ns}`);
  const res = await authFetch(`${API}/storage?ns=${encodeURIComponent(ns)}`, {
    headers: { 'X-Thesara-App-Id': ns, Authorization: `Bearer ${jwt}` },
    cache: 'no-store',
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  const version = readEtag(res);
  const snapshot = await res.json();
  console.debug(`[Thesara storage] GET ok ns=${ns} v=${version}`);
  return { snapshot, version };
}

async function patchOnce(jwt: string, ns: string, ops: BatchItem[], ifMatch: string) {
  console.debug(`[Thesara storage] PATCH ns=${ns} v=${ifMatch} ops=${ops.length}`);
  return authFetch(`${API}/storage?ns=${encodeURIComponent(ns)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'If-Match': ifMatch, // No quotes
      'X-Thesara-App-Id': ns,
    },
    body: JSON.stringify(ops),
  });
}

// --- Batching and Flushing ---

function scheduleFlush() {
  if (queue.length >= 10) {
    console.debug('[Thesara storage] flush reason=queue_full');
    void flushNow();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    console.debug('[Thesara storage] flush reason=timer');
    flushTimer = null;
    void flushNow();
  }, 2000);
}

export function enqueue(op: BatchItem) {
  queue.push(op);
  // Optimistically apply changes
  snapshotRef.current = applyBatchOperations(snapshotRef.current, [op]);
  scheduleFlush();
}

async function flushNow() {
  if (!queue.length || !jwtRef.current || !namespaceRef.current) return;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const ops = [...queue];
  let attempts = 0;

  while (attempts < 3) {
    attempts++;
    const res = await patchOnce(jwtRef.current, namespaceRef.current, ops, storageVersionRef.current);

    if (res.ok) {
      const newV = readEtag(res) || String(Number(storageVersionRef.current) + 1);
      storageVersionRef.current = newV;
      queue.splice(0, ops.length); // Clear flushed ops
      console.debug(`[Thesara storage] PATCH ok v=${newV}`);
      bc?.postMessage({ kind: 'remote_patch', version: newV });
      if (queue.length > 0) scheduleFlush();
      return;
    }

    if (res.status === 412) {
      console.debug(`[Thesara storage] 412→refetch attempt=${attempts}`);
      try {
        const { snapshot, version } = await fetchSnapshot(jwtRef.current, namespaceRef.current);
        storageVersionRef.current = version || storageVersionRef.current;
        // Replay local ops on top of the new server snapshot
        snapshotRef.current = applyBatchOperations(snapshot, queue);
        continue; // Retry patch
      } catch (e) {
        console.error('[Thesara storage] 412 refetch failed', e);
        break; // Stop on refetch failure
      }
    }

    const body = await (async () => { try { return await res.text(); } catch { return ''; } })();
    console.error(`[Thesara storage] PATCH failed attempt=${attempts}`, res.status, body);
    break; // Stop on other errors
  }

  if (attempts >= 3) {
    console.error('[Thesara storage] PATCH failed after 3 attempts. Local changes might be lost on reload.');
  }
}

// --- Broadcast Channel ---

function initChannel(ns: string) {
  if (bc) bc.close();
  try {
    bc = new BroadcastChannel(`thesara:${ns}`);
    bc.addEventListener('message', async (ev: MessageEvent) => {
      if (!ev?.data || ev.data.kind !== 'remote_patch' || !jwtRef.current || !namespaceRef.current) return;
      if (ev.data.version === storageVersionRef.current) return; // Own change

      console.debug(`[Thesara storage] BC reload v_remote=${ev.data.version} v_local=${storageVersionRef.current}`);
      try {
        const { snapshot, version } = await fetchSnapshot(jwtRef.current, namespaceRef.current);
        storageVersionRef.current = version || storageVersionRef.current;
        // Re-apply any pending local changes on top of the new base
        snapshotRef.current = applyBatchOperations(snapshot, queue);
        console.debug(`[Thesara storage] BC reload ok v=${version}`);
        // TODO: Notify UI of the change
      } catch (e) {
        console.error('[Thesara storage] BC reload failed', e);
      }
    });
  } catch (e) {
    console.error('[Thesara storage] BroadcastChannel init failed', e);
  }
}

// --- Initialization and Helpers ---

export async function initStorage(ns: string) {
  jwtRef.current = await getJwt();
  namespaceRef.current = ns;
  initChannel(ns);
  try {
    const { snapshot, version } = await fetchSnapshot(jwtRef.current, ns);
    snapshotRef.current = snapshot;
    storageVersionRef.current = version;
    return { snapshot, version };
  } catch (e) {
    console.error('[Thesara storage] Initial snapshot fetch failed', e);
    return { snapshot: {}, version: '0' };
  }
}

export function makeNamespace(appId: string, userId?: string) {
  const mode = (process.env.NEXT_PUBLIC_STORAGE_NS_MODE || 'user_app').toLowerCase();
  if (mode === 'app_only') return `${appId}`;
  if (!userId) return `${appId}`; // fallback
  return `user:${userId}:${appId}`;
}

export function applyBatchOperations(base: Record<string, unknown>, batch: BatchItem[]): Record<string, unknown> {
  const next = { ...base };
  for (const op of batch) {
    if (op.op === 'clear') {
      for (const key of Object.keys(next)) delete (next as any)[key];
      continue;
    }
    if (op.op === 'del') {
      delete (next as any)[op.key];
      continue;
    }
    if (op.op === 'set') {
      (next as any)[op.key] = op.value;
    }
  }
  return next;
}

async function fetchJwtToken(context: 'initial' | 'refresh'): Promise<string> {
  let lastError: unknown;
  for (const endpoint of SIGN_JWT_ENDPOINTS) {
    try {
      return await requestJwtFromEndpoint(endpoint, context);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(context === 'refresh' ? 'refresh-failed' : 'jwt-fetch-failed');
}

async function requestJwtFromEndpoint(endpoint: string, context: 'initial' | 'refresh'): Promise<string> {
  const url = new URL(endpoint, PUBLIC_API_URL).toString();
  const resp = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!resp.ok) {
    const code = context === 'refresh' ? 'refresh-failed' : 'jwt-fetch-failed';
    throw new Error(`${code}:${resp.status}`);
  }
  const ct = resp.headers.get('content-type') || '';
  const token = ct.includes('application/json') ? (await resp.json()).token : (await resp.text()).trim();
  if (!token) {
    throw new Error(context === 'refresh' ? 'refresh-missing-token' : 'jwt-missing-token');
  }
  return token;
}