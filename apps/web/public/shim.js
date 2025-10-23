(function () {
  "use strict";

  console.log("[Thesara Shim] Initializing storage proxy...");

  const PING_INTERVAL = 2000; // 2 seconds
  const MAX_BATCH_SIZE = 50;

  let CAP = null; // capability token in closure, not exposed on window
  let lastPostTs = 0;
  let awaitingAck = false;
  let offlineQueue = [];

  let batch = [];
  let flushTimeout = null;
  let storageCache = null; // Replaces initialSnapshot
  let isReady = false; // isReady is still useful

  const parent = window.parent;

  function postFlush(batchToFlush) {
    if (!CAP) {
        console.warn("[Thesara Shim] Cannot flush, capability token not set.");
        return; 
    }
    // If offline or waiting for a previous ack, queue this batch.
    if (!navigator.onLine || awaitingAck) {
        console.log(`[Thesara Shim] Deferring flush (online: ${navigator.onLine}, awaitingAck: ${awaitingAck}). Queue size: ${offlineQueue.length}`);
        offlineQueue.push(...batchToFlush);
        return;
    }
    
    try {
      parent.postMessage({ type: 'thesara:storage:flush', cap: CAP, batch: batchToFlush }, '*');
      lastPostTs = Date.now();
      awaitingAck = true;
    } catch (e) {
      console.error("[Thesara Shim] Failed to send batch to parent:", e);
      // If postMessage fails, re-queue the batch
      offlineQueue.push(...batchToFlush);
    }
  }

  function flush() {
    if (batch.length === 0 && offlineQueue.length === 0) {
      return;
    }
    
    const combinedBatch = [...offlineQueue, ...batch];
    offlineQueue = [];
    batch = [];

    if (combinedBatch.length > 0) {
        postFlush(combinedBatch);
    }

    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
  }
  
  // More aggressive flush for page unload events
  function flushNow() {
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
      flush();
  }


  function scheduleFlush() {
    if (flushTimeout) {
      return; // Already scheduled
    }
    flushTimeout = setTimeout(flush, PING_INTERVAL);
  }

  function addToBatch(item) {
    batch.push(item);
    if (batch.length >= MAX_BATCH_SIZE) {
      flush();
    } else {
      scheduleFlush();
    }
  }

  const originalSetItem = window.localStorage.setItem;
  const originalRemoveItem = window.localStorage.removeItem;
  const originalClear = window.localStorage.clear;

  window.localStorage.setItem = function (key, value) {
    if (!isReady) {
      console.warn("[Thesara Shim] setItem called before sync. This change may be lost.");
    }
    const strValue = String(value);
    addToBatch({ op: 'set', key, value: strValue });
    originalSetItem.call(localStorage, key, strValue);
  };

  window.localStorage.removeItem = function (key) {
    if (!isReady) {
      console.warn("[Thesara Shim] removeItem called before sync. This change may be lost.");
    }
    addToBatch({ op: 'del', key });
    originalRemoveItem.call(localStorage, key);
  };

  window.localStorage.clear = function () {
    if (!isReady) {
      console.warn("[Thesara Shim] clear called before sync. This change may be lost.");
    }
    addToBatch({ op: 'clear' });
    originalClear.call(localStorage);
  };

  function handleMessage(event) {
    if (event.source !== parent) {
        console.warn("[Thesara Shim] Ignoring message from non-parent window.");
        return;
    }

    const msg = event.data;
    if (!msg || typeof msg !== 'object') {
      return;
    }

    // The first message must be 'init' with a capability token
    if (msg.type === 'thesara:storage:init') {
      if (typeof msg.cap === 'string' && msg.cap) {
        CAP = msg.cap;
        console.log("[Thesara Shim] Capability token received.");
      } else {
        console.error("[Thesara Shim] 'init' message received without a capability token. Halting.");
        return; // Do not proceed without a token
      }
      
      storageCache = msg.snapshot || {};
      originalClear.call(localStorage);
      for (const key in storageCache) {
        if (Object.prototype.hasOwnProperty.call(storageCache, key)) {
          originalSetItem.call(localStorage, key, storageCache[key]);
        }
      }
      isReady = true;
      console.log("[Thesara Shim] Storage synchronized.");
      parent.postMessage({ type: 'thesara:shim:ready', cap: CAP }, '*');
      return;
    }

    // After init, all messages must have a matching token
    if (!CAP || msg.cap !== CAP) {
        console.warn("[Thesara Shim] Ignoring message with invalid or missing capability token.");
        return;
    }

    switch (msg.type) {
      case 'thesara:shim:ack':
        awaitingAck = false;
        console.log("[Thesara Shim] Received ack from parent.");
        // If there's pending data, try flushing it now
        if (offlineQueue.length > 0 || batch.length > 0) {
            scheduleFlush();
        }
        break;

      case 'thesara:storage:sync':
        console.log("[Thesara Shim] Received sync with snapshot:", msg.snapshot);
        if (flushTimeout) clearTimeout(flushTimeout);
        batch = [];
        offlineQueue = []; // Discard pending changes on external sync
        
        originalClear.call(localStorage);
        const snapshot = msg.snapshot || {};
        storageCache = snapshot;
        for (const key in snapshot) {
          if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
            originalSetItem.call(localStorage, key, snapshot[key]);
          }
        }
        console.log("[Thesara Shim] Storage re-synchronized.");
        break;

      case 'thesara:storage:flush-now':
        console.log("[Thesara Shim] Received flush-now request.");
        flushNow();
        break;

      default:
        // Ignore unknown messages
        break;
    }
  }

  window.addEventListener('message', handleMessage);
  
  // Lifecycle hooks
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('online', () => { 
      console.log("[Thesara Shim] Browser is online, attempting to flush queue.");
      flush(); 
  });
  
  window.addEventListener('unload', () => {
      // Final attempt to flush before the page disappears.
      // Note: This is best-effort and may not always succeed.
      flushNow();
      window.removeEventListener('message', handleMessage);
  });

  // No longer announcing readiness here. It will be announced after receiving 'init'.
  console.log("[Thesara Shim] Shim loaded and waiting for init message from parent.");

})();