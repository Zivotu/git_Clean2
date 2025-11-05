'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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

type ApplicationStatus = 'pending' | 'approved' | 'rejected';
type PayoutStatus = 'pending' | 'processing' | 'paid' | 'rejected';

const applicationTabs: { id: ApplicationStatus; label: string }[] = [
  { id: 'pending', label: 'Nove prijave' },
  { id: 'approved', label: 'Odobreni' },
  { id: 'rejected', label: 'Odbijeni' },
];

const payoutTabs: { id: PayoutStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Za obradu' },
  { id: 'processing', label: 'U obradi' },
  { id: 'paid', label: 'Plaćeni' },
  { id: 'rejected', label: 'Odbijeni' },
  { id: 'all', label: 'Svi' },
];

function formatDate(ts?: number) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('hr-HR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function AmbassadorProgram() {
  const { user, loading } = useAuth();
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

  // Simple KPIs
  const [kpiApproved, setKpiApproved] = useState(0);
  const [kpiPendingApps, setKpiPendingApps] = useState(0);
  const [kpiPendingPayouts, setKpiPendingPayouts] = useState(0);
  const [kpiOutstandingBalance, setKpiOutstandingBalance] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      void loadApplications(selectedStatus);
      void refreshKpis();
      void loadPosts();
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
        setAppsError('Pristup dopušten samo administratorima.');
      } else {
        setAppsError(err?.message || 'Neuspješno učitavanje prijava.');
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
        setPayoutError('Pristup dopušten samo administratorima.');
      } else {
        setPayoutError(err?.message || 'Neuspješno učitavanje isplata.');
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
    } catch {}
  }

  async function loadPosts() {
    setPostsLoading(true);
    setPostsError('');
    try {
      const res = await fetchAmbassadorPosts({ status: 'pending', limit: 50 });
      setPosts(res.items);
    } catch (err: any) {
      setPostsError(err?.message || 'Neuspješno učitavanje objava.');
    } finally {
      setPostsLoading(false);
    }
  }

  async function handleApprove(uid: string) {
    setActionMessage('');
    try {
      const res = await approveAmbassador(uid);
      setActionMessage(`Ambasador odobren. Kod: ${res.promoCode}`);
      await loadApplications('pending', true);
      await loadApplications('approved', true);
    } catch (err: any) {
      const msg = err?.message || 'Odobravanje nije uspjelo.';
      setActionMessage(msg);
    }
  }

  async function handleReject(uid: string) {
    const reason = window.prompt('Razlog odbijanja (opcionalno):');
    if (reason === null) return;
    setActionMessage('');
    try {
      await rejectAmbassador(uid, reason || undefined);
      setActionMessage('Prijava je odbijena.');
      await loadApplications('pending', true);
      await loadApplications('rejected', true);
    } catch (err: any) {
      const msg = err?.message || 'Odbijanje nije uspjelo.';
      setActionMessage(msg);
    }
  }

  async function handlePayoutAction(payout: PayoutRecord, status: 'paid' | 'rejected') {
    let transactionId: string | undefined;
    let note: string | undefined;
    if (status === 'paid') {
      transactionId = window.prompt('PayPal transakcija (opcionalno):') || undefined;
    } else {
      const reason = window.prompt('Razlog odbijanja (opcionalno):');
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
        status === 'paid' ? 'Isplata označena kao plaćena.' : 'Isplata je odbijena.'
      );
    } catch (err: any) {
      const msg = err?.message || 'Akcija na isplati nije uspjela.';
      setActionMessage(msg);
    }
  }

  const currentApplications = useMemo(
    () => applications[selectedStatus] ?? [],
    [applications, selectedStatus]
  );

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Ambassador administracija</h1>
        <p className="text-sm text-gray-600">
          Pregledaj prijave, upravljaj kodovima i obradi zahtjeve za isplatu.
        </p>
        {actionMessage ? <p className="text-sm text-emerald-600">{actionMessage}</p> : null}
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">Aktivni ambasadori</div>
          <div className="text-2xl font-semibold">{kpiApproved}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Prijave na čekanju</div>
          <div className="text-2xl font-semibold">{kpiPendingApps}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Isplate na čekanju</div>
          <div className="text-2xl font-semibold">{kpiPendingPayouts}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Neisplaćeni balans (€)</div>
          <div className="text-2xl font-semibold">{kpiOutstandingBalance.toFixed(2)}</div>
        </Card>
      </div>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Objave ambasadora (na čekanju)</h2>
          <Button variant="secondary" onClick={loadPosts}>Osvježi</Button>
        </div>
        {postsLoading ? <p className="text-sm text-gray-500">Učitavanje…</p> : null}
        {postsError ? <p className="text-sm text-red-600">{postsError}</p> : null}
        {posts.length === 0 && !postsLoading ? (
          <p className="text-sm text-gray-500">Nema objava na čekanju.</p>
        ) : null}
        {posts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Link</th>
                  <th className="py-2 pr-4">Ambasador</th>
                  <th className="py-2 pr-4">Mjesec</th>
                  <th className="py-2 pr-4">Akcije</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-3 pr-4">
                      <a href={p.url} target="_blank" className="text-emerald-700 underline truncate inline-block max-w-[40ch]" rel="noopener noreferrer">{p.url}</a>
                      <div className="text-xs text-gray-500">{p.platform || '—'}</div>
                    </td>
                    <td className="py-3 pr-4">{p.ambassadorUid}</td>
                    <td className="py-3 pr-4">{p.monthKey}</td>
                    <td className="py-3 pr-4 space-x-2">
                      <Button size="sm" onClick={async () => { await verifyAmbassadorPost({ id: p.id, status: 'verified' }); await loadPosts(); }}>Verificiraj</Button>
                      <Button size="sm" variant="secondary" onClick={async () => { const note = window.prompt('Razlog odbijanja (opcionalno):') || undefined; await verifyAmbassadorPost({ id: p.id, status: 'rejected', adminNote: note }); await loadPosts(); }}>Odbij</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {applicationTabs.map((tab) => (
            <Button
              key={tab.id}
              variant={tab.id === selectedStatus ? 'default' : 'secondary'}
              onClick={() => setSelectedStatus(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        {appsLoading ? <p className="text-sm text-gray-500">Učitavanje prijava...</p> : null}
        {appsError ? <p className="text-sm text-red-600">{appsError}</p> : null}
        {!appsLoading && currentApplications.length === 0 ? (
          <p className="text-sm text-gray-500">Nema prijava za odabrani status.</p>
        ) : null}
        {currentApplications.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Korisnik</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Prijava</th>
                  <th className="py-2 pr-4">Balans</th>
                  <th className="py-2 pr-4">Akcije</th>
                </tr>
              </thead>
              <tbody>
                {currentApplications.map((item) => (
                  <tr key={item.uid} className="border-t border-gray-100">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{item.displayName || item.handle || item.uid}</div>
                      <div className="text-xs text-gray-500">
                        {Object.entries(item.ambassador.socialLinks || {})
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{item.email || '—'}</td>
                    <td className="py-3 pr-4 capitalize">{item.ambassador.status}</td>
                    <td className="py-3 pr-4 text-sm text-gray-600 space-y-1">
                      <div>Prijavljeno: {formatDate(item.ambassador.appliedAt)}</div>
                      {item.ambassador.primaryPlatform ? (
                        <div>Platforma: {item.ambassador.primaryPlatform}</div>
                      ) : null}
                      {item.ambassador.audienceSize ? (
                        <div>Publika: {item.ambassador.audienceSize}</div>
                      ) : null}
                      <details>
                        <summary className="cursor-pointer text-xs text-blue-600">Motivacija</summary>
                        <p className="text-xs text-gray-500 whitespace-pre-line">
                          {item.ambassador.motivation || '—'}
                        </p>
                      </details>
                    </td>
                    <td className="py-3 pr-4">
                      €{(item.ambassador.earnings.currentBalance || 0).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4 space-x-2">
                      {selectedStatus === 'pending' ? (
                        <>
                          <Button size="sm" onClick={() => handleApprove(item.uid)}>
                            Odobri
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleReject(item.uid)}>
                            Odbij
                          </Button>
                        </>
                      ) : null}
                      {selectedStatus === 'approved' && item.ambassador.promoCode ? (
                        <span className="text-xs text-gray-500">Kod: {item.ambassador.promoCode}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div className="flex flex-wrap gap-2">
            {payoutTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={tab.id === selectedPayoutStatus ? 'default' : 'secondary'}
                onClick={() => setSelectedPayoutStatus(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
        {payoutLoading ? <p className="text-sm text-gray-500">Učitavanje isplata...</p> : null}
        {payoutError ? <p className="text-sm text-red-600">{payoutError}</p> : null}
        {!payoutLoading && payouts.length === 0 ? (
          <p className="text-sm text-gray-500">Nema isplata za odabrani filter.</p>
        ) : null}
        {payouts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Payout ID</th>
                  <th className="py-2 pr-4">Ambasador</th>
                  <th className="py-2 pr-4">Iznos</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">PayPal</th>
                  <th className="py-2 pr-4">Akcije</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.payoutId} className="border-t border-gray-100">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{payout.payoutId}</div>
                      <div className="text-xs text-gray-500">
                        Zatraženo: {formatDate(payout.requestedAt)}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{payout.ambassadorUid}</td>
                    <td className="py-3 pr-4">€{payout.amount.toFixed(2)}</td>
                    <td className="py-3 pr-4 capitalize">{payout.status}</td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {payout.paypalEmail || '—'}
                    </td>
                    <td className="py-3 pr-4 space-x-2">
                      {payout.status === 'pending' || payout.status === 'processing' ? (
                        <>
                          <Button size="sm" onClick={() => handlePayoutAction(payout, 'paid')}>
                            Označi plaćeno
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handlePayoutAction(payout, 'rejected')}
                          >
                            Odbij
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {payout.transactionId ? `Txn: ${payout.transactionId}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
