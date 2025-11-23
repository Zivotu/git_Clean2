"use client";

import { Suspense, useEffect, useState } from 'react';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { startStripeOnboarding, openStripeDashboard } from '@/hooks/useConnectStatus';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import { useRouteParam } from '@/hooks/useRouteParam';
import {
  DollarSign,
  Users,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Building2,
  Wallet
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

function formatUSD(cents?: number) {
  if (typeof cents !== 'number') return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function CreatorFinancesClient({ initialHandle }: { initialHandle?: string }) {
  const handleFromRoute = useRouteParam('handle', (segments) => {
    if (segments.length > 2 && segments[0] === 'u' && segments[1] === 'finances') {
      return segments[2] ?? '';
    }
    if (segments.length > 1 && segments[0] === 'u') {
      return segments[1] ?? '';
    }
    return undefined;
  });
  const { user } = useAuth();
  // Prefer explicit initialHandle, then route-derived handle, then logged-in user's handle
  const handle = initialHandle || handleFromRoute || (user as any)?.handle || undefined;
  const searchParams = useSafeSearchParams();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
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

  const onboardingDone = searchParams.get('onboarding') === '1';

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
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Financial Overview</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your earnings and payouts for @{handle}</p>
        </div>
        {connect?.onboarded && (
          <button
            onClick={handleDashboard}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            <ExternalLink className="h-4 w-4" />
            Stripe Dashboard
          </button>
        )}
      </div>

      {onboardingDone && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <p className="font-medium">Onboarding completed successfully!</p>
        </div>
      )}

      {connect && (!connect.onboarded || !connect.payouts_enabled || (connect.requirements_due ?? 0) > 0) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Setup Payouts
              </h3>
              <p className="text-blue-700 dark:text-blue-300 text-sm max-w-xl">
                To receive your earnings, you need to connect a payout account. Payouts typically arrive ~3 days after payment, and you receive 70% of the revenue.
              </p>
            </div>
            <button
              onClick={handleOnboard}
              className="shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm flex items-center gap-2"
            >
              Setup Payouts
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Summary Cards */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Est. Monthly Revenue</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatUSD(metrics.totals.monthlyEstimateCreator)}
                </h3>
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Gross: {formatUSD(metrics.totals.monthlyEstimateGross)} (before fees/split)
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-violet-600 dark:text-violet-400">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">All-Access Subscribers</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {metrics.allAccess.active}
                </h3>
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {formatUSD(metrics.allAccess.unitAmount)} / month per user
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Apps</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {metrics.apps.filter(a => a.active > 0).length}
                </h3>
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Generating revenue
            </div>
          </div>
        </div>
      )}

      {metrics && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/50">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-slate-500" />
              Subscriptions by App
            </h3>
          </div>

          {metrics.apps.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              No monetized applications found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-3">Application</th>
                    <th className="px-6 py-3">Price</th>
                    <th className="px-6 py-3 text-center">Active Users</th>
                    <th className="px-6 py-3 text-right">Monthly Revenue</th>
                    <th className="px-6 py-3 text-right">Your Share (70%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {metrics.apps.map((a) => (
                    <tr key={a.appId} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">
                        {a.appId}
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                        {formatUSD(a.unitAmount)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-slate-300">
                          {a.active}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400">
                        {formatUSD((a.unitAmount ?? 0) * a.active)}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {formatUSD(a.creatorMonthly)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
