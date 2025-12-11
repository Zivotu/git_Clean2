'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  fetchAmbassadorDashboard,
  requestAmbassadorPayout,
  submitAmbassadorPost,
  type AmbassadorDashboardResponse,
} from '@/lib/ambassador';

export default function AmbassadorDashboardPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<AmbassadorDashboardResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [payoutMessage, setPayoutMessage] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [postUrl, setPostUrl] = useState('');
  const [postPlatform, setPostPlatform] = useState('');
  const [postBusy, setPostBusy] = useState(false);
  const [postMsg, setPostMsg] = useState('');

  useEffect(() => {
    if (!loading && user) {
      void loadDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, refreshToken]);

  async function loadDashboard() {
    setBusy(true);
    setError('');
    try {
      const json = await fetchAmbassadorDashboard();
      setData(json);
      if (json.ambassador.payoutEmail && !paypalEmail) {
        setPaypalEmail(json.ambassador.payoutEmail);
      }
    } catch (err: any) {
      if (typeof err?.status === 'number' && err.status === 403) {
        setError('Ova stranica je dostupna samo odobrenim ambasadorima.');
        return;
      }
      const msg = err?.message || 'Neuspješno učitavanje podataka.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const currentBalance = data?.ambassador.earnings.currentBalance ?? 0;
  const payoutThreshold = data?.payoutThreshold ?? 50;
  const canRequestPayout =
    currentBalance >= payoutThreshold &&
    !busy &&
    data?.ambassador.status === 'approved' &&
    ((data?.activity?.minPostsPerMonth || 0) === 0 || (data?.activity?.verified || 0) >= (data?.activity?.minPostsPerMonth || 0));

  async function handlePayoutRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;

    const amountNumber = payoutAmount.trim()
      ? Number(payoutAmount)
      : data.ambassador.earnings.currentBalance;
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('Unesi valjani iznos za isplatu.');
      return;
    }
    if (amountNumber > data.ambassador.earnings.currentBalance + 1e-6) {
      setError('Ne možeš zatražiti više od dostupnog balansa.');
      return;
    }
    const trimmedEmail = paypalEmail.trim();
    if (trimmedEmail && !/^[^@]+@[^@]+\.[^@]+$/.test(trimmedEmail)) {
      setError('Unesi valjanu e-mail adresu za PayPal.');
      return;
    }

    setBusy(true);
    setError('');
    setPayoutMessage('');
    try {
      await requestAmbassadorPayout({
        amount: amountNumber,
        paypalEmail: trimmedEmail || undefined,
      });
      setPayoutMessage('Zahtjev za isplatu je zaprimljen.');
      setPayoutAmount('');
      setRefreshToken((token) => token + 1);
    } catch (err: any) {
      const msg = err?.message || 'Isplatu trenutno nije moguće zatražiti.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!postUrl) return;
    setPostBusy(true);
    setPostMsg('');
    try {
      await submitAmbassadorPost({ url: postUrl.trim(), platform: postPlatform || undefined });
      setPostMsg('Objava je poslana na provjeru.');
      setPostUrl('');
      setPostPlatform('');
      setRefreshToken((t) => t + 1);
    } catch (err: any) {
      setPostMsg(err?.message || 'Slanje objave nije uspjelo.');
    } finally {
      setPostBusy(false);
    }
  }

  const payouts = useMemo(() => data?.payouts ?? [], [data]);
  const promoStats = data?.promoCode;

  if (!user && !loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <Card className="p-6">
          <h1 className="text-2xl font-semibold mb-2">Prijava potrebna</h1>
          <p className="text-sm text-gray-600">
            Moraš biti prijavljen kako bi pristupio ambassador dashboardu.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Ambassador dashboard</h1>
        <p className="text-sm text-gray-600 mt-2">
          Prati učinak svog koda, trenutno stanje zarade i povijest isplata.
        </p>
      </div>

      {busy && !data ? (
        <p className="text-sm text-gray-500">Učitavanje podataka...</p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 space-y-2">
          <p className="text-sm text-gray-500">Tvoj kod</p>
          <p className="text-2xl font-semibold">
            {data?.ambassador.promoCode || '—'}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              if (data?.ambassador.promoCode) {
                navigator.clipboard.writeText(data.ambassador.promoCode).catch(() => { });
              }
            }}
            disabled={!data?.ambassador.promoCode}
          >
            Kopiraj kod
          </Button>
        </Card>

        <Card className="p-4 space-y-2">
          <p className="text-sm text-gray-500">Iskorištenja</p>
          <p className="text-2xl font-semibold">{promoStats?.usageCount ?? 0}</p>
          <p className="text-xs text-gray-500">
            Plaćene konverzije: {promoStats?.paidConversionsCount ?? 0}
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <p className="text-sm text-gray-500">Stopa konverzije</p>
          <p className="text-2xl font-semibold">
            {(() => {
              const used = promoStats?.usageCount ?? 0;
              const paid = promoStats?.paidConversionsCount ?? 0;
              if (!used) return '0%';
              const pct = Math.round((paid / used) * 1000) / 10; // 1 decimal
              return `${pct}%`;
            })()}
          </p>
          <p className="text-xs text-gray-500">Plaćene / iskorištenja</p>
        </Card>

        <Card className="p-4 space-y-2">
          <p className="text-sm text-gray-500">Ukupno generirani prihod</p>
          <p className="text-2xl font-semibold">
            ${promoStats?.totalRevenueGenerated?.toFixed?.(2) ?? '0.00'}
          </p>
        </Card>

        {/* Commission Model Display */}
        <Card className="p-4 space-y-2">
          <p className="text-sm text-gray-500">Tvoj model</p>
          <div className="flex items-center gap-2">
            {data?.ambassador.commissionModel === 'turbo' ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <span className="text-xl">🚀</span>
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">TURBO</span>
              </div>
            ) : data?.ambassador.commissionModel === 'partner' ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <span className="text-xl">💎</span>
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">PARTNER</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">—</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {data?.ambassador.commissionModel === 'turbo'
              ? '55% + 15% (prvi 2 mjeseca)'
              : data?.ambassador.commissionModel === 'partner'
                ? '10% lifetime (sve transakcije)'
                : 'Model nije odabran'}
          </p>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        {data?.activity ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Mjesečni uvjet: najmanje {data.activity.minPostsPerMonth} objave. Trenutno verificirano: {data.activity.verified}.
          </div>
        ) : null}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="text-lg font-semibold">Trenutni balans</p>
            <p className="text-2xl font-bold">
              €{currentBalance.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500">
              Minimalni prag za isplatu: €{payoutThreshold.toFixed(2)}
            </p>
          </div>
          <div className="text-sm text-gray-600">
            <p>Ukupno zarađeno: €{(data?.ambassador.earnings.totalEarned ?? 0).toFixed(2)}</p>
            <a
              href={data?.ambassador.marketingKitUrl || 'https://thesara.space/ambassador-kit'}
              className="text-blue-600 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Marketing kit
            </a>
          </div>
        </div>

        <form onSubmit={handlePayoutRequest} className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Iznos za isplatu (EUR)
            </label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder={currentBalance.toFixed(2)}
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PayPal e-mail
            </label>
            <Input
              type="email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button
              type="submit"
              disabled={!canRequestPayout || busy}
              className="w-full"
            >
              Zatraži isplatu
            </Button>
          </div>
        </form>
        {payoutMessage ? <p className="text-sm text-green-600">{payoutMessage}</p> : null}
        {currentBalance < payoutThreshold ? (
          <p className="text-xs text-gray-500">
            Balans mora biti barem €{payoutThreshold.toFixed(2)} da bi se omogućila isplata.
          </p>
        ) : null}
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Dostavi dokaz objave</h2>
        <form onSubmit={handleSubmitPost} className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Link na objavu</label>
            <Input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://www.tiktok.com/@.../video/..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Platforma (opcionalno)</label>
            <Input value={postPlatform} onChange={(e) => setPostPlatform(e.target.value)} placeholder="TikTok / Instagram / YouTube" />
          </div>
          <div className="md:col-span-3">
            <Button type="submit" disabled={!postUrl || postBusy}>{postBusy ? 'Slanje…' : 'Pošalji na provjeru'}</Button>
            {postMsg ? <span className="ml-3 text-sm text-gray-600">{postMsg}</span> : null}
          </div>
        </form>

        {data?.activity?.recentPosts?.length ? (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-1">Nedavne objave:</p>
            <ul className="space-y-1 text-sm">
              {data.activity.recentPosts.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline truncate max-w-[60ch]">{p.url}</a>
                  <span className="text-xs text-gray-500">({p.status})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Povijest isplata</h2>
        </div>
        {payouts.length === 0 ? (
          <p className="text-sm text-gray-500">Još nemaš zatraženih isplata.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Datum</th>
                  <th className="py-2 pr-4">Iznos</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Transakcija</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.payoutId} className="border-t border-gray-100">
                    <td className="py-2 pr-4">
                      {new Date(payout.requestedAt).toLocaleDateString('hr-HR')}
                    </td>
                    <td className="py-2 pr-4">€{payout.amount.toFixed(2)}</td>
                    <td className="py-2 pr-4 capitalize">{payout.status}</td>
                    <td className="py-2 pr-4">{payout.transactionId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
