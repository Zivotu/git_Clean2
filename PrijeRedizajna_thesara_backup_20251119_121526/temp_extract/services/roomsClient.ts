export interface RoomsClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface CreateRoomRequest {
  roomCode: string;
  pin: string;
  name?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  pin: string;
  name?: string;
}

export interface RoomSummary {
  id: string;
  roomCode: string;
  version: number;
  tokenVersion: number;
  updatedAt: string;
}

export interface MemberSummary {
  id: string;
  name: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
}

export interface RoomState {
  room: RoomSummary;
  members: MemberSummary[];
  items: any[];
  history: any[];
}

export interface RoomsAuth {
  token: string;
  member: MemberSummary;
  room: RoomSummary;
}

function resolveBaseUrl(options?: RoomsClientOptions): string {
  if (options?.baseUrl) return options.baseUrl.replace(/\/+$/,'');
  if (typeof window !== 'undefined') {
    const anyWin: any = window as any;
    const fromWindow = anyWin.__THESARA_API_BASE__ || anyWin.THESARA_API_BASE || anyWin.NEXT_PUBLIC_API_URL;
    if (typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.replace(/\/+$/,'');
    }
  }
  return '/api';
}

async function parseJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return await res.json() as T;
  }
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

export class RoomsClient {
  private base: string;
  private f: typeof fetch;
  constructor(options?: RoomsClientOptions){
    this.base = resolveBaseUrl(options);
    this.f = options?.fetchImpl ?? fetch;
  }
  private url(path: string){ return `${this.base}${path}`; }

  async createRoom(body: CreateRoomRequest): Promise<RoomsAuth> {
    const res = await this.f(this.url('/rooms/v1'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await parseJson<any>(res).catch((e)=>{ if(!res.ok) throw toError(res,{message:e?.message}); throw e; });
    if(!res.ok) throw toError(res,data);
    return { token: data.token, member: data.member, room: data.room } as RoomsAuth;
  }

  async joinRoom(body: JoinRoomRequest): Promise<RoomsAuth> {
    const res = await this.f(this.url(`/rooms/v1/${encodeURIComponent(body.roomCode)}/join`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: body.pin, name: body.name }),
    });
    const data = await parseJson<any>(res).catch((e)=>{ if(!res.ok) throw toError(res,{message:e?.message}); throw e; });
    if(!res.ok) throw toError(res,data);
    return { token: data.token, member: data.member, room: data.room } as RoomsAuth;
  }

  async getRoomState(params: { roomCode: string; token: string; since?: number; sinceVersion?: number; }): Promise<RoomState> {
    const search = new URLSearchParams();
    if(params.since != null) search.set('since', String(params.since));
    if(params.sinceVersion != null) search.set('sinceVersion', String(params.sinceVersion));
    const qs = search.toString();
    const url = this.url(`/rooms/v1/${encodeURIComponent(params.roomCode)}${qs ? `?${qs}`: ''}`);
    const res = await this.f(url, { headers: { Authorization: `Bearer ${params.token}` }});
    const data = await parseJson<any>(res).catch((e)=>{ if(!res.ok) throw toError(res,{message:e?.message}); throw e; });
    if(!res.ok) throw toError(res,data);
    return data as RoomState;
  }
}
