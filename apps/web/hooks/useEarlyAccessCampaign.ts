'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export type EarlyAccessCampaign = {
  id: string;
  isActive: boolean;
  startsAt?: number;
  durationDays?: number;
  perUserDurationDays?: number;
};

type ResponseShape = {
  settings?: EarlyAccessCampaign | null;
};

export function useEarlyAccessCampaign() {
  const [data, setData] = useState<EarlyAccessCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const DAY_MS = 24 * 60 * 60 * 1000;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const json = await apiGet<ResponseShape>('/early-access');
      let settings = json?.settings ?? null;

      // Development fallback: if running locally and the API doesn't provide
      // an active campaign (or campaign starts in the future), mock a campaign
      // that started yesterday so the UI shows the early-access banner.
      // This avoids touching production behavior.
      try {
        const isProd = process.env.NODE_ENV === 'production';
        if (!isProd) {
          const shouldMock =
            !settings ||
            !settings.isActive ||
            (typeof settings.startsAt === 'number' && settings.startsAt > Date.now());
          if (shouldMock) {
            settings = {
              id: 'dev-mock-early-access',
              isActive: true,
              startsAt: Date.now() - DAY_MS,
              durationDays: 30,
            };
            // eslint-disable-next-line no-console
            console.log('[useEarlyAccessCampaign] Using dev fallback early-access campaign', settings);
          }
        }
      } catch (e) {
        // swallow any env-read errors and continue with whatever settings we have
      }

      setData(settings);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load campaign';
      setError(message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
