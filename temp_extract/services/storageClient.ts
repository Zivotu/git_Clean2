export type StorageScope = 'shared' | 'user';

export interface StorageClientOptions {
  baseUrl?: string;
  appId?: string;
  scope?: StorageScope;
  token?: string | null;
  fetchImpl?: typeof fetch;
}

export interface Snapshot<T = any> {
  etag: string; // generation/version as string, '0' means not created
  data: T;      // JSON object (top-level map)
}

export type PatchOp =
  | { op: 'set'; key: string; value: any }
  | { op: 'del'; key: string }
  | { op: 'clear' };

function resolveBaseUrl(options?: StorageClientOptions): string {
  if (options?.baseUrl) return options.baseUrl.replace(/\/+$/,'');
  if (typeof window !== 'undefined') {
    const anyWin: any = window as any;
    const fromWindow = anyWin.__THESARA_API_BASE__ || anyWin.THESARA_API_BASE || anyWin.NEXT_PUBLIC_API_URL;
    if (typeof fromWindow === 'string' && fromWindow.trim()) return fromWindow.replace(/\/+$/,'');
  }
  return '/api';
}

async function parseJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  const txt = await res.text();
  try { return JSON.parse(txt) as T; } catch { throw new Error(txt || `HTTP ${res.status}`); }
}

function toError(res: Response, body: any): Error {
  const msg = body?.message || body?.error || `Request failed (${res.status})`;
  const err = new Error(msg) as any;
  (err.status = res.status);
  (err.code = body?.code);
  return err;
}

export class StorageClient {
  private base: string;
  private f: typeof fetch;
  private appId: string;
  private scope: StorageScope;
  private token: string | null;

  constructor(options?: StorageClientOptions) {
    this.base = resolveBaseUrl(options);
    this.f = options?.fetchImpl ?? fetch;
    this.appId = options?.appId ?? 'pub-quiz-app';
    this.scope = options?.scope ?? 'shared';
    this.token = options?.token ?? null;
  }

  private url(ns: string) {
    const search = new URLSearchParams({ ns });
    return `${this.base}/storage?${search}`;
  }

  setAuth(options: { token?: string | null; appId?: string; scope?: StorageScope } = {}) {
    if (options.token !== undefined) this.token = options.token;
    if (options.appId) this.appId = options.appId;
    if (options.scope) this.scope = options.scope;
  }

  private buildHeaders(extra?: Record<string, string>) {
    const headers: Record<string, string> = {
      'X-Thesara-Scope': this.scope,
      ...(extra || {}),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async get<T = any>(ns: string): Promise<Snapshot<T>> {
    const res = await this.f(this.url(ns), {
      method: 'GET',
      headers: this.buildHeaders(),
      credentials: 'include',
    });
    const data = await parseJson<any>(res).catch((e)=>{ if(!res.ok) throw toError(res,{message:e?.message}); throw e; });
    const etag = res.headers.get('ETag')?.replace(/^"|"$/g,'') || '0';
    if(!res.ok) throw toError(res, data);
    return { etag, data } as Snapshot<T>;
  }

  async patch<T = any>(ns: string, ops: PatchOp[], ifMatch: string): Promise<Snapshot<T>> {
    const res = await this.f(this.url(ns), {
      method: 'PATCH',
      headers: this.buildHeaders({
        'Content-Type': 'application/json',
        'If-Match': ifMatch,
        'X-Thesara-App-Id': this.appId,
      }),
      body: JSON.stringify(ops),
      credentials: 'include',
    });
    const data = await parseJson<any>(res).catch((e)=>{ if(!res.ok) throw toError(res,{message:e?.message}); throw e; });
    const etag = res.headers.get('ETag')?.replace(/^"|"$/g,'') || (typeof data?.version === 'string' ? data.version : '0');
    if(!res.ok) throw toError(res, data);
    const snapshot = (data?.snapshot ?? {}) as T;
    return { etag, data: snapshot };
  }

  async setObject<T = any>(ns: string, key: string, value: any, ifMatch: string): Promise<Snapshot<T>> {
    const ops: PatchOp[] = [ { op: 'set', key, value } ];
    return this.patch<T>(ns, ops, ifMatch);
  }
}
