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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const json = await apiGet<ResponseShape>('/early-access');
      setData(json?.settings ?? null);
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
