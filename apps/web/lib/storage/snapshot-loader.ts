export type BatchItem = { op: 'set'; key: string; value: unknown } | { op: 'del'; key: string } | { op: 'clear' };

const API = process.env.NEXT_PUBLIC_API_HOST ?? 'https://api.thesara.space'
// Canonical web-side signer: GET /api/jwt (vrati kratkotrajni JWT za Storage API)
const SIGN_JWT_ENDPOINT = '/api/jwt'

let _token: string | null = null
let _exp = 0 // epoch seconds
let _refreshPromise: Promise<string> | null = null

function nowSec() { return Math.floor(Date.now() / 1000) }
function parseJwtExp(tok: string) { try { return JSON.parse(atob(tok.split('.')[1])).exp ?? 0 } catch { return 0 } }

export async function setInitialJwt(token: string) { _token = token; _exp = parseJwtExp(token) }

export async function refreshJwt(): Promise<string> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    const resp = await fetch(SIGN_JWT_ENDPOINT, { method: 'GET', credentials: 'include' })
    if (!resp.ok) throw new Error(`refresh-failed:${resp.status}`)
    const ct = resp.headers.get('content-type') || ''
    const token = ct.includes('application/json') ? (await resp.json()).token : (await resp.text()).trim()
    if (!token) throw new Error('refresh-missing-token')
    _token = token; _exp = parseJwtExp(token); return token
  })()
  try { return await _refreshPromise } finally { _refreshPromise = null }
}

export async function getJwt(): Promise<string> {
  if (_token && (_exp - nowSec()) > 60) return _token
  if (_token) { try { return await refreshJwt() } catch { return _token } }
  const resp = await fetch(SIGN_JWT_ENDPOINT, { credentials: 'include' })
  if (!resp.ok) throw new Error(`jwt-fetch-failed:${resp.status}`)
  const ct = resp.headers.get('content-type') || ''
  const t = ct.includes('application/json') ? (await resp.json()).token : (await resp.text()).trim()
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
  const res = await authFetch(`${API}/api/storage?ns=${encodeURIComponent(ns)}`)
  if (!res.ok) throw new Error(`snapshot-failed:${res.status}`)
  const version = res.headers.get('ETag')?.replace(/^"|"$/g,'') || ''
  const snapshot = await res.json()
  return { snapshot, version }
}

export async function patchStorage(_jwt: string, ns: string, version: string, batch: BatchItem[]) {
  const res = await authFetch(`${API}/api/storage?ns=${encodeURIComponent(ns)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `"${version}"`
    },
    body: JSON.stringify(batch)
  })
  if (res.status === 412) throw new Error('precondition-failed')
  if (!res.ok) throw new Error(`patch-failed:${res.status}`)
  const newVersion = res.headers.get('ETag')?.replace(/^"|"$/g,'') || ''
  let newSnapshot: any = undefined
  try { newSnapshot = await res.json() } catch {}
  return { newVersion, newSnapshot }
}