'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { redeemPromoCode } from '@/lib/ambassador';

export default function RedeemPage() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await redeemPromoCode(code.trim());
      setMsg(res?.message || 'Kod je uspješno iskorišten. Gold trial je aktiviran.');
      if ((res as any)?.expiresAt) setExpiresAt((res as any).expiresAt as number);
    } catch (e: any) {
      setErr(e?.message || 'Neuspjelo iskorištavanje koda.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Iskoristi promo kod</h1>
      {!user ? (
        <p className="text-sm text-gray-600">Moraš biti prijavljen kako bi iskoristio promo kod.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Promo kod</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="npr. THESARA-JANE24"
              className="w-full rounded border px-3 py-2"
              maxLength={32}
            />
          </div>
          <button
            type="submit"
            disabled={!code || busy}
            className="inline-flex items-center rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-50"
          >
            {busy ? 'Obrada…' : 'Iskoristi kod'}
          </button>
          {msg ? (
            <p className="text-sm text-emerald-700">
              {msg}
              {expiresAt ? (
                <>
                  {' '}Vrijedi do {new Date(expiresAt).toLocaleDateString('hr-HR')}
                </>
              ) : null}
            </p>
          ) : null}
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </form>
      )}
      <p className="mt-6 text-xs text-gray-500">Aktivacijom koda dobivaš besplatni Gold trial na ograničeno vrijeme, sukladno pravilima programa.</p>
    </div>
  );
}
