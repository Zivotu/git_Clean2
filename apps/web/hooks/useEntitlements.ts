'use client';

import { useAuth } from '@/lib/auth';
import { API_URL } from '@/lib/config';
import { useEffect, useState } from 'react';
import { handleFetchError } from '@/lib/handleFetchError';
import { joinUrl } from '@/lib/url';

export type Entitlements = { gold: boolean; noAds: boolean; purchases: string[] };

const GUEST_ENTITLEMENTS: Entitlements = { gold: false, noAds: false, purchases: [] };

let cache: Entitlements | null = null;
let inFlight: Promise<Entitlements> | null = null;
let controller: AbortController | null = null;
let lastUid: string | null = null;

export function useEntitlements() {
  const { user } = useAuth();
  // Set initial state to guest entitlements if there's no user and no cache
  const [data, setData] = useState<Entitlements | undefined>(cache ?? (!user ? GUEST_ENTITLEMENTS : undefined));
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!user) {
      // If user logs out, reset to guest state
      if (cache !== GUEST_ENTITLEMENTS) {
        cache = GUEST_ENTITLEMENTS;
        setData(GUEST_ENTITLEMENTS);
      }
      lastUid = null;
      controller?.abort();
      controller = null;
      inFlight = null;
      setLoading(false);
      return;
    }

    if (user.uid !== lastUid) {
      cache = null;
      controller?.abort();
      controller = null;
      inFlight = null;
      lastUid = user.uid;
    }

    if (cache) {
      setData(cache);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    if (!inFlight) {
      controller = new AbortController();
      inFlight = (async () => {
        try {
          const token = await user.getIdToken();
          const res = await fetch(joinUrl(API_URL, '/me/entitlements'), {
            credentials: 'include',
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });

          if (res.status === 404) {
            console.warn('[useEntitlements] User not found or has no entitlements, falling back to guest.');
            return GUEST_ENTITLEMENTS;
          }

          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            console.warn('[useEntitlements] Non-OK response:', res.status, json);
            // Fallback to guest on other errors too, to prevent loops
            return GUEST_ENTITLEMENTS;
          }
          
          return (await res.json()) as Entitlements;

        } catch (e: any) {
          if (e.name === 'AbortError') {
            // Don't return guest entitlements on abort, just rethrow
            throw e;
          }
          console.error('[useEntitlements] Fetch failed, falling back to guest', e);
          return GUEST_ENTITLEMENTS;
        }
      })();
    }

    inFlight
      .then((json) => {
        if (cancelled) return;
        cache = json;
        setData(json);
        setError(undefined);
      })
      .catch((err: any) => {
        if (cancelled || err.name === 'AbortError') return;
        handleFetchError(err, 'Failed to load entitlements');
        setError('Failed to load entitlements. Please check the API URL and server status.');
        // Also set guest data on hard failure
        setData(GUEST_ENTITLEMENTS);
        cache = GUEST_ENTITLEMENTS;
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        inFlight = null;
        controller = null;
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  return { loading, error, data };
}
