'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ensureTcfApi,
  getCurrentConsent,
  resetTcfConsent,
  updateTcfConsent,
} from '@/lib/cmp/tcf';
import { logAdsTelemetry } from '@/lib/adsTelemetry';

type ConsentStatus = 'unknown' | 'granted' | 'rejected';

type TcfEventListener = {
  callback: (tcString: string | null, status: ConsentStatus) => void;
  id: number;
};

export function useTcfConsent() {
  const [status, setStatus] = useState<ConsentStatus>(() => getCurrentConsent().status);
  const [tcString, setTcString] = useState<string | null>(() => getCurrentConsent().tcString);
  const [ready, setReady] = useState(false);
  const bannerLoggedRef = useRef(false);

  useEffect(() => {
    ensureTcfApi();
    setReady(true);
    if (typeof window === 'undefined' || !window.__tcfapi) return;
    const listenerId = window.__tcfapi('addEventListener', 2, (data: any, success: boolean) => {
      if (!success || !data) return;
      const currentStatus: ConsentStatus =
        data.eventStatus === 'cmpuishown'
          ? 'unknown'
          : data.purpose?.consents?.['1']
          ? 'granted'
          : 'rejected';
      setStatus(currentStatus);
      setTcString(data.tcString ?? null);
    }) as number;
    return () => {
      if (window.__tcfapi) {
        window.__tcfapi('removeEventListener', 2, () => {}, listenerId);
      }
    };
  }, []);

  const shouldShowBanner = ready && status === 'unknown';

  useEffect(() => {
    if (shouldShowBanner && !bannerLoggedRef.current) {
      logAdsTelemetry({ type: 'consent_prompt_shown', surface: 'banner' });
      bannerLoggedRef.current = true;
    }
    if (!shouldShowBanner) {
      bannerLoggedRef.current = false;
    }
  }, [shouldShowBanner]);

  const grant = useCallback((source?: string) => {
    ensureTcfApi();
    updateTcfConsent(true);
    logAdsTelemetry({ type: 'consent_granted', surface: source || 'unknown' });
  }, []);

  const reject = useCallback((source?: string) => {
    ensureTcfApi();
    updateTcfConsent(false);
    logAdsTelemetry({ type: 'consent_rejected', surface: source || 'unknown' });
  }, []);

  const reset = useCallback(() => {
    resetTcfConsent();
    logAdsTelemetry({ type: 'consent_reset' });
  }, []);

  return useMemo(
    () => ({
      status,
      tcString,
      shouldShowBanner,
      grantConsent: grant,
      rejectConsent: reject,
      resetConsent: reset,
      ready,
    }),
    [grant, ready, reject, reset, shouldShowBanner, status, tcString],
  );
}
