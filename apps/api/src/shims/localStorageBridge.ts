export const LOCALSTORAGE_BRIDGE_SHIM = `;(function () {
  'use strict';

  const parentWindow = window.parent;
  const STANDALONE = !parentWindow || parentWindow === window;

  const FLUSH_INTERVAL = 2000;
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

    // Standalone: sync directly to Thesara storage API using JWT token from URL (?token=) and namespace
    if (STANDALONE) {
      await directSync(batch);
      return;
    }

    // Iframe: postMessage to parent which will persist to server
    if (!CAP || awaitingAck) {
      offlineQueue.push(...batch);
      return;
    }

    try {
      parentWindow.postMessage(
        { type: 'thesara:storage:flush', cap: CAP, batch },
        '*',
      );
      awaitingAck = true;
    } catch (err) {
      try { console.error('[Thesara Shim] Failed to postMessage batch, queueing offline.', err); } catch {}
      offlineQueue.push(...batch);
    }
  }

  function applySnapshot(scope, snapshot) {
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

  function createFacade(scope) {
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
        enqueue({ scope, op: 'set', key, value: str });
      },
      removeItem(key) {
        if (!cache.has(key)) return;
        cache.delete(key);
        enqueue({ scope, op: 'del', key });
      },
      clear() {
        if (cache.size === 0) return;
        cache.clear();
        enqueue({ scope, op: 'clear' });
      },
    };
  }

  const localFacade = createFacade('local');
  const sessionFacade = createFacade('session');

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

  function reconcileSnapshot(payload) {
    if (!payload || typeof payload !== 'object') {
      applySnapshot('local', Object.create(null));
      applySnapshot('session', Object.create(null));
      return;
    }
    if ('local' in payload || 'session' in payload) {
      applySnapshot('local', payload.local || {});
      applySnapshot('session', payload.session || {});
      return;
    }
    applySnapshot('local', payload);
    applySnapshot('session', {});
  }

  function handleMessage(event) {
    if (event.source !== parentWindow) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'thesara:storage:init': {
        if (typeof msg.cap !== 'string' || !msg.cap) {
          try { console.error('[Thesara Shim] init without capability token, ignoring.'); } catch {}
          return;
        }
        CAP = msg.cap;
        awaitingAck = false;
        offlineQueue.length = 0;
        pending.length = 0;
        reconcileSnapshot(msg.snapshot);
        return;
      }
      case 'thesara:storage:sync': {
        if (!CAP || msg.cap !== CAP) return;
        reconcileSnapshot(msg.snapshot);
        awaitingAck = false;
        flush();
        return;
      }
      case 'thesara:shim:ack': {
        if (!CAP || msg.cap !== CAP) return;
        awaitingAck = false;
        flush();
        return;
      }
      case 'thesara:storage:flush-now': {
        if (!CAP || msg.cap !== CAP) return;
        flush(true);
        return;
      }
      default:
        return;
    }
  }

  window.addEventListener('message', handleMessage);

  // --- Standalone direct sync implementation ---
  let VERSION = '0';
  function getQueryParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || null; } catch { return null; }
  }
  function getNamespace() {
    const hinted = (window.__THESARA_APP_NS || '').toString();
    if (hinted) return hinted;
    const ns = getQueryParam('ns');
    if (ns) return ns;
    const appId = getQueryParam('appId');
    if (appId) return 'app:' + appId;
    return 'app:default';
  }
  const NS = getNamespace();
  const APP_ID_HEADER = NS.startsWith('app:') ? NS.slice(4) : NS;
  function getJwtToken() {
    return getQueryParam('token');
  }
  async function apiFetch(path, opts) {
    const token = getJwtToken();
    const headers = Object.assign({}, (opts && opts.headers) || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    headers['X-Thesara-App-Id'] = APP_ID_HEADER;
    headers['X-Thesara-Scope'] = 'shared';
    const init = Object.assign({}, opts, { headers });
    return fetch(path, init);
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
        try { console.warn('[Thesara Shim] bootstrap failed: ' + res.status); } catch {}
      }
    } catch (e) {
      try { console.warn('[Thesara Shim] bootstrap error', e); } catch {}
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
          } catch {}
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
    try { console.error('[Thesara Shim] direct sync failed', lastErr); } catch {}
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
    bootstrapStandalone();
  } else {
    try {
      parentWindow.postMessage({ type: 'thesara:shim:ready' }, '*');
    } catch (err) {
      try { console.error('[Thesara Shim] Failed to notify parent of readiness.', err); } catch {}
    }
  }
})();
`;
