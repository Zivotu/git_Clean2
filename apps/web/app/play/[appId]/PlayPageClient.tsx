"use client"
import { useEffect, useRef, useState, useCallback } from 'react';
import { getJwt, setInitialJwt, fetchSnapshot, patchStorage } from '@/lib/storage/snapshot-loader';

const APPS_HOST = process.env.NEXT_PUBLIC_APPS_HOST || 'https://apps.thesara.space';
const SHIM_ENABLED = process.env.NEXT_PUBLIC_SHIM_ENABLED !== 'false';

// Helper to encode bytes into a URL-safe base64 string
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export default function PlayPageClient({ appId }: { appId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<{ snapshot: any; version: string } | null>(null);
  const storageVersionRef = useRef('0');
  const capRef = useRef<string>(''); // Capability token for iframe communication
  const bcRef = useRef<BroadcastChannel | null>(null); // BroadcastChannel for multi-tab sync

  useEffect(() => {
    if (!SHIM_ENABLED) return;

    let cancelled = false;
    (async () => {
      try {
        const jwt = await getJwt();
        await setInitialJwt(jwt);
        const snap = await fetchSnapshot(jwt, appId);
        if (cancelled) return;

        storageVersionRef.current = snap.version;
        setBootstrap(snap);
      } catch (err: any) {
        console.error('[PlayBootstrap] Failed to load snapshot:', err);
        setError(err.message || 'Could not load application data.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appId]);

  const onMessage = useCallback((event: MessageEvent) => {
    const src = iframeRef.current?.contentWindow;
    // Security: Must be from our iframe
    if (!src || event.source !== src) {
      return;
    }
    
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !msg.type) {
      if (process.env.NODE_ENV !== 'production') console.debug('[Parent] Ignoring invalid msg', msg);
      return;
    }

    // The first message from the shim does not have a capability token
    if (msg.type === 'thesara:shim:ready') {
      console.log('[Parent] Shim is ready. Generating capability token.');
      if (bootstrap) {
        const cap = base64url(crypto.getRandomValues(new Uint8Array(16)));
        capRef.current = cap;
        src.postMessage(
          { type: 'thesara:storage:init', snapshot: bootstrap.snapshot, cap },
          '*'
        );
      }
      return;
    }

    // After init, all messages must have the correct capability token
    if (msg.cap !== capRef.current) {
      if (process.env.NODE_ENV !== 'production') console.warn('[Parent] Ignoring message with invalid capability token.', msg);
      return;
    }

    switch (msg.type) {
      case 'thesara:storage:flush': {
        if (msg.batch && Array.isArray(msg.batch) && msg.batch.length > 0) {
          console.log(`[Parent] Flushing ${msg.batch.length} items from iframe.`);
          patchStorage(appId, msg.batch, storageVersionRef.current)
            .then(newVersion => {
              storageVersionRef.current = newVersion;
              // Acknowledge the flush so the shim can clear its queue
              src.postMessage({ type: 'thesara:shim:ack', cap: capRef.current }, '*');
            })
            .catch(err => {
              console.error('[Parent] Failed to patch storage:', err);
              // Optional: notify shim of failure if a retry mechanism on its side is desired
            });
        }
        break;
      }
      default:
        if (process.env.NODE_ENV !== 'production') console.debug('[Parent] Ignoring unknown msg type', msg.type);
    }
  }, [appId, bootstrap]);

  useEffect(() => {
    if (!SHIM_ENABLED) return;
    
    window.addEventListener('message', onMessage);
    
    return () => {
      window.removeEventListener('message', onMessage);
      bcRef.current?.close?.();
    };
  }, [onMessage]);

  const handleIframeLoad = () => {
    console.log('[Parent] Iframe loaded.');
    // The 'thesara:shim:ready' message from the iframe will trigger the init.
  };

  if ((!bootstrap && !error)) {
    return <div className="p-6">Loading app...</div>;
  }

  if (error) {
    return <div className="p-6">Error: {error}</div>;
  }

  if (!SHIM_ENABLED) {
    return <div className="p-6">App storage is temporarily unavailable.</div>;
  }

  const appUrl = `${APPS_HOST}/${encodeURIComponent(appId)}/index.html`;
  const csp = [
    "default-src 'self'",
    "connect-src 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
  ].join('; ');

  const srcDoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>App</title>
  <script src="/shim.js"></script>
  <script type="module" src="${appUrl}"></script>
</head>
<body>
</body>
</html>`;

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      onLoad={handleIframeLoad}
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  );
}