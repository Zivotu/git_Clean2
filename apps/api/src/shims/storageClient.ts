export const STORAGE_CLIENT_SHIM = String.raw`// Thesara Storage Client Shim (ESM)
// Bridges postMessage-based access to /api/storage with JWT + namespace support.

// Resolve API base robustly when running inside cross-origin iframes.
// Priority: explicit window.__THESARA_API_BASE__ -> parent origin via document.referrer -> same-origin '/api'
const API_BASE = (() => {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const hintedRaw = (g.__THESARA_API_BASE__ || g.THESARA_API_BASE || g.NEXT_PUBLIC_API_URL || '').toString().trim();
    if (hintedRaw) {
      try {
        const u = new URL(hintedRaw, window.location.origin);
        return u.href.replace(/\/$/, '');
      } catch (e) {}
      return hintedRaw.replace(/\/$/, '');
    }
    try {
      const ref = document.referrer || '';
      if (ref) {
        const u = new URL(ref);
        return (u.origin || '').replace(/\/$/, '') + '/api';
      }
    } catch (e) {}
    return (new URL(window.location.origin).origin).replace(/\/$/, '') + '/api';
  } catch (e) {
    return '/api';
  }
})();

(function ensureRandomUUID() {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    if (!g) return;
    const cryptoObj = g.crypto;
    if (!cryptoObj) return;
    if (typeof cryptoObj.randomUUID === 'function') return;
    if (typeof cryptoObj.getRandomValues === 'function') {
      const rnds = new Uint8Array(16);
      cryptoObj.randomUUID = function randomUUID() {
        cryptoObj.getRandomValues(rnds);
        rnds[6] = (rnds[6] & 0x0f) | 0x40;
        rnds[8] = (rnds[8] & 0x3f) | 0x80;
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return (
          toHex(rnds[0]) + toHex(rnds[1]) + toHex(rnds[2]) + toHex(rnds[3]) + '-' +
          toHex(rnds[4]) + toHex(rnds[5]) + '-' +
          toHex(rnds[6]) + toHex(rnds[7]) + '-' +
          toHex(rnds[8]) + toHex(rnds[9]) + '-' +
          toHex(rnds[10]) + toHex(rnds[11]) + toHex(rnds[12]) + toHex(rnds[13]) + toHex(rnds[14]) + toHex(rnds[15])
        );
      };
    } else {
      cryptoObj.randomUUID = function randomUUID() {
        const seg = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
        return (
          seg() + seg() + '-' +
          seg() + '-' +
          seg() + '-' +
          seg() + '-' +
          seg() + seg() + seg()
        );
      };
    }
  } catch (e) {
    // ignore
  }
})();

const STATE = {
  namespace: null,
  appId: 'postmessage-bridge',
  token: null,
  version: '0',
  snapshot: {},
};
const NAMESPACE_STATE = new Map();

STATE.namespace = getInitialNamespace();
STATE.appId = deriveAppId(STATE.namespace);
STATE.token = getQueryParam('token');

function getQueryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || null;
  } catch (e) {
    return null;
  }
}

function getInitialNamespace() {
  const hinted = (window.__THESARA_APP_NS || '').toString();
  if (hinted) return hinted;
  const fromQuery = getQueryParam('ns');
  if (fromQuery) return fromQuery;
  const fromAppId = getQueryParam('appId');
  if (fromAppId) return 'app:' + fromAppId;
  return null;
}

function deriveAppId(ns) {
  if (!ns) return 'postmessage-bridge';
  if (ns.startsWith('app:')) {
    const trimmed = ns.slice(4);
    return trimmed ? trimmed : 'postmessage-bridge';
  }
  return ns;
}

function ensureNamespace(ns) {
  if (typeof ns === 'string' && ns.trim()) {
    STATE.namespace = ns.trim();
    STATE.appId = deriveAppId(STATE.namespace);
  }
  return STATE.namespace;
}

function extractEtag(res) {
  try {
    const raw = res.headers && res.headers.get('ETag');
    return raw ? raw.replace(/^"|"$/g, '') : null;
  } catch (e) {
    return null;
  }
}

function buildHeaders(extra) {
  const headers = Object.assign({}, extra || {});
  headers['X-Thesara-App-Id'] = STATE.appId || 'postmessage-bridge';
  headers['X-Thesara-Scope'] = 'shared';
  if (STATE.token) {
    headers['Authorization'] = 'Bearer ' + STATE.token;
  }
  return headers;
}

  function buildApiUrl(path) {
    try {
      if (!path) return API_BASE;
      if (/^https?:\/\//i.test(path)) return path;
      let relative = path.replace(/^\/+/, '');
      if (relative.startsWith('api/')) {
        relative = relative.slice(4);
      }
      const baseUrl = API_BASE.endsWith('/') ? API_BASE : API_BASE + '/';
      return new URL(relative, baseUrl).href;
    } catch (e) {
      const base = API_BASE.replace(/\/$/, '');
      return base + '/' + path.replace(/^\/+/, '');
    }
  }

async function fetchWithAuth(path, init = {}) {
  const options = Object.assign({}, init, { headers: buildHeaders(init.headers) });
  return fetch(buildApiUrl(path), options);
}

async function refreshNamespace(ns) {
  const res = await fetchWithAuth('/api/storage?ns=' + encodeURIComponent(ns), { method: 'GET' });
  if (res.status === 404) {
    STATE.version = '0';
    STATE.snapshot = {};
    return { snapshot: {} };
  }
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  }
  const json = await res.json().catch(() => ({}));
  STATE.snapshot = json && typeof json === 'object' ? json : {};
  const etag = extractEtag(res);
  if (etag) STATE.version = etag;
  return { snapshot: STATE.snapshot };
}

function applyOperationsLocal(ops) {
  if (!Array.isArray(ops) || ops.length === 0) return;
  const next = Object.assign({}, STATE.snapshot);
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    switch (op.op) {
      case 'set':
        if (typeof op.key === 'string') next[op.key] = op.value;
        break;
      case 'del':
        if (typeof op.key === 'string') delete next[op.key];
        break;
      case 'clear':
        for (const key of Object.keys(next)) delete next[key];
        break;
      default:
        break;
    }
  }
  STATE.snapshot = next;
}

async function applyPatch(ns, operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { snapshot: STATE.snapshot };
  }
  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    const currentVersion = STATE.version || '0';
    const res = await fetchWithAuth('/api/storage?ns=' + encodeURIComponent(ns), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"' + currentVersion + '"',
      },
      body: JSON.stringify(operations),
    });
    if (res.ok) {
      let body = null;
      try {
        body = await res.json();
      } catch (e) {}
      const etag = extractEtag(res) || (body && body.version ? String(body.version) : null);
      if (etag) STATE.version = etag;
      if (body && body.snapshot && typeof body.snapshot === 'object') {
        STATE.snapshot = body.snapshot;
      } else {
        applyOperationsLocal(operations);
      }
      return body || { snapshot: STATE.snapshot };
    }
    if (res.status === 412) {
      await refreshNamespace(ns);
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new Error(text || ('HTTP ' + res.status + ' ' + res.statusText));
  }
  throw new Error('Conflict while updating storage.');
}

function respondSuccess(id, operation, payload) {
  window.postMessage(
    Object.assign(
      {
        type: 'thesara:storage:response',
        id,
        operation,
        success: true,
        version: STATE.version,
      },
      payload || {},
    ),
    '*'
  );
}

function respondError(id, operation, message, details) {
  window.postMessage(
    {
      type: 'thesara:storage:response',
      id,
      operation,
      success: false,
      error: message || 'storage_error',
      details: details || null,
    },
    '*'
  );
}

window.addEventListener('message', async (event) => {
  const msg = event.data || {};
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'thesara:storage:init') {
    if (msg.namespace) ensureNamespace(msg.namespace);
    if (msg.token) STATE.token = msg.token;
    if (msg.version !== undefined) STATE.version = String(msg.version);
    if (msg.snapshot && typeof msg.snapshot === 'object') {
      STATE.snapshot = msg.snapshot;
    }
    return;
  }

  if (msg.type === 'thesara:storage:sync') {
    if (msg.namespace) ensureNamespace(msg.namespace);
    if (msg.version !== undefined) STATE.version = String(msg.version);
    if (msg.snapshot && typeof msg.snapshot === 'object') {
      STATE.snapshot = msg.snapshot;
    }
    return;
  }

  if (!msg.type || !msg.type.startsWith('thesara:storage:') || msg.type === 'thesara:storage:response') {
    return;
  }

  const operation = msg.type.slice('thesara:storage:'.length);
  const requestId = msg.id;
  const namespace = ensureNamespace(msg.namespace || msg.key);
  if (!namespace) {
    respondError(requestId, operation, 'namespace_required');
    return;
  }

  try {
    switch (operation) {
      case 'get': {
        const res = await fetchWithAuth('/api/storage?ns=' + encodeURIComponent(namespace), { method: 'GET' });
        if (res.status === 404) {
          STATE.version = '0';
          STATE.snapshot = {};
          respondSuccess(requestId, operation, { value: null });
          return;
        }
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        }
        const json = await res.json().catch(() => ({}));
        STATE.snapshot = json && typeof json === 'object' ? json : {};
        const etag = extractEtag(res);
        if (etag) STATE.version = etag;
        respondSuccess(requestId, operation, { value: STATE.snapshot });
        return;
      }
      case 'set': {
        const ops = Array.isArray(msg.batch) ? msg.batch : [{ op: 'set', key: 'value', value: msg.value }];
        const result = await applyPatch(namespace, ops);
        respondSuccess(requestId, operation, { snapshot: STATE.snapshot, result });
        return;
      }
      case 'delete':
      case 'clear': {
        const ops = Array.isArray(msg.batch) ? msg.batch : [{ op: 'clear' }];
        const result = await applyPatch(namespace, ops);
        respondSuccess(requestId, operation, { snapshot: STATE.snapshot, result });
        return;
      }
      case 'list': {
        respondError(requestId, operation, 'not_supported');
        return;
      }
      default:
        respondError(requestId, operation, 'unknown_operation');
        return;
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    respondError(requestId, operation, message);
  }
});

function resolveNamespace(ns) {
  const resolved = typeof ns === 'string' && ns.trim() ? ns.trim() : STATE.namespace;
  if (!resolved) throw new Error('namespace_required');
  return resolved;
}

async function readNamespace(ns) {
  const namespace = resolveNamespace(ns);
  const res = await fetchWithAuth('/api/storage?ns=' + encodeURIComponent(namespace), { method: 'GET' });
  if (res.status === 404) {
    NAMESPACE_STATE.set(namespace, '0');
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || ('HTTP ' + res.status + ' ' + res.statusText));
  }
  const json = await res.json().catch(() => ({}));
  const etag = extractEtag(res) || '0';
  NAMESPACE_STATE.set(namespace, etag);
  return json && typeof json === 'object' ? json : {};
}

async function sendPatch(namespace, operations) {
  const ns = resolveNamespace(namespace);
  const etag = NAMESPACE_STATE.get(ns) || '0';
  const res = await fetchWithAuth('/api/storage?ns=' + encodeURIComponent(ns), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': etag || '0',
    },
    body: JSON.stringify(operations),
  });
  if (res.status === 409) {
    await readNamespace(ns);
    throw new Error('storage_conflict');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || ('HTTP ' + res.status + ' ' + res.statusText));
  }
  const newEtag = extractEtag(res) || null;
  if (newEtag) NAMESPACE_STATE.set(ns, newEtag);
  try {
    const json = await res.json();
    if (json && typeof json === 'object' && json.snapshot) {
      STATE.snapshot = json.snapshot;
    }
    return json;
  } catch (e) {
    return null;
  }
}

const storageApi = {
  async get(namespace) {
    return readNamespace(namespace);
  },
  async set(namespace, value) {
    if (value === null || typeof value !== 'object') {
      throw new Error('set requires object value');
    }
    const ops = [{ op: 'clear' }];
    for (const [key, val] of Object.entries(value)) {
      ops.push({ op: 'set', key, value: val });
    }
    await sendPatch(namespace, ops);
    return value;
  },
  async patch(namespace, operations) {
    if (!Array.isArray(operations)) throw new Error('patch requires array of operations');
    await sendPatch(namespace, operations);
  },
  async delete(namespace) {
    await sendPatch(namespace, [{ op: 'clear' }]);
  },
};

if (typeof window !== 'undefined') {
  window.storage = storageApi;
  window.thesara = window.thesara || {};
  window.thesara.storage = storageApi;
}

// Also accept token/namespace via Play wrapper handshake
try {
  window.addEventListener('message', (event) => {
    try {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'thesara:storage:init') {
        if (typeof msg.namespace === 'string' && msg.namespace) {
          ensureNamespace(msg.namespace);
        }
        if (typeof msg.token === 'string' && msg.token) {
          STATE.token = msg.token;
        }
      }
    } catch (e) {}
  });
} catch (e) {}

console.log('[Thesara] storage shim initialised');
`;
