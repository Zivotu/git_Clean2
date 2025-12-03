(function () {
  'use strict';

  const parentWindow = window.parent;
  if (!parentWindow || parentWindow === window) {
    return;
  }

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

  function flush(force) {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pending.length === 0 && offlineQueue.length === 0 && !force) return;

    const batch = offlineQueue.splice(0, offlineQueue.length).concat(pending.splice(0, pending.length));
    if (batch.length === 0) return;

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
      console.error('[Thesara Shim] Failed to postMessage batch, queueing offline.', err);
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
          console.error('[Thesara Shim] init without capability token, ignoring.');
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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('beforeunload', () => flush(true));
  window.addEventListener('online', () => flush(true));

  try {
    parentWindow.postMessage({ type: 'thesara:shim:ready' }, '*');
  } catch (err) {
    console.error('[Thesara Shim] Failed to notify parent of readiness.', err);
  }
})();
