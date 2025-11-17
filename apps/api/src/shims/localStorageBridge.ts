export const LOCALSTORAGE_BRIDGE_SHIM = String.raw`;(function () {
  'use strict';

  const parentWindow = window.parent;
  const STANDALONE = !parentWindow || parentWindow === window;
  let standaloneWarningShown = false;

  let redirectScheduled = false;
  function schedulePlayRedirect() {
    if (redirectScheduled) return;
    const playUrl = (window.__THESARA_PLAY_URL__ || '').toString();
    if (!playUrl) return;
    redirectScheduled = true;
    try {
      setTimeout(() => {
        try {
          if (window.top && window.top.location) {
            window.top.location.href = playUrl;
          } else {
            window.location.href = playUrl;
          }
        } catch (e) {}
      }, 1200);
    } catch (e) {}
  }

  function showStandaloneWarning(reason) {
    if (!STANDALONE || standaloneWarningShown) return;
    standaloneWarningShown = true;
    try {
      console.warn('[Thesara Shim] Storage requires Thesara Play context. Reason: ' + (reason || 'unknown'));
    } catch (e) {}
    if (typeof document === 'undefined') return;
    const render = () => {
      try {
        if (document.getElementById('thesara-play-warning')) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'thesara-play-warning';
        wrapper.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.92);color:#f8fafc;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:system-ui,-apple-system,\"Segoe UI\",sans-serif;';
        const panel = document.createElement('div');
        panel.style.cssText = 'background:rgba(15,23,42,0.85);border-radius:24px;padding:32px;max-width:420px;box-shadow:0 20px 60px rgba(15,23,42,0.45);';
        panel.innerHTML = '<div style="font-size:18px;font-weight:600;margin-bottom:10px;">Otvorite aplikaciju kroz Thesara Play</div>' +
          '<div style="font-size:14px;line-height:1.6;margin-bottom:16px;">Ova verzija radi samo lokalno jer nema Thesara token. Pokrenite je preko Play linka kako bi se podaci sinkronizirali između uređaja.</div>';
        const playUrl = (window.__THESARA_PLAY_URL__ || '').toString();
        if (playUrl) {
          const btn = document.createElement('a');
          btn.href = playUrl;
          btn.textContent = 'Otvori u Play';
          btn.style.cssText = 'display:inline-flex;gap:8px;align-items:center;justify-content:center;background:#16a34a;color:white;padding:10px 18px;border-radius:999px;font-weight:600;text-decoration:none;';
          btn.target = '_top';
          panel.appendChild(btn);
        }
        wrapper.appendChild(panel);
        document.body.appendChild(wrapper);
      } catch (e) {}
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render, { once: true });
    } else {
      render();
    }
    schedulePlayRedirect();
  }

  if (STANDALONE && !getQueryParam('token')) {
    showStandaloneWarning('missing_token');
  }

  const FLUSH_INTERVAL = 500; // faster flush to reduce cross-tab race on first load
  const MAX_BATCH_SIZE = 50;

  let CAP = null;
  let awaitingAck = false;
  let flushTimer = null;

  const pending = [];
  const offlineQueue = [];

  const caches = {
    local: new Map(),
    session: new Map(),
  };
  let ROOM_TOKEN = getQueryParam('roomToken');
  let HAS_INITIAL_SNAPSHOT = false;

  const DEBUG =
    window.__THESARA_SHIM_DEBUG__ === '1' ||
    /(?:^|[?&])shimDebug=1(?:&|$)/.test(window.location.search) ||
    /localhost|127\.0\.0\.1|\.local/i.test(window.location.hostname);
  function debugLog(...args) {
    if (!DEBUG) return;
    try {
      console.log('[Thesara Shim]', ...args);
    } catch (e) {}
  }
  debugLog('boot', { ns: NS, hasToken: !!getJwtToken() });

  function decodeBase64(str) {
    try {
      if (typeof atob !== 'function') return null;
      const binary = atob(str);
      let result = '';
      for (let i = 0; i < binary.length; i++) {
        const code = binary.charCodeAt(i);
        result += '%' + ('00' + code.toString(16)).slice(-2);
      }
      return decodeURIComponent(result);
    } catch (e) {
      return null;
    }
  }

  function describeBatch(batch) {
    return (batch || []).slice(0, 5).map((item) => {
      if (!item || typeof item !== 'object') return item;
      if (item.op === 'set') {
        return {
          op: 'set',
          key: item.key,
          valuePreview:
            typeof item.value === 'string'
              ? item.value.slice(0, 80)
              : Object.prototype.toString.call(item.value),
        };
      }
      if (item.op === 'del') {
        return { op: 'del', key: item.key };
      }
      if (item.op === 'clear') {
        return { op: 'clear' };
      }
      return item;
    });
  }

  const BOOTSTRAP_PREFIX = 'thesara-bootstrap:';
  let PREFETCH_BOOTSTRAP = null;
  try {
    const rawName = window.name || '';
    if (typeof rawName === 'string' && rawName.startsWith(BOOTSTRAP_PREFIX)) {
      const encoded = rawName.slice(BOOTSTRAP_PREFIX.length);
      const decoded = decodeBase64(encoded);
      if (decoded) {
        const payload = JSON.parse(decoded);
        if (payload && typeof payload === 'object') {
          PREFETCH_BOOTSTRAP = payload;
        }
      }
      window.name = '';
    }
  } catch (err) {
    debugLog('failed to parse bootstrap payload', err);
  }

  function toStringValue(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }

  function enqueue(op) {
    pending.push(op);
    if (pending.length >= MAX_BATCH_SIZE) {
      flush();
      return;
    }
    scheduleFlush();
  }

  async function flush(force) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pending.length === 0 && offlineQueue.length === 0 && !force) return;

    const batch = offlineQueue.splice(0, offlineQueue.length).concat(pending.splice(0, pending.length));
    if (batch.length === 0) return;
    debugLog('flush attempt', {
      force: !!force,
      batchSize: batch.length,
      hasSnapshot: HAS_INITIAL_SNAPSHOT,
      capReady: !!CAP,
      awaitingAck,
      ops: describeBatch(batch),
    });

    if (!HAS_INITIAL_SNAPSHOT) {
      debugLog('deferring flush until snapshot', { force, batchSize: batch.length });
      offlineQueue.push(...batch);
      return;
    }

    // Standalone: sync directly to Thesara storage API using JWT token from URL (?token=) and namespace
    if (STANDALONE) {
      debugLog('directSync (standalone)', { batchSize: batch.length });
      await directSync(batch);
      return;
    }

    // Iframe: Prefer postMessage to parent; if capability isn't ready yet but
    // we already have a JWT (from ?token or referrer), fall back to direct
    // sync to avoid losing the first updates. This prevents the "room missing"
    // race when localStorage demos write immediately on mount.
    if (!CAP || awaitingAck) {
      try {
        if (getJwtToken()) {
          debugLog('directSync (no CAP yet)', { batchSize: batch.length, awaitingAck });
          await directSync(batch);
          return;
        }
      } catch (e) {}
      offlineQueue.push(...batch);
      debugLog('queued batch (no CAP)', { queued: offlineQueue.length });
      return;
    }

    try {
      parentWindow.postMessage(
        { type: 'thesara:storage:flush', cap: CAP, batch },
        '*'
      );
      awaitingAck = true;
      debugLog('sent batch to parent', { batchSize: batch.length, ops: describeBatch(batch) });
    } catch (err) {
      try { console.error('[Thesara Shim] Failed to postMessage batch, queueing offline.', err); } catch (e) {}
      offlineQueue.push(...batch);
    }
  }

  function applySnapshot(scope, snapshot) {
    if (scope === 'session') {
      return; // session storage stays local to the tab
    }
    const cache = caches[scope];
    cache.clear();
    if (!snapshot || typeof snapshot !== 'object') return;
    for (const key of Object.keys(snapshot)) {
      cache.set(key, toStringValue(snapshot[key]));
    }
  }

  function exportSnapshot(scope) {
    const cache = caches[scope];
    const out = Object.create(null);
    for (const [key, value] of cache.entries()) {
      out[key] = value;
    }
    return out;
  }

  function createFacade(scope, shouldSync) {
    const cache = caches[scope];
    return {
      get length() {
        return cache.size;
      },
      key(index) {
        const keys = Array.from(cache.keys());
        return index >= 0 && index < keys.length ? keys[index] : null;
      },
      getItem(key) {
        if (!cache.has(key)) return null;
        return cache.get(key);
      },
      setItem(key, value) {
        const str = toStringValue(value);
        cache.set(key, str);
        if (shouldSync) {
          enqueue({ scope, op: 'set', key, value: str });
        }
      },
      removeItem(key) {
        if (!cache.has(key)) return;
        cache.delete(key);
        if (shouldSync) {
          enqueue({ scope, op: 'del', key });
        }
      },
      clear() {
        if (cache.size === 0) return;
        cache.clear();
        if (shouldSync) {
          enqueue({ scope, op: 'clear' });
        }
      },
    };
  }

  const localFacade = createFacade('local', true);
  const sessionFacade = createFacade('session', false);

  Object.defineProperty(window, 'localStorage', {
    configurable: false,
    enumerable: true,
    get() {
      return localFacade;
    },
  });

  Object.defineProperty(window, 'sessionStorage', {
    configurable: false,
    enumerable: true,
    get() {
      return sessionFacade;
    },
  });

  function markSnapshotReady() {
    if (!HAS_INITIAL_SNAPSHOT) {
      HAS_INITIAL_SNAPSHOT = true;
      pending.length = 0;
      offlineQueue.length = 0;
       debugLog('initial snapshot ready');
      try {
        flush(true).catch(() => {});
      } catch (e) {}
    }
  }

  function reconcileSnapshot(payload) {
    debugLog('reconcile snapshot', {
      hasPayload: !!payload && typeof payload === 'object',
      keys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 5) : [],
    });
    if (!payload || typeof payload !== 'object') {
      applySnapshot('local', Object.create(null));
      markSnapshotReady();
      return;
    }
    if ('local' in payload || 'session' in payload) {
      applySnapshot('local', payload.local || {});
      markSnapshotReady();
      return;
    }
    applySnapshot('local', payload);
    markSnapshotReady();
  }

  function handleMessage(event) {
    if (event.source !== parentWindow) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'thesara:storage:init': {
        if (typeof msg.cap !== 'string' || !msg.cap) {
          try { console.error('[Thesara Shim] init without capability token, ignoring.'); } catch (e) {}
          return;
        }
        if (typeof msg.namespace === 'string' && msg.namespace) {
          setNamespace(msg.namespace);
        }
        CAP = msg.cap;
        ROOM_TOKEN = typeof msg.roomToken === 'string' ? msg.roomToken : null;
        awaitingAck = false;
        offlineQueue.length = 0;
        pending.length = 0;
        reconcileSnapshot(msg.snapshot);
        debugLog('received storage:init', { hasRoomToken: !!ROOM_TOKEN });
        return;
      }
      case 'thesara:storage:sync': {
        if (!CAP || msg.cap !== CAP) return;
        if (typeof msg.namespace === 'string' && msg.namespace) {
          setNamespace(msg.namespace);
        }
        if (typeof msg.roomToken === 'string') {
          ROOM_TOKEN = msg.roomToken;
        }
        reconcileSnapshot(msg.snapshot);
        awaitingAck = false;
        flush();
        debugLog('applied storage:sync', { hasRoomToken: !!ROOM_TOKEN });
        return;
      }
      case 'thesara:shim:ack': {
        if (!CAP || msg.cap !== CAP) return;
        awaitingAck = false;
        flush();
        debugLog('received shim ack');
        return;
      }
      case 'thesara:storage:flush-now': {
        if (!CAP || msg.cap !== CAP) return;
        flush(true);
        debugLog('flush-now requested');
        return;
      }
      default:
        return;
    }
  }

  window.addEventListener('message', handleMessage);

  // --- Standalone direct sync implementation ---
  let VERSION = '0';
  if (PREFETCH_BOOTSTRAP && PREFETCH_BOOTSTRAP.snapshot) {
    if (typeof PREFETCH_BOOTSTRAP.version === 'string') {
      VERSION = PREFETCH_BOOTSTRAP.version;
    }
    reconcileSnapshot(PREFETCH_BOOTSTRAP.snapshot);
    debugLog('applied bootstrap from window.name', {
      version: VERSION,
      keys: Object.keys(PREFETCH_BOOTSTRAP.snapshot || {}).slice(0, 5),
    });
    PREFETCH_BOOTSTRAP = null;
  }
  function getQueryParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || null; } catch (e) { return null; }
  }
  function getNamespace() {
    const ns = getQueryParam('ns');
    if (ns) return ns;
    const hinted = (window.__THESARA_APP_NS || '').toString();
    if (hinted) return hinted;
    const appId = getQueryParam('appId');
    if (appId) return 'app:' + appId;
    return 'app:default';
  }
  let NS = getNamespace();
  function deriveAppId(ns) {
    return ns && ns.startsWith('app:') ? ns.slice(4) : ns;
  }
  let APP_ID_HEADER = deriveAppId(NS);
  try {
    if (!window.__THESARA_APP_NS) {
      window.__THESARA_APP_NS = NS;
    }
  } catch (e) {}

  function setNamespace(ns) {
    if (!ns || typeof ns !== 'string' || NS === ns) return;
    NS = ns;
    APP_ID_HEADER = deriveAppId(ns);
    try { window.__THESARA_APP_NS = ns; } catch (e) {}
    debugLog('namespace updated', { ns });
  }
  const API_BASE = (() => {
    try {
      const hinted = (window.__THESARA_API_BASE__ || window.THESARA_API_BASE || '').toString().trim();
      if (hinted) {
        try {
          const resolved = new URL(hinted, window.location.origin);
          return resolved.href.replace(/\/$/, '');
        } catch (e) {}
        return hinted.replace(/\/$/, '');
      }
      const ref = document.referrer || '';
      if (ref) {
        try {
          const u = new URL(ref);
          return u.origin.replace(/\/$/, '') + '/api';
        } catch (e) {}
      }
      return (new URL(window.location.origin).origin).replace(/\/$/, '') + '/api';
    } catch (e) {
      return '/api';
    }
  })();
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
      if (!path) return API_BASE;
      const base = API_BASE.replace(/\/$/, '');
      return base + '/' + path.replace(/^\/+/, '');
    }
  }
  function getJwtToken() {
    // Prefer token from our own query string
    const selfToken = getQueryParam('token');
    if (selfToken) return selfToken;
    // In iframe, Play page carries ?token=... in its URL; try to read it from document.referrer
    try {
      const ref = document.referrer || '';
      if (ref) {
        const u = new URL(ref);
        const t = u.searchParams.get('token');
        if (t) return t;
      }
    } catch (e) {}
    return null;
  }
  async function apiFetch(path, opts) {
    const token = getJwtToken();
    if (!token) {
      showStandaloneWarning('missing_token');
    }
    const headers = Object.assign({}, (opts && opts.headers) || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['X-Thesara-App-Id'] = APP_ID_HEADER;
    headers['X-Thesara-Scope'] = 'shared';
    if (ROOM_TOKEN) {
      headers['X-Thesara-Room-Token'] = ROOM_TOKEN;
    }
    const init = Object.assign({}, opts, { headers });
    return fetch(buildApiUrl(path), init);
  }
  async function bootstrapStandalone() {
    try {
      const res = await apiFetch('/api/storage?ns=' + encodeURIComponent(NS), { method: 'GET' });
      if (res.ok) {
        const etag = (res.headers.get('ETag') || '').replace(/^"|"$/g, '') || '0';
        const json = await res.json();
        VERSION = etag;
        reconcileSnapshot(json);
      } else if (res.status === 404) {
        VERSION = '0';
        reconcileSnapshot({});
      } else {
        try { console.warn('[Thesara Shim] bootstrap failed: ' + res.status); } catch (e) {}
      }
    } catch (e) {
      try { console.warn('[Thesara Shim] bootstrap error', e); } catch (e2) {}
    }
  }
  async function directSync(batch) {
    if (!batch || batch.length === 0) return;
    let attempts = 0;
    let lastErr = null;
    while (attempts < 3) {
      attempts++;
      try {
        const res = await apiFetch('/api/storage?ns=' + encodeURIComponent(NS), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': '"' + VERSION + '"'
          },
          body: JSON.stringify(batch),
        });
        if (res.ok) {
          const etag = (res.headers.get('ETag') || '').replace(/^"|"$/g, '') || (Date.now() + '');
          VERSION = etag;
          try {
            const body = await res.json();
            if (body && body.snapshot && typeof body.snapshot === 'object') {
              reconcileSnapshot(body.snapshot);
            }
          } catch (e) {}
          return;
        }
        if (res.status === 412) {
          // Refresh snapshot and re-apply
          const latest = await apiFetch('/api/storage?ns=' + encodeURIComponent(NS), { method: 'GET' });
          if (latest.ok) {
            const et = (latest.headers.get('ETag') || '').replace(/^"|"$/g, '') || '0';
            const js = await latest.json();
            VERSION = et;
            reconcileSnapshot(js);
            // retry loop will attempt again with updated VERSION
            continue;
          }
        }
        lastErr = res.status + ' ' + res.statusText;
        break;
      } catch (e) {
        lastErr = e;
        break;
      }
    }
    try { console.error('[Thesara Shim] direct sync failed', lastErr); } catch (e) {}
    // If failed, keep batch in offline queue for a later attempt
    offlineQueue.push(...batch);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('beforeunload', () => flush(true));
  window.addEventListener('online', () => flush(true));

  if (STANDALONE) {
    // Standalone iframe/page: pre-hydrate from API immediately
    bootstrapStandalone();
  } else {
    // Iframe mode: kick off an eager bootstrap using the token + namespace
    // to avoid first-mount empty reads in localStorage-only demos.
    try {
      if (getJwtToken()) {
        // Fire-and-forget; parent will still send authoritative init after this.
        // This reduces the window where the app's first synchronous read sees an empty cache.
        void bootstrapStandalone();
      }
    } catch (e) {}

    try {
      parentWindow.postMessage({ type: 'thesara:shim:ready' }, '*');
    } catch (err) {
      try { console.error('[Thesara Shim] Failed to notify parent of readiness.', err); } catch (e) {}
    }
  }
})();
`;
