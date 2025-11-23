"use client";

import { useT } from '@/lib/i18n-provider';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { startStripeOnboarding, openStripeDashboard } from '@/hooks/useConnectStatus';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import { useRouteParam } from '@/hooks/useRouteParam';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  DollarSign,
  Users,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Building2, // Keep Building2 for now, as it's used in the original code for active apps icon
  Wallet,
  Coins,
  ArrowRight,
  AppWindow
} from 'lucide-react';

type Metrics = {
  allAccess: {
    priceId?: string;
    unitAmount?: number;
    active: number;
    monthlyEstimateGross?: number;
    monthlyEstimateCreator?: number;
  };
  apps: Array<{
    appId: string;
    priceId?: string;
    unitAmount?: number;
    active: number;
    creatorMonthly?: number;
  }>;
  totals: { monthlyEstimateGross?: number; monthlyEstimateCreator?: number };
};

// New types for the updated metrics structure
type AppMetrics = {
  id: string;
  title: string;
  priceCents?: number;
  subscriberCount?: number;
  creatorMonthly?: number;
};

type CreatorMetrics = {
  monthlyRevenueCents?: number;
  monthlyGrossCents?: number;
  subscriberCount?: number;
  apps: AppMetrics[];
};


function formatUSD(cents?: number) {
  if (typeof cents !== 'number') return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function CreatorFinancesClient({ initialHandle }: { initialHandle?: string }) {
  const t = useT('Finances');
  const handleFromRoute = useRouteParam('handle', (segments) => {
    if (segments.length > 2 && segments[0] === 'u' && segments[1] === 'finances') {
      return segments[2] ?? '';
    }
    if (segments.length > 1 && segments[0] === 'u') {
      return segments[1] ?? '';
    }
    return undefined;
  });
  const { user, loading: userLoading } = useAuth();
  // Prefer explicit initialHandle, then route-derived handle, then logged-in user's handle
  const handle = initialHandle || handleFromRoute || (user as any)?.handle || undefined;
  const searchParams = useSafeSearchParams();
  const [metrics, setMetrics] = useState<CreatorMetrics | null>(null); // Updated type
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connect, setConnect] = useState<{ onboarded?: boolean; payouts_enabled?: boolean; requirements_due?: number } | null>(null);

  useEffect(() => {
    if (!handle) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await (user as any)?.getIdToken?.();
        const res = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(handle)}/metrics`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('bad_response');
        const json = await res.json();
        setMetrics(json.metrics);
      } catch {
        setError('Failed to load financial data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [handle, user]);

  useEffect(() => {
    if (!user?.uid) return;
    apiGet<{ onboarded?: boolean; payouts_enabled?: boolean; requirements_due?: number }>(
      `/billing/connect/status?creatorId=${encodeURIComponent(user.uid)}`,
      { auth: true },
    )
      .then(setConnect)
      .catch(() => setConnect(null));
  }, [user]);

  const justOnboarded = searchParams.get('onboarding') === '1';

  async function handleOnboard() {
    if (!user?.uid) return;
    try {
      await startStripeOnboarding(user.uid, handle);
    } catch { }
  }

  async function handleDashboard() {
    if (!user?.uid) return;
    try {
      await openStripeDashboard(user.uid);
    } catch { }
  }

  const monthlyRevenue = metrics?.monthlyRevenueCents ?? 0;
  const monthlyGross = metrics?.monthlyGrossCents ?? 0;
  const creatorSubCount = metrics?.subscriberCount ?? 0;
  const monetizedApps = useMemo(() => metrics?.apps.filter(a => (a.subscriberCount ?? 0) > 0) ?? [], [metrics]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4 flex items-center gap-3 text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5" />
          <p>{t('error.loadFailed')}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Coins className="h-6 w-6 text-emerald-500" />
            {t('title')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t('subtitle', { handle })}
          </p>
        </div>
        {connect?.onboarded && user?.uid && (
          <Button
            onClick={() => openStripeDashboard(user.uid)}
            variant="outline"
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {t('stripeDashboard')}
          </Button>
        )}
      </div>

      {justOnboarded && (
        <div className="mb-8 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <p>{t('onboardingSuccess')}</p>
        </div>
      )}

      {connect && (!connect.onboarded || !connect.payouts_enabled || (connect.requirements_due ?? 0) > 0) && user?.uid && (
        <Card className="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800">
          <div className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-xl text-blue-600 dark:text-blue-400">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">{t('setupPayouts.title')}</h3>
                <p className="text-blue-700 dark:text-blue-300 mt-1 max-w-xl">
                  {t('setupPayouts.description')}
                </p>
              </div>
            </div>
            <Button
              onClick={() => startStripeOnboarding(user.uid, handle)}
              className="shrink-0 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {t('setupPayouts.button')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Summary Cards */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('metrics.estMonthlyRevenue')}</h3>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              €{(monthlyRevenue / 100).toFixed(2)}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('metrics.gross', { amount: `€${(monthlyGross / 100).toFixed(2)}` })}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-violet-600 dark:text-violet-400">
                <Users className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('metrics.subscribers')}</h3>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {creatorSubCount}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('metrics.perMonthUser', { amount: '€5.00' })}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t('metrics.activeApps')}</h3>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {monetizedApps.length}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t('metrics.generatingRevenue')}
            </p>
          </Card>
        </div>
      )}

      {metrics && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/50">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('table.title')}</h2>
          </div>

          {monetizedApps.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400">
              <AppWindow className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>{t('table.noApps')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t('table.header.application')}</th>
                    <th className="px-6 py-3 font-medium">{t('table.header.price')}</th>
                    <th className="px-6 py-3 font-medium">{t('table.header.activeUsers')}</th>
                    <th className="px-6 py-3 font-medium">{t('table.header.monthlyRevenue')}</th>
                    <th className="px-6 py-3 font-medium">{t('table.header.yourShare')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {monetizedApps.map((app) => {
                    const price = app.priceCents ? app.priceCents / 100 : 0;
                    const count = app.subscriberCount || 0;
                    const gross = price * count;
                    const net = gross * 0.7;

                    return (
                      <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                          {app.title}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                          €{price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                          {count}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                          €{gross.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 font-medium text-emerald-600 dark:text-emerald-400">
                          €{net.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
