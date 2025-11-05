'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useEntitlements, type Entitlements } from '@/hooks/useEntitlements';
import { shouldShowAds } from '@/lib/ads';

type AdsContextValue = {
  showAds: boolean;
  loading: boolean;
  entitlements?: Entitlements;
};

const AdsContext = createContext<AdsContextValue>({ showAds: false, loading: true });

export function AdsProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useEntitlements();

  const value = useMemo<AdsContextValue>(() => {
    return {
      showAds: shouldShowAds(data),
      loading,
      entitlements: data,
    };
  }, [data, loading]);

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds() {
  return useContext(AdsContext);
}
