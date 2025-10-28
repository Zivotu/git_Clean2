'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { joinUrl } from '@/lib/url';
import { Spinner } from '@/components/ui/Spinner';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';

type BuildStatusResponse = {
  state?: string;
  artifacts?: { networkPolicy?: string };
};

type ArtifactsResponse = {
  buildId: string;
  previewIndex?: { exists: boolean; url: string };
};

type ListingResponse = {
  item?: { buildId?: string };
};

const IFRAME_SANDBOX = 'allow-scripts allow-forms allow-downloads';

export default function ClientPlayPage({ appId }: { appId: string }) {
  const searchParams = useSafeSearchParams();
  const run = useMemo(
    () => searchParams.get('run') === '1' || searchParams.get('autoplay') === '1',
    [searchParams],
  );
  const token = useMemo(() => searchParams.get('token') ?? undefined, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [friendlyError, setFriendlyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!appId) {
        setError('Missing app id.');
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setErrorCode(null);
      setBuildId(null);
      setState(null);
      setIframeSrc(null);
      setNetworkPolicy(undefined);
      setNetworkDomains([]);

      try {
        const listing = await apiFetch<ListingResponse>(`/listing/${encodeURIComponent(appId)}`);
        const latestBuildId = listing?.item?.buildId || null;
        if (!latestBuildId) {
          if (!cancelled) {
            setBuildId(null);
            setError('Build not found.');
          }
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

        // Best-effort fetch of manifest to list reported network domains
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
        const qp = token ? `?token=${encodeURIComponent(token)}` : '';
        const base = joinUrl(API_URL, `/app/${encodeURIComponent(appId)}/`);
        setIframeSrc(`${base}${qp}`);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message || 'Failed to load app.');
          setErrorCode(err.code || String(err.status));
        } else {
          setError('Failed to load app.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [appId, token]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <Spinner size="lg" />
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

  if (friendlyError) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Unable to load app</h1>
        <p>{friendlyError}</p>
      </div>
    );
  }

  if (!iframeSrc) {
    // This case should be covered by friendlyError, but as a fallback:
    return <div style={{ padding: 24 }}><h1>Application could not be loaded.</h1></div>;
  }

  return (
    <iframe
      src={iframeSrc}
      style={{ border: 'none', width: '100%', height: '100vh' }}
      sandbox={IFRAME_SANDBOX}
      referrerPolicy="no-referrer"
    />
  );
}
