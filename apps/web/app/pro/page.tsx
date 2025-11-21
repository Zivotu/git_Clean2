"use client";

import React, { Suspense, useEffect, useState, useCallback } from 'react';
import { Check, CreditCard, Download, MoreHorizontal, Zap, ChevronRight, Shield } from 'lucide-react';
import { PUBLIC_API_URL } from '@/lib/config';
import { useRouter } from 'next/navigation';
import { useRouteParam } from '@/hooks/useRouteParam';
import PackageDetailView from './PackageDetailView';
import { useEntitlements, type Entitlements } from '@/hooks/useEntitlements';
import { useAuth } from '@/lib/auth';
import { useEarlyAccessCampaign } from '@/hooks/useEarlyAccessCampaign';
import UserSummary from '@/components/UserSummary';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-provider';
import { getListingCount } from '@/lib/listings';
import type { BillingPackage } from '@/types/billing';
import { applyPackageCopy } from './packageCopy';

type UsageInfo = {
  plan: string;
  apps: { used: number; limit: number | null };
  storage: { used: number; limit: number | null };
};

type SubscribedApp = { id: string; slug: string; title: string };

export default function ProPage() {
  return (
    <Suspense fallback={null}>
      <ProPageClient />
    </Suspense>
  );
}

function ProPageClient() {
  const router = useRouter();
  const packageId = useRouteParam('id', (segments) => {
    if (segments.length > 1 && segments[0] === 'pro') {
      return segments[1] ?? '';
    }
    return undefined;
  });
  const { locale, messages } = useI18n();
  const tPro = useCallback((k: string) => messages[`Pro.${k}`] || k, [messages]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const { data: entitlements, loading: entitlementsLoading } = useEntitlements();
  const { user } = useAuth();
  const { data: earlyAccessCampaign } = useEarlyAccessCampaign();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [nextPaymentDate, setNextPaymentDate] = useState<string | undefined>(undefined);
  const [subscribedApps, setSubscribedApps] = useState<SubscribedApp[]>([]);
  const [appsCountFallback, setAppsCountFallback] = useState<number | null>(null);
  const earlyAccessNotice =
    messages['Pro.earlyAccessNotice'] ||
    'Early Access is active: billing is temporarily paused while Gold + NoAds are free.';
  const earlyAccessActive = Boolean(earlyAccessCampaign?.isActive);

  useEffect(() => {
    if (!user) {
      setUsage(null);
      setSubscribedApps([]);
      setAppsCountFallback(null);
      return;
    }
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${PUBLIC_API_URL}/me/usage`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setUsage(await res.json());
        }
      } catch (err) {
        console.error('Failed to load usage', err);
      }
    })();
    (async () => {
      try {
        // Fallback count via listings if API usage returns 0
        const count = await getListingCount(user.uid);
        setAppsCountFallback(count);
      } catch {
        setAppsCountFallback(null);
      }
    })();
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${PUBLIC_API_URL}/me/subscribed-apps`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const items: any[] = Array.isArray(json?.items) ? json.items : [];
          const mapped: SubscribedApp[] = items.map((it) => ({
            id: String(it.id || ''),
            slug: String(it.slug || ''),
            title: String(it.title || 'App'),
          }));
          // Deduplicate by id
          const seen = new Set<string>();
          const dedup = mapped.filter((a) => (a.id && !seen.has(a.id) ? (seen.add(a.id), true) : false));
          setSubscribedApps(dedup);
        } else {
          setSubscribedApps([]);
        }
      } catch {
        setSubscribedApps([]);
      }
    })();
  }, [user]);

  useEffect(() => {
    const fetchPackages = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${PUBLIC_API_URL}/billing/packages`);
        if (!response.ok) {
          throw new Error('Failed to fetch packages');
        }
        const data = await response.json();
        setPackages(data);
      } catch (err) {
        setPackages([]);
        setError(tPro('loadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, [tPro]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(`${PUBLIC_API_URL}/billing/transactions`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setNextPaymentDate(data?.nextPaymentDate);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const goToCheckout = async (pkg: BillingPackage) => {
    const targetPriceId = pkg.priceId || pkg.id;
    setCheckoutLoading(pkg.id);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      router.push(`/pro/checkout?priceId=${encodeURIComponent(targetPriceId)}`);
    } catch (err) {
      console.error('Checkout navigation error:', err);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const LoadingSkeleton = () => (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-screen-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8 space-y-3">
          <div className="h-8 bg-gray-200 rounded w-56 mx-auto animate-pulse" />
          <div className="h-4 bg-gray-200 rounded w-80 mx-auto animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-6 border border-zinc-300 bg-white shadow-sm">
              <div className="space-y-3 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-2/3"></div>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/5"></div>
                <div className="h-10 bg-gray-200 rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );

  if (loading || entitlementsLoading) {
    return <LoadingSkeleton />;
  }

  const entitlementMap: { [key: string]: keyof Entitlements | undefined } = {
    gold: 'gold',
    noads: 'noAds',
  };

  const hasPackage = (pkg: BillingPackage) => {
    if (!entitlements) return false;
    const key = entitlementMap[pkg.id];
    if (key) return (entitlements as any)[key];
    return entitlements.purchases.includes(pkg.id);
  };

  const mapLocale = (l: string) => (l === 'hr' ? 'hr-HR' : l === 'de' ? 'de-DE' : 'en-US');
  const formatPrice = (price: number, currency: string) =>
    new Intl.NumberFormat(mapLocale(locale), {
      style: 'currency',
      currency,
    }).format(price / 100);

  const formatSampleDate = (i: number) =>
    new Date(2023, 9, 24 - i * 5).toLocaleDateString(mapLocale(locale), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const getUsagePercentage = (used: number, limit: number | null) => {
    if (limit === null) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const recommendedId = 'gold';
  const pricePeriodLabel = tPro('perMonth') || 'mjesečno';
  const enhancedPackages = packages.map((pkg) =>
    applyPackageCopy(pkg, messages, locale),
  );

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto w-full text-zinc-900 dark:text-zinc-100">

        {/* Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">{tPro('choosePlan')}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{tPro('subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:hover:text-white transition-colors">
              {tPro('contactSupport')}
            </button>
            <button
              className="px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-lg hover:opacity-95 transition-colors shadow-sm"
              onClick={() => {
                // if a recommended package exists, go to its checkout
                const pkg = enhancedPackages.find((p) => p.id === recommendedId) || enhancedPackages[0];
                if (pkg) goToCheckout(pkg);
              }}
            >
              {tPro('upgradePlan')}
            </button>
          </div>
        </div>

        {/* BENTO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">

          {/* Current Plan */}
          <div className="md:col-span-2 relative overflow-hidden rounded-3xl bg-white/5 dark:bg-[#0b0b0b] border border-zinc-300 dark:border-white/5 p-6">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {entitlements && (entitlements.gold || entitlements.noAds) ? tPro('active') : tPro('inactive')}
                  </div>
                  {nextPaymentDate && <span className="text-sm text-zinc-500">{tPro('nextPayment')} {new Date(nextPaymentDate).toLocaleDateString()}</span>}
                </div>

                <h2 className="text-3xl font-bold mb-2">{usage?.plan || (entitlements?.gold ? tPro('Gold') : tPro('Free'))}</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">{tPro('planDescription')}</p>
              </div>

              <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{recommendedId && enhancedPackages.find((p) => p.id === recommendedId) ? formatPrice((enhancedPackages.find((p) => p.id === recommendedId)!.price ?? 0), (enhancedPackages.find((p) => p.id === recommendedId)!.currency ?? 'EUR')) : ''}</span>
                  <span className="text-sm text-zinc-500">{pricePeriodLabel}</span>
                </div>
                <button
                  className="text-sm font-medium flex items-center gap-2 text-zinc-900 dark:text-white"
                  onClick={() => {
                    const pkg = enhancedPackages.find((p) => p.id === recommendedId) || enhancedPackages[0];
                    if (pkg) goToCheckout(pkg);
                  }}
                >
                  {tPro('manageSubscription')} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-3xl p-6 bg-white/5 dark:bg-[#0b0b0b] border border-zinc-300 dark:border-white/5 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div className="p-2.5 bg-zinc-900/5 rounded-xl border border-zinc-200/10 dark:border-white/3 text-zinc-400">
                <CreditCard size={20} />
              </div>
              <button className="text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors">
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{tPro('paymentMethod')}</p>
                  <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className="w-8 h-5 bg-zinc-800 rounded border border-zinc-200/10 dark:border-white/5 flex items-center justify-center text-[8px] text-zinc-400">{tPro('cardBrandVisa')}</div>
                </div>
                <span className="text-sm font-mono">{tPro('cardMasked')}</span>
              </div>
            </div>
          </div>

          {/* Last Invoice */}
          <div className="rounded-3xl p-6 bg-white/5 dark:bg-[#0b0b0b] border border-zinc-300 dark:border-white/5 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div className="p-2.5 bg-zinc-900/5 rounded-xl border border-zinc-200/10 dark:border-white/3 text-zinc-400">
                <Download size={20} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{tPro('lastInvoice')}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{tPro('invoiceSampleDate')}</span>
                <span className="text-zinc-400 text-sm">{formatPrice(enhancedPackages[0]?.price ?? 0, enhancedPackages[0]?.currency ?? 'EUR')}</span>
              </div>
              <button className="mt-3 w-full py-1.5 text-xs font-medium text-zinc-500 bg-zinc-900/5 rounded hover:opacity-95 transition-colors">
                {tPro('downloadPdf')}
              </button>
            </div>
          </div>

          {/* Usage Stats (spans 2 cols) */}
          <div className="md:col-span-2 lg:col-span-2 rounded-3xl p-6 bg-white/5 dark:bg-[#0b0b0b] border border-zinc-300 dark:border-white/5 flex flex-col gap-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold flex items-center gap-2">{tPro('usageTitle')}</h3>
              <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-900 px-2 py-1 rounded border border-white/3">{tPro('resetsIn')}</span>
            </div>

            {/* Published Apps */}
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{tPro('apps')}</span>
                <span className="font-mono">{Math.max(usage?.apps.used || 0, appsCountFallback ?? 0)}<span className="text-zinc-500">/{usage?.apps.limit ?? '∞'}</span></span>
              </div>
                <div className="h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-200/20 dark:border-white/5 mt-2">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${getUsagePercentage(Math.max(usage?.apps.used || 0, appsCountFallback ?? 0), usage?.apps.limit ?? null)}%` }} />
              </div>
            </div>

            {/* Storage */}
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{tPro('storage')}</span>
                <span className="font-mono">{usage?.storage.used ?? 0}<span className="text-zinc-500">/{usage?.storage.limit ?? '∞'}</span></span>
              </div>
              <div className="h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-200/20 dark:border-white/5 mt-2">
                <div className="h-full bg-gradient-to-r from-blue-600 to-purple-500" style={{ width: `${getUsagePercentage(usage?.storage.used ?? 0, usage?.storage.limit ?? null)}%` }} />
              </div>
            </div>
          </div>

          {/* Promo / Upsell */}
          <div className="md:col-span-2 lg:col-span-2 rounded-3xl p-6 bg-gradient-to-br from-purple-900/8 to-white/2 border border-purple-500/10 relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 h-full">
              <div>
                <div className="flex items-center gap-2 text-purple-500 mb-1">
                  <Zap size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">{tPro('earlyAccess')}</span>
                </div>
                <h3 className="text-xl font-bold">{tPro('promoTitle')}</h3>
                <p className="text-sm text-zinc-500 max-w-xs">{tPro('promoText')}</p>
              </div>
              <button className="px-5 py-2.5 bg-white text-black font-bold text-sm rounded-xl hover:bg-zinc-100 transition-colors shadow-sm">
                {tPro('joinWaitlist')}
              </button>
            </div>
          </div>

        </div>

        {/* Available Plans (packages) */}
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-4">{tPro('availablePlans')}</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {enhancedPackages.map((pkg) => {
              const owned = hasPackage(pkg);
              const recommended = pkg.id === recommendedId;
              const isPackageLoading = checkoutLoading === pkg.id;
              const isCheckoutDisabled = owned || isPackageLoading || earlyAccessActive;
              const featureList = pkg.features || [];
              const suffix = pkg.billingPeriod && pkg.billingPeriod !== 'month' ? `/${pkg.billingPeriod}` : pricePeriodLabel;
              return (
                <div key={pkg.id} className={`p-6 rounded-2xl bg-white/5 dark:bg-[#0b0b0b] border border-zinc-300 dark:border-white/5 ${owned ? 'ring-1 ring-emerald-400/20' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-xl font-semibold">{pkg.name}</h4>
                    {owned ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">{tPro('subscribed')}</span>
                    ) : recommended ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">{tPro('recommended')}</span>
                    ) : null}
                  </div>
                  {pkg.description && <p className="text-sm text-zinc-500 mb-4">{pkg.description}</p>}
                  {pkg.price != null && pkg.currency && (
                    <div className="text-2xl font-bold mb-4 flex items-baseline gap-2">
                      {formatPrice(pkg.price, pkg.currency)} <span className="text-sm font-normal text-zinc-500">{suffix}</span>
                    </div>
                  )}
                  {featureList.length > 0 && (
                    <ul className="mb-4 list-disc pl-5 text-sm text-zinc-500 space-y-1">
                      {featureList.map((feature) => (
                        <li key={`${pkg.id}-${feature}`}>{feature}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    className={`w-full py-2 text-sm font-medium rounded ${isCheckoutDisabled ? 'bg-zinc-300 text-zinc-600 cursor-not-allowed' : 'bg-zinc-900 text-white hover:opacity-95'}`}
                    onClick={() => !isCheckoutDisabled && goToCheckout(pkg)}
                    disabled={isCheckoutDisabled}
                  >
                    {isPackageLoading ? tPro('loading') : owned ? tPro('subscribed') : tPro('selectPackage')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="mt-10">
          <h3 className="text-lg font-bold mb-4">{tPro('recentActivity')}</h3>
          <div className="border border-zinc-300 dark:border-white/5 rounded-2xl overflow-hidden bg-white/5 dark:bg-[#0b0b0b]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/3 text-zinc-500">
                <tr>
                  <th className="px-6 py-4 font-medium">{tPro('invoiceId')}</th>
                  <th className="px-6 py-4 font-medium">{tPro('date')}</th>
                  <th className="px-6 py-4 font-medium">{tPro('amount')}</th>
                  <th className="px-6 py-4 font-medium">{tPro('status')}</th>
                  <th className="px-6 py-4 font-medium text-right">{tPro('action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-zinc-500">#INV-2023-00{i}</td>
                    <td className="px-6 py-4 text-zinc-300">{formatSampleDate(i)}</td>
                    <td className="px-6 py-4 text-white font-medium">{formatPrice(enhancedPackages[0]?.price ?? 0, enhancedPackages[0]?.currency ?? 'EUR')}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                        <Check size={10} /> {tPro('paid')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

