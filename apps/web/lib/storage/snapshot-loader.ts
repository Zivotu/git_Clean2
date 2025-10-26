export type BatchItem = { op: 'set'; key: string; value: unknown } | { op: 'del'; key: string } | { op: 'clear' };

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.thesara.space/api'
// Canonical web-side signer: try /jwt first (new endpoint), fall back to /api/jwt for legacy clients.
const SIGN_JWT_ENDPOINTS = ['/jwt', '/api/jwt']

let _token: string | null = null
let _exp = 0 // epoch seconds
let _refreshPromise: Promise<string> | null = null

function nowSec() { return Math.floor(Date.now() / 1000) }
function parseJwtExp(tok: string) { try { return JSON.parse(atob(tok.split('.')[1])).exp ?? 0 } catch { return 0 } }

export async function setInitialJwt(token: string) { _token = token; _exp = parseJwtExp(token) }

export async function refreshJwt(): Promise<string> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    const token = await fetchJwtToken('refresh')
    _token = token; _exp = parseJwtExp(token); return token
  })()
  try { return await _refreshPromise } finally { _refreshPromise = null }
}

export async function getJwt(): Promise<string> {
  if (_token && (_exp - nowSec()) > 60) return _token
  if (_token) { try { return await refreshJwt() } catch { return _token } }
  const t = await fetchJwtToken('initial')
  _token = t; _exp = parseJwtExp(t); return t
}

export function makeNamespace(appId: string, userId?: string) {
  const mode = (process.env.NEXT_PUBLIC_STORAGE_NS_MODE || 'user_app').toLowerCase()
  if (mode === 'app_only') return `${appId}`
  if (!userId) return `${appId}` // fallback
  return `user:${userId}:${appId}`
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getJwt()
  const doFetch = () => fetch(input, { ...init, headers: { ...(init.headers||{}), Authorization: `Bearer ${_token || token}` } })
  let res = await doFetch()
  if (res.status === 401 || res.status === 403) {
    try { await refreshJwt() } catch { return res }
    res = await doFetch()
  }
  return res
}

export async function fetchSnapshot(_jwt: string, ns: string) {
  const res = await authFetch(`${API}/storage?ns=${encodeURIComponent(ns)}`, {
    headers: { 'X-Thesara-App-Id': ns },
  })
  if (!res.ok) throw new Error(`snapshot-failed:${res.status}`)
  const version = res.headers.get('ETag')?.replace(/^W\//, '')?.replace(/^"|"$/g,'') || ''
  const snapshot = await res.json()
  return { snapshot, version }
}

export async function patchStorage(_jwt: string, ns: string, version: string, batch: BatchItem[]) {
  const res = await authFetch(`${API}/storage?ns=${encodeURIComponent(ns)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `${version}`,
      'X-Thesara-App-Id': ns
    },
    body: JSON.stringify(batch)
  })
  if (res.status === 412) {
    const err: any = new Error('precondition-failed')
    err.status = 412
    throw err
  }
  if (!res.ok) {
    const err: any = new Error(`patch-failed:${res.status}`)
    err.status = res.status
    throw err
  }
  const newVersion = res.headers.get('ETag')?.replace(/^W\//, '')?.replace(/^"|"$/g,'') || ''
  let newSnapshot: any = undefined
  try { newSnapshot = await res.json() } catch {}
  return { newVersion, newSnapshot }
}

export function applyBatchOperations(
  base: Record<string, unknown>,
  batch: BatchItem[],
): Record<string, unknown> {
  const next = { ...base }
  for (const op of batch) {
    if (op.op === 'clear') {
      for (const key of Object.keys(next)) delete (next as any)[key]
      continue
    }
    if (op.op === 'del') {
      delete (next as any)[op.key]
      continue
    }
    if (op.op === 'set') {
      ;(next as any)[op.key] = op.value
    }
  }
  return next
}

async function fetchJwtToken(context: 'initial' | 'refresh'): Promise<string> {
  let lastError: unknown
  for (const endpoint of SIGN_JWT_ENDPOINTS) {
    try {
      return await requestJwtFromEndpoint(endpoint, context)
    } catch (err) {
      lastError = err
    }
  }
  if (lastError instanceof Error) throw lastError
  throw new Error(context === 'refresh' ? 'refresh-failed' : 'jwt-fetch-failed')
}

async function requestJwtFromEndpoint(endpoint: string, context: 'initial' | 'refresh'): Promise<string> {
  const resp = await fetch(endpoint, { method: 'GET', credentials: 'include' })
  if (!resp.ok) {
    const code = context === 'refresh' ? 'refresh-failed' : 'jwt-fetch-failed'
    throw new Error(`${code}:${resp.status}`)
  }
  const ct = resp.headers.get('content-type') || ''
  const token = ct.includes('application/json') ? (await resp.json()).token : (await resp.text()).trim()
  if (!token) {
    throw new Error(context === 'refresh' ? 'refresh-missing-token' : 'jwt-missing-token')
  }
  return token
}
