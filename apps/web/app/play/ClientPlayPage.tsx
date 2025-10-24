'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { joinUrl } from '@/lib/url';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import { getJwt, setInitialJwt, fetchSnapshot, patchStorage, makeNamespace, BatchItem } from '@/lib/storage/snapshot-loader';

type BuildStatusResponse = {
  state?: string;
  artifacts?: { networkPolicy?: string };
};

type ListingResponse = {
  item?: { buildId?: string; authorEmail?: string; owner?: string };
};

export default function ClientPlayPage({ appId }: { appId: string }) {
  const searchParams = useSafeSearchParams();
  const run = useMemo(
    () => searchParams.get('run') === '1' || searchParams.get('autoplay') === '1',
    [searchParams],
  );
  const token = useMemo(() => searchParams.get('token') ?? undefined, [searchParams]);
  const [effectiveToken, setEffectiveToken] = useState<string | undefined>(token ?? undefined);

  const [signedToken, setSignedToken] = useState<string | undefined>();
  const [storageSnapshot, setStorageSnapshot] = useState<Record<string, unknown> | null>(null);
  const storageVersionRef = useRef<string | null>(null);
  const [isShimReady, setShimReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [app, setApp] = useState<ListingResponse['item'] | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [networkPolicy, setNetworkPolicy] = useState<string | undefined>();
  const [networkDomains, setNetworkDomains] = useState<string[]>([]);
  const [appUrl, setAppUrl] = useState<string | null>(null);
  const [fallbackAppUrl, setFallbackAppUrl] = useState<string | null>(null);
  const [iframeHtml, setIframeHtml] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!effectiveToken && appId) {
      fetch(`/api/play/token?appId=${encodeURIComponent(appId)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('token_fetch_failed'))))
        .then(({ token }) => setEffectiveToken(token))
        .catch(() => {
          setError('Failed to fetch app token.');
        });
    }
  }, [appId, effectiveToken]);

  useEffect(() => {
    if (effectiveToken) {
      const fetchSignedToken = async () => {
        try {
          const response = await fetch('/api/jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: effectiveToken,
              userId: 'guest',
              role: 'user',
            }),
          });
          if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error || 'Failed to fetch signed JWT');
          }
          const { token: newSignedToken } = await response.json();
          setSignedToken(newSignedToken);
        } catch (err: any) {
          console.error('Failed to sign token:', err);
          setError(err.message || 'Failed to prepare the application token.');
        }
      };
      fetchSignedToken();
    } else {
      setSignedToken(undefined);
    }
  }, [effectiveToken]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const bootstrap = async () => {
        try {
            const ns = makeNamespace(appId, undefined);
            const jwt = await getJwt();
            await setInitialJwt(jwt);
            const { snapshot, version } = await fetchSnapshot(jwt, ns);
            setStorageSnapshot(snapshot);
            storageVersionRef.current = version;
        } catch (err) {
            console.error('[storage] Failed to fetch initial snapshot:', err);
            setError('Failed to load app data.');
        }
    };
    bootstrap();
  }, [appId, signedToken]);

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !storageSnapshot) {
      return;
    }
    console.log('[storage] Iframe loaded. Sending init snapshot.');
    iframe.contentWindow.postMessage(
      { type: 'thesara:storage:init', snapshot: storageSnapshot },
      '*'
    );
  }, [storageSnapshot]);

  // Message listener for events from the iframe shim
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (event.source !== iframe?.contentWindow) {
        return; // Ignore messages from other sources
      }

      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'thesara:shim:ready':
          console.log('[storage] Shim is ready.');
          setShimReady(true);
          if (storageSnapshot) {
            handleIframeLoad();
          }
          break;

        case 'thesara:storage:flush': {
          if (!signedToken || !storageVersionRef.current) {
            console.warn('[storage] Flush received but user/token/version is not ready.');
            return;
          }
          const batch = msg.batch as BatchItem[];
          if (!batch || batch.length === 0) return;

          console.log(`[storage] Flushing batch of ${batch.length} items.`);
          const ns = makeNamespace(appId, undefined);

          try {
            const { newVersion, newSnapshot } = await patchStorage(
              signedToken,
              ns,
              storageVersionRef.current,
              batch
            );
            console.log(`[storage] PATCH successful. New version: ${newVersion}`);
            storageVersionRef.current = newVersion;

            // Use the snapshot from the PATCH response if available, otherwise refetch.
            const snapshotToBroadcast = newSnapshot ?? (await fetchSnapshot(signedToken, ns)).snapshot;

            setStorageSnapshot(snapshotToBroadcast);

            // Broadcast the update to other tabs
            const bc = new BroadcastChannel(`storage-${appId}`);
            bc.postMessage({ 
              type: 'thesara:storage:update', 
              snapshot: snapshotToBroadcast, 
              version: newVersion 
            });
            bc.close();

          } catch (err) {
            console.error('[storage] Failed to patch storage after retries:', err);
            // Optionally show a non-intrusive toast to the user
          }
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [appId, signedToken, storageSnapshot, handleIframeLoad]);

  // BroadcastChannel listener for multi-tab sync
  useEffect(() => {
    const bc = new BroadcastChannel(`storage-${appId}`);

    const handleBroadcast = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'thesara:storage:update') {
        console.log('[storage] Received broadcast update from another tab.');
        storageVersionRef.current = msg.version;
        setStorageSnapshot(msg.snapshot);

        // Forward the new snapshot to our iframe
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'thesara:storage:sync', snapshot: msg.snapshot },
          '*'
        );
      }
    };

    bc.addEventListener('message', handleBroadcast);
    return () => {
      bc.removeEventListener('message', handleBroadcast);
      bc.close();
    };
  }, [appId]);

  // beforeunload handler to flush pending changes
  useEffect(() => {
    const handleBeforeUnload = () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'thesara:storage:flush-now' }, '*');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!appId) {
        setError('Missing app id.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setErrorCode(null);
      setBuildId(null);
      setApp(null);
      setState(null);
      setAppUrl(null);
      setIframeHtml(null);
      setFallbackAppUrl(null);
      setNetworkPolicy(undefined);
      setNetworkDomains([]);

      try {
        const listing = await apiFetch<ListingResponse>(`/listing/${encodeURIComponent(appId)}`);
        if (cancelled) return;
        setApp(listing?.item ?? null);
        const latestBuildId = listing?.item?.buildId || null;
        if (!latestBuildId) {
          if (!cancelled) {
            setBuildId(null);
            setError('Build not found.');
          }
          setLoading(false);
          return;
        }
        if (cancelled) return;

        setBuildId(latestBuildId);
        const safeId = encodeURIComponent(latestBuildId);

        try {
          const status = await apiFetch<BuildStatusResponse>(`/build/${safeId}/status`, { auth: true });
          if (cancelled) return;
          setState(status?.state ?? null);
          const policy = status?.artifacts?.networkPolicy;
          if (policy) {
            setNetworkPolicy(policy);
          }
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError) {
            setErrorCode(err.code || String(err.status));
          }
        }

        try {
          const manifestUrl = joinUrl(API_URL, `/builds/${safeId}/build/manifest_v1.json`);
          const res = await fetch(manifestUrl, { cache: 'no-store', credentials: 'include' });
          if (!cancelled && res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.networkDomains)) {
              setNetworkDomains(data.networkDomains.map((d: unknown) => String(d)).slice(0, 10));
            }
          }
        } catch {
          // ignore manifest failures
        }

        if (cancelled) return;
        const qp = effectiveToken ? `?token=${encodeURIComponent(effectiveToken)}` : '';
        const bundleUrl = `/builds/${safeId}/bundle/index.html${qp}`;
        const legacyUrl = `/builds/${safeId}/build/index.html${qp}`;
        setAppUrl(bundleUrl);
        setFallbackAppUrl(legacyUrl);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message || 'Failed to load app.');
          setErrorCode(err.code || String(err.status));
        } else {
          setError('Failed to load app.');
        }
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [appId, effectiveToken]);

  useEffect(() => {
    if (!appUrl && !loading && !error) {
      setError('Could not determine app URL.');
    }
  }, [appUrl, loading, error]);

  useEffect(() => {
    if (!appUrl) {
      return;
    }

    let cancelled = false;

    async function fetchHtml() {
      if (!appUrl) {
        return;
      }
      try {
        const fetchWithNoStore = (url: string) => fetch(url, { cache: 'no-store' });

        let response = await fetchWithNoStore(appUrl);
        if (cancelled) return;
        let attemptedCacheBypass = false;

        while (response.status === 304 && !attemptedCacheBypass) {
          attemptedCacheBypass = true;
          const retryUrl = new URL(appUrl, window.location.origin);
          retryUrl.searchParams.set('_cb', Date.now().toString());
          response = await fetchWithNoStore(retryUrl.toString());
          if (cancelled) return;
        }
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(`Failed to load app content, status: ${response.status}`);
        }

        const htmlContent = await response.text();
        if (cancelled) return;

        const finalUrl = new URL(response.url);
        const pathname = finalUrl.pathname;
        const basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1);

        const parser = new DOMParser();
        const parsedDocument = parser.parseFromString(htmlContent, 'text/html');
        const head = parsedDocument.querySelector('head');
        if (!head) {
          throw new Error('App HTML is missing a <head> element.');
        }

        // Inject the meta-CSP for defense-in-depth
        const cspMeta = parsedDocument.createElement('meta');
        cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
        cspMeta.setAttribute('content', "default-src 'none'; script-src 'self' https://apps.thesara.space; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'none';");
        head.prepend(cspMeta);

        // Inject the storage shim script
        const shimScript = parsedDocument.createElement('script');
        shimScript.src = '/shim.js';
        shimScript.defer = true;
        head.appendChild(shimScript);

        const baseElement = head.querySelector('base') ?? parsedDocument.createElement('base');

        const safeBuildId = buildId ? encodeURIComponent(buildId) : null;
        const preferredBasePath = safeBuildId ? `/builds/${safeBuildId}/bundle/` : basePath;

        let baseHref: string;
        try {
          baseHref = new URL(preferredBasePath, finalUrl).toString();
        } catch {
          baseHref = `${window.location.origin}${preferredBasePath}`;
        }

        const normalizedBaseHref = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;

        baseElement.setAttribute('href', normalizedBaseHref);
        if (!baseElement.parentElement) {
          head.insertBefore(baseElement, head.firstChild);
        }

        const serializedHtml = parsedDocument.documentElement?.outerHTML ?? htmlContent;
        const hasDoctype = /^<!doctype/i.test(htmlContent);
        const finalHtml = `${hasDoctype ? '<!DOCTYPE html>\n' : ''}${serializedHtml}`;

        if (cancelled) return;

        setIframeHtml(finalHtml);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        if (fallbackAppUrl && appUrl !== fallbackAppUrl) {
          setLoading(true);
          setAppUrl(fallbackAppUrl);
          return;
        }
        setError(err.message || 'Failed to fetch app HTML.');
        setLoading(false);
      }
    }

    fetchHtml();

    return () => {
      cancelled = true;
    };
  }, [appUrl, fallbackAppUrl, buildId, signedToken, appId]);

  if (loading || !storageSnapshot) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Loading app...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Unable to load app</h1>
        <p>{error}</p>
        {errorCode && (
          <p>
            <strong>Code:</strong> {errorCode}
          </p>
        )}
      </div>
    );
  }

  if (!iframeHtml) {
    if (state && state !== 'published') {
      return (
        <div style={{ padding: 24 }}>
          <h1>Build {buildId} in state {state}</h1>
        </div>
      );
    }
    if (!loading) {
      return (
        <div style={{ padding: 24 }}>
          <h1>Build not found</h1>
        </div>
      );
    }
    return null;
  }

  const needsConsent =
    typeof networkPolicy === 'string' && networkPolicy.toUpperCase() === 'OPEN_NET' && !run;

  if (needsConsent) {
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Launch application</h1>
        <p className="text-sm" style={{ marginBottom: 8 }}>
          This app requests Open Net access.
          {networkDomains.length > 0 && ' Reported domains:'}
        </p>
        {networkDomains.length > 0 && (
          <ul style={{ marginBottom: 12, paddingLeft: 18, listStyle: 'disc' }}>
            {networkDomains.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href={`?run=1${effectiveToken ? `&token=${encodeURIComponent(effectiveToken)}` : ''}`} className="px-3 py-2 bg-emerald-600 text-white rounded">
            Launch app
          </Link>
          <Link href="/apps" className="px-3 py-2 border rounded">
            Cancel
          </Link>
        </div>
        <p className="text-xs" style={{ marginTop: 12, color: '#475569' }}>
          Apps run inside a sandboxed iframe with a strict CSP.
        </p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={iframeHtml}
      onLoad={handleIframeLoad}
      style={{ border: 'none', width: '100%', height: '100vh' }}
      sandbox="allow-scripts allow-popups allow-forms"
    />
  );
}
