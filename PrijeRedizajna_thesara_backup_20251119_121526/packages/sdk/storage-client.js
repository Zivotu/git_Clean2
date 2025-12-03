function resolveBaseUrl(options){
  if(options && options.baseUrl) return options.baseUrl.replace(/\/+$/,'');
  if(typeof window!=='undefined'){
    const anyWin = window;
    const fromWindow = anyWin.__THESARA_API_BASE__ || anyWin.THESARA_API_BASE || anyWin.NEXT_PUBLIC_API_URL;
    if(typeof fromWindow==='string' && fromWindow.trim()) return fromWindow.replace(/\/+$/,'');
  }
  return '/api';
}

async function parseJson(res){
  const ct = res.headers.get('content-type')||'';
  if(ct.includes('application/json')) return await res.json();
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { throw new Error(txt||`HTTP ${res.status}`); }
}

function toError(res, body){
  const msg = (body && (body.message||body.error)) || `Request failed (${res.status})`;
  const err = new Error(msg);
  err.status = res.status;
  err.code = body && body.code;
  return err;
}

class StorageClient {
  constructor(options){
    this.base = resolveBaseUrl(options);
    this.fetch = (options && options.fetchImpl) || (typeof fetch!=='undefined' ? fetch : null);
    if(!this.fetch) throw new Error('fetch not available');
    this.appId = (options && options.appId) || 'thesara-app';
    this.scope = (options && options.scope) || 'shared'; // 'shared' | 'user'
  }
  _url(ns){
    const search = new URLSearchParams({ ns });
    return `${this.base}/storage?${search}`;
  }
  async get(ns){
    const res = await this.fetch(this._url(ns), {
      method:'GET',
      headers: { 'X-Thesara-Scope': this.scope },
      credentials: 'include',
    });
    const data = await parseJson(res).catch(e=>{ if(!res.ok) throw toError(res,{message:e&&e.message}); throw e; });
    const etag = (res.headers.get('ETag')||'').replace(/^"|"$/g,'') || '0';
    if(!res.ok) throw toError(res, data);
    return { etag, data };
  }
  async patch(ns, ops, ifMatch){
    const res = await this.fetch(this._url(ns), {
      method:'PATCH',
      headers: {
        'Content-Type':'application/json',
        'If-Match': ifMatch,
        'X-Thesara-App-Id': this.appId,
        'X-Thesara-Scope': this.scope,
      },
      body: JSON.stringify(ops),
      credentials: 'include',
    });
    const data = await parseJson(res).catch(e=>{ if(!res.ok) throw toError(res,{message:e&&e.message}); throw e; });
    const etag = (res.headers.get('ETag')||'').replace(/^"|"$/g,'') || (data && data.version) || '0';
    if(!res.ok) throw toError(res, data);
    const snapshot = (data && data.snapshot) || {};
    return { etag, data: snapshot };
  }
  async setObject(ns, key, value, ifMatch){
    return this.patch(ns, [{ op:'set', key, value }], ifMatch);
  }
  subscribe(ns, { interval=2000, onChange, onError }){
    let stopped=false; let lastEtag=null; let t=null;
    const tick=async()=>{
      try{
        const snap = await this.get(ns);
        if(stopped) return;
        if(lastEtag!==snap.etag){ lastEtag=snap.etag; onChange && onChange(snap); }
      }catch(e){ if(onError) onError(e); }
      if(!stopped) t=setTimeout(tick, interval);
    };
    tick();
    return ()=>{ stopped=true; if(t) clearTimeout(t); };
  }
}

module.exports = { StorageClient };
