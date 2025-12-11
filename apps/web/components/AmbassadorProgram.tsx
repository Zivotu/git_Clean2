'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-provider';
import {
  approveAmbassador,
  fetchAmbassadorApplications,
  fetchPayouts,
  processPayout,
  rejectAmbassador,
  fetchAmbassadorPosts,
  verifyAmbassadorPost,
  type AmbassadorApplicationItem,
  type PayoutRecord,
  type AmbassadorPost,
} from '@/lib/ambassador';
import {
  Users,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Search,
  Filter
} from 'lucide-react';

type ApplicationStatus = 'pending' | 'approved' | 'rejected';
type PayoutStatus = 'pending' | 'processing' | 'paid' | 'rejected';

export default function AmbassadorProgram() {
  const { user, loading } = useAuth();
  const { locale, messages } = useI18n();
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus>('pending');
  const [applications, setApplications] = useState<Record<ApplicationStatus, AmbassadorApplicationItem[]>>({
    pending: [],
    approved: [],
    rejected: [],
  });
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [selectedPayoutStatus, setSelectedPayoutStatus] = useState<PayoutStatus | 'all'>('pending');
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  // Posts review
  const [posts, setPosts] = useState<AmbassadorPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState('');
  // Application details modal
  const [selectedApplication, setSelectedApplication] = useState<AmbassadorApplicationItem | null>(null);

  // Simple KPIs
  const [kpiApproved, setKpiApproved] = useState(0);
  const [kpiPendingApps, setKpiPendingApps] = useState(0);
  const [kpiPendingPayouts, setKpiPendingPayouts] = useState(0);
  const [kpiOutstandingBalance, setKpiOutstandingBalance] = useState(0);
  const tAdmin = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = messages[`Admin.${key}`] || key;
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          value = value.replaceAll(`{${paramKey}}`, String(paramValue));
        }
      }
      return value;
    },
    [messages],
  );

  const formatDate = useCallback(
    (ts?: number) => {
      if (!ts) return tAdmin('ambassador.emptyValue');
      try {
        return new Date(ts).toLocaleDateString(locale || 'en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      } catch {
        return tAdmin('ambassador.emptyValue');
      }
    },
    [locale, tAdmin],
  );

  const applicationTabs = useMemo(
    () => [
      { id: 'pending' as ApplicationStatus, label: tAdmin('ambassador.applicationTabs.pending') },
      { id: 'approved' as ApplicationStatus, label: tAdmin('ambassador.applicationTabs.approved') },
      { id: 'rejected' as ApplicationStatus, label: tAdmin('ambassador.applicationTabs.rejected') },
    ],
    [tAdmin],
  );

  const payoutTabs = useMemo(
    () => [
      { id: 'pending' as PayoutStatus | 'all', label: tAdmin('ambassador.payoutTabs.pending') },
      { id: 'processing' as PayoutStatus | 'all', label: tAdmin('ambassador.payoutTabs.processing') },
      { id: 'paid' as PayoutStatus | 'all', label: tAdmin('ambassador.payoutTabs.paid') },
      { id: 'rejected' as PayoutStatus | 'all', label: tAdmin('ambassador.payoutTabs.rejected') },
      { id: 'all' as PayoutStatus | 'all', label: tAdmin('ambassador.payoutTabs.all') },
    ],
    [tAdmin],
  );

  useEffect(() => {
    if (!loading && user) {
      void loadApplications(selectedStatus);
      void refreshKpis();
      // void loadPosts(); // Disabled: Post verification not used
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, selectedStatus]);

  useEffect(() => {
    if (!loading && user) {
      void loadPayouts(selectedPayoutStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, selectedPayoutStatus]);

  async function loadApplications(status: ApplicationStatus, force = false) {
    if (!user) return;
    if (!force && applications[status]?.length > 0) return;
    setAppsLoading(true);
    setAppsError('');
    try {
      const res = await fetchAmbassadorApplications(status);
      setApplications((prev) => ({ ...prev, [status]: res.items }));
    } catch (err: any) {
      if (typeof err?.status === 'number' && err.status === 403) {
        setAppsError(tAdmin('ambassador.errors.adminOnly'));
      } else {
        setAppsError(err?.message || tAdmin('ambassador.errors.loadApplications'));
      }
    } finally {
      setAppsLoading(false);
    }
  }

  async function loadPayouts(status: PayoutStatus | 'all', force = false) {
    if (!user) return;
    setPayoutLoading(true);
    setPayoutError('');
    try {
      const res = await fetchPayouts(status);
      setPayouts(res.items);
    } catch (err: any) {
      if (typeof err?.status === 'number' && err.status === 403) {
        setPayoutError(tAdmin('ambassador.errors.adminOnly'));
      } else {
        setPayoutError(err?.message || tAdmin('ambassador.errors.loadPayouts'));
      }
    } finally {
      setPayoutLoading(false);
    }
  }

  async function refreshKpis() {
    if (!user) return;
    try {
      const [pendingRes, approvedRes, payoutsRes] = await Promise.all([
        fetchAmbassadorApplications('pending' as any),
        fetchAmbassadorApplications('approved' as any),
        fetchPayouts('pending'),
      ]);
      setKpiPendingApps(pendingRes.items.length);
      setKpiApproved(approvedRes.items.length);
      setKpiPendingPayouts(payoutsRes.items.length);
      const outstanding = approvedRes.items.reduce((sum, it) => sum + (it.ambassador.earnings?.currentBalance || 0), 0);
      setKpiOutstandingBalance(outstanding);
    } catch { }
  }

  async function loadPosts() {
    setPostsLoading(true);
    setPostsError('');
    try {
      const res = await fetchAmbassadorPosts({ status: 'pending', limit: 50 });
      setPosts(res.items);
    } catch (err: any) {
      setPostsError(err?.message || tAdmin('ambassador.errors.loadPosts'));
    } finally {
      setPostsLoading(false);
    }
  }

  async function handleApprove(uid: string) {
    setActionMessage('');
    try {
      const res = await approveAmbassador(uid);
      setActionMessage(tAdmin('ambassador.messages.approveSuccess', { code: res.promoCode || tAdmin('ambassador.emptyValue') }));
      await loadApplications('pending', true);
      await loadApplications('approved', true);
    } catch (err: any) {
      const msg = err?.message || tAdmin('ambassador.errors.approveFailed');
      setActionMessage(msg);
    }
  }

  async function handleReject(uid: string) {
    const reason = window.prompt(tAdmin('ambassador.prompts.rejectReason'));
    if (reason === null) return;
    setActionMessage('');
    try {
      await rejectAmbassador(uid, reason || undefined);
      setActionMessage(tAdmin('ambassador.messages.rejectSuccess'));
      await loadApplications('pending', true);
      await loadApplications('rejected', true);
    } catch (err: any) {
      const msg = err?.message || tAdmin('ambassador.errors.rejectFailed');
      setActionMessage(msg);
    }
  }

  async function handlePayoutAction(payout: PayoutRecord, status: 'paid' | 'rejected') {
    let transactionId: string | undefined;
    let note: string | undefined;
    if (status === 'paid') {
      transactionId = window.prompt(tAdmin('ambassador.prompts.paypalTransaction')) || undefined;
    } else {
      const reason = window.prompt(tAdmin('ambassador.prompts.rejectReason'));
      if (reason === null) return;
      note = reason || undefined;
    }
    try {
      await processPayout({
        payoutId: payout.payoutId,
        status,
        transactionId,
        note,
      });
      await loadPayouts(selectedPayoutStatus, true);
      setActionMessage(
        status === 'paid' ? tAdmin('ambassador.messages.payoutPaid') : tAdmin('ambassador.messages.payoutRejected')
      );
    } catch (err: any) {
      const msg = err?.message || tAdmin('ambassador.errors.payoutActionFailed');
      setActionMessage(msg);
    }
  }

  const currentApplications = useMemo(
    () => applications[selectedStatus] ?? [],
    [applications, selectedStatus]
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{tAdmin('ambassador.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {tAdmin('ambassador.subtitle')}
        </p>
        {actionMessage && (
          <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-900/30 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            {actionMessage}
          </div>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{tAdmin('ambassador.kpis.approved')}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{kpiApproved}</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{tAdmin('ambassador.kpis.pendingApplications')}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{kpiPendingApps}</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{tAdmin('ambassador.kpis.pendingPayouts')}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{kpiPendingPayouts}</div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-100 dark:bg-rose-900/30 rounded-lg text-rose-600 dark:text-rose-400">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{tAdmin('ambassador.kpis.outstandingBalance')}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{kpiOutstandingBalance.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tAdmin('ambassador.posts.heading')}</h2>
          <button
            onClick={loadPosts}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${postsLoading ? 'animate-spin' : ''}`} />
            {tAdmin('ambassador.posts.refresh')}
          </button>
        </div>

        <div className="p-6">
          {postsError && (
            <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-900/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {postsError}
            </div>
          )}

          {posts.length === 0 && !postsLoading ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {tAdmin('ambassador.posts.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.posts.table.link')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.posts.table.ambassador')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.posts.table.month')}</th>
                    <th className="px-4 py-3 font-medium text-right">{tAdmin('ambassador.posts.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {posts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <a href={p.url} target="_blank" className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 hover:underline max-w-[300px] truncate" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {p.url}
                        </a>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{p.platform || tAdmin('ambassador.emptyValue')}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{p.ambassadorUid}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.monthKey}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={async () => { await verifyAmbassadorPost({ id: p.id, status: 'verified' }); await loadPosts(); }}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                        >
                          <CheckCircle className="h-3 w-3" />
                          {tAdmin('ambassador.posts.verify')}
                        </button>
                        <button
                          onClick={async () => {
                            const note = window.prompt(tAdmin('ambassador.prompts.rejectReason')) || undefined;
                            await verifyAmbassadorPost({ id: p.id, status: 'rejected', adminNote: note });
                            await loadPosts();
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded text-xs font-medium hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                        >
                          <XCircle className="h-3 w-3" />
                          {tAdmin('ambassador.posts.reject')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            {applicationTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab.id === selectedStatus
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {appsError && (
            <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-900/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {appsError}
            </div>
          )}

          {!appsLoading && currentApplications.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {tAdmin('ambassador.applications.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.applications.table.user')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.applications.table.email')}</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.applications.table.status')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.applications.table.details')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.applications.table.balance')}</th>
                    <th className="px-4 py-3 font-medium text-right">{tAdmin('ambassador.applications.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {currentApplications.map((item) => (
                    <tr key={item.uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.displayName || item.handle || item.uid}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {Object.entries(item.ambassador.socialLinks || {})
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(' · ') || tAdmin('ambassador.emptyValue')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.email || tAdmin('ambassador.emptyValue')}</td>
                      <td className="px-4 py-3">
                        {item.ambassador.commissionModel === 'turbo' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-xs font-medium">
                            🚀 TURBO
                          </span>
                        ) : item.ambassador.commissionModel === 'partner' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                            💎 PARTNER
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                          ${item.ambassador.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            item.ambassador.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' :
                              'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                          {item.ambassador.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 space-y-1">
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {tAdmin('ambassador.applications.appliedAt', { date: formatDate(item.ambassador.appliedAt) })}
                        </div>
                        {item.ambassador.primaryPlatform && (
                          <div className="text-xs">{tAdmin('ambassador.applications.platform', { value: item.ambassador.primaryPlatform })}</div>
                        )}
                        {item.ambassador.audienceSize && (
                          <div className="text-xs">{tAdmin('ambassador.applications.audience', { value: item.ambassador.audienceSize })}</div>
                        )}
                        <details className="group">
                          <summary className="cursor-pointer text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                            {tAdmin('ambassador.applications.motivation')}
                            <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                          </summary>
                          <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line mt-1 pl-2 border-l-2 border-slate-200 dark:border-zinc-700">
                            {item.ambassador.motivation || tAdmin('ambassador.emptyValue')}
                          </p>
                        </details>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                        {tAdmin('ambassador.applications.balanceValue', { amount: (item.ambassador.earnings.currentBalance || 0).toFixed(2) })}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => setSelectedApplication(item)}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                        >
                          <FileText className="h-3 w-3" />
                          Detalji
                        </button>
                        {selectedStatus === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleApprove(item.uid)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" />
                              {tAdmin('ambassador.applications.approve')}
                            </button>
                            <button
                              onClick={() => handleReject(item.uid)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded text-xs font-medium hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                            >
                              <XCircle className="h-3 w-3" />
                              {tAdmin('ambassador.applications.reject')}
                            </button>
                          </>
                        ) : null}
                        {selectedStatus === 'approved' && item.ambassador.promoCode ? (
                          <span className="inline-flex items-center px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded text-xs font-mono text-slate-600 dark:text-slate-400">
                            {tAdmin('ambassador.applications.promoCode', { code: item.ambassador.promoCode })}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex flex-wrap gap-2">
            {payoutTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedPayoutStatus(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab.id === selectedPayoutStatus
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {payoutError && (
            <div className="mb-4 p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-200 dark:border-rose-900/30 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {payoutError}
            </div>
          )}

          {!payoutLoading && payouts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {tAdmin('ambassador.payouts.empty')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-zinc-800/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.payouts.table.id')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.payouts.table.ambassador')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.payouts.table.amount')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.payouts.table.status')}</th>
                    <th className="px-4 py-3 font-medium">{tAdmin('ambassador.payouts.table.paypal')}</th>
                    <th className="px-4 py-3 font-medium text-right">{tAdmin('ambassador.payouts.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {payouts.map((payout) => (
                    <tr key={payout.payoutId} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{payout.payoutId}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {tAdmin('ambassador.payouts.requestedAt', { date: formatDate(payout.requestedAt) })}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{payout.ambassadorUid}</td>
                      <td className="px-4 py-3 font-medium text-emerald-600 dark:text-emerald-400">
                        {tAdmin('ambassador.payouts.amountValue', { amount: payout.amount.toFixed(2) })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                          ${payout.status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            payout.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' :
                              'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                          {payout.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {payout.paypalEmail || tAdmin('ambassador.emptyValue')}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {payout.status === 'pending' || payout.status === 'processing' ? (
                          <>
                            <button
                              onClick={() => handlePayoutAction(payout, 'paid')}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" />
                              {tAdmin('ambassador.payouts.markPaid')}
                            </button>
                            <button
                              onClick={() => handlePayoutAction(payout, 'rejected')}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded text-xs font-medium hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                            >
                              <XCircle className="h-3 w-3" />
                              {tAdmin('ambassador.payouts.reject')}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {payout.transactionId ? tAdmin('ambassador.payouts.transaction', { id: payout.transactionId }) : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Application Details Modal */}
      {selectedApplication && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4" onClick={() => setSelectedApplication(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <h2 className="text-lg font-semibold">Detalji Prijave</h2>
                <button onClick={() => setSelectedApplication(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="flex items-center gap-3">
                {selectedApplication.photoURL ? (
                  <img src={selectedApplication.photoURL} alt="" className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div>
                  <div className="font-semibold">{selectedApplication.displayName || selectedApplication.handle}</div>
                  <div className="text-sm text-gray-600">{selectedApplication.email}</div>
                </div>
              </div>

              {selectedApplication.ambassador?.commissionModel && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Model:</div>
                  <div className="inline-block px-2 py-1 bg-slate-100 rounded text-sm">
                    {selectedApplication.ambassador.commissionModel === 'turbo' ? '🚀 TURBO' : '💎 PARTNER'}
                  </div>
                </div>
              )}

              {selectedApplication.ambassador?.socialLinks && Object.keys(selectedApplication.ambassador.socialLinks).length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Social:</div>
                  {Object.entries(selectedApplication.ambassador.socialLinks).map(([platform, url]) => (
                    <div key={platform} className="text-sm">
                      <span className="text-gray-500">{platform}:</span>{' '}
                      <a href={url as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{url as string}</a>
                    </div>
                  ))}
                </div>
              )}

              {selectedApplication.ambassador?.motivation && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Motivacija:</div>
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded whitespace-pre-line">
                    {selectedApplication.ambassador.motivation}
                  </div>
                </div>
              )}

              <button onClick={() => setSelectedApplication(null)} className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded font-medium">
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
