'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useEntitlements, type Entitlements } from '@/hooks/useEntitlements';
import { useTcfConsent } from '@/hooks/useTcfConsent';
import {
  shouldShowAds,
  type AdsSettings,
  normalizeAdsSettings,
  normalizeAdsSlots,
  type AdsSlotConfig,
  type ConsentStatus,
} from '@/lib/ads';
import { apiGet } from '@/lib/api';

type AdsContextValue = {
  showAds: boolean;
  loading: boolean;
  entitlements?: Entitlements;
  settings?: AdsSettings;
  slotConfig?: AdsSlotConfig;
  isSlotEnabled: (key: string) => boolean;
  consentStatus: ConsentStatus;
  consentLoading: boolean;
  consentReady: boolean;
  shouldShowConsentBanner: boolean;
  tcString: string | null;
  grantConsent: (source?: string) => void;
  rejectConsent: (source?: string) => void;
  resetConsent: (source?: string) => void;
};

const AdsContext = createContext<AdsContextValue>({
  showAds: false,
  loading: true,
  isSlotEnabled: () => true,
  consentStatus: 'unknown',
  consentLoading: true,
  consentReady: false,
  shouldShowConsentBanner: false,
  tcString: null,
  grantConsent: () => {},
  rejectConsent: () => {},
  resetConsent: () => {},
});

export function AdsProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useEntitlements();
  const [adsSettings, setAdsSettings] = useState<AdsSettings | null>(null);
  const [adsSettingsLoading, setAdsSettingsLoading] = useState(true);
  const [slotConfig, setSlotConfig] = useState<AdsSlotConfig | null>(null);
  const [slotConfigLoading, setSlotConfigLoading] = useState(true);
  const {
    status: consentStatus,
    ready: tcfReady,
    grantConsent,
    rejectConsent,
    resetConsent,
    tcString,
  } = useTcfConsent();
  const consentLoading = !tcfReady;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const json = await apiGet('/ads/config');
        if (!cancelled) {
          setAdsSettings(normalizeAdsSettings(json));
          setAdsSettingsLoading(false);
        }
      } catch (err) {
        console.warn('[AdsProvider] Failed to load ads config', err);
        if (!cancelled) {
          setAdsSettings({ disabled: false });
          setAdsSettingsLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSlots() {
      try {
        const json = await apiGet('/ads/slots');
        if (!cancelled) {
          setSlotConfig(normalizeAdsSlots(json));
          setSlotConfigLoading(false);
        }
      } catch (err) {
        console.warn('[AdsProvider] Failed to load ads slots', err);
        if (!cancelled) {
          setSlotConfig({});
          setSlotConfigLoading(false);
        }
      }
    }
    loadSlots();
    return () => {
      cancelled = true;
    };
  }, []);

  const slotEnabledMap = useMemo(() => {
    if (!slotConfig) return undefined;
    const map: Record<string, boolean> = {};
    for (const [key, entry] of Object.entries(slotConfig)) {
      map[key] = entry.enabled !== false;
    }
    return map;
  }, [slotConfig]);

  const isSlotEnabled = useMemo(() => {
    return (key: string) => {
      if (!slotEnabledMap || !(key in slotEnabledMap)) return true;
      return slotEnabledMap[key];
    };
  }, [slotEnabledMap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const anyWindow = window as any;
    if (consentStatus === 'rejected') {
      anyWindow.adsbygoogle = anyWindow.adsbygoogle || [];
      anyWindow.adsbygoogle.requestNonPersonalizedAds = 1;
    } else if (consentStatus === 'granted') {
      if (
        anyWindow.adsbygoogle &&
        anyWindow.adsbygoogle.requestNonPersonalizedAds
      ) {
        try {
          delete anyWindow.adsbygoogle.requestNonPersonalizedAds;
        } catch {
          anyWindow.adsbygoogle.requestNonPersonalizedAds = 0;
        }
      }
    }
  }, [consentStatus]);

  const value = useMemo<AdsContextValue>(() => {
    const globalDisabled = Boolean(adsSettings?.disabled);
    const baseEligible = shouldShowAds(data);
    const consentReady = tcfReady && consentStatus !== 'unknown';
    const loadingState =
      loading || adsSettingsLoading || slotConfigLoading || consentLoading;
    const showAdsFinal = !globalDisabled && baseEligible && consentReady;
    const shouldShowConsentBanner = consentStatus === 'unknown';
    return {
      showAds: showAdsFinal,
      loading: loadingState,
      entitlements: data,
      settings: adsSettings ?? undefined,
      slotConfig: slotConfig ?? undefined,
      isSlotEnabled,
      consentStatus,
      consentLoading,
      consentReady,
      shouldShowConsentBanner,
      tcString,
      grantConsent,
      rejectConsent,
      resetConsent,
    };
  }, [
    adsSettings,
    adsSettingsLoading,
    consentLoading,
    consentStatus,
    data,
    grantConsent,
    isSlotEnabled,
    loading,
    resetConsent,
    rejectConsent,
    slotConfig,
    slotConfigLoading,
    tcString,
    tcfReady,
  ]);

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds() {
  return useContext(AdsContext);
}
