"use client";

import { useEffect, useState, useCallback } from "react";
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-provider';

interface Recenzija {
  korisnik: string;
  ocjena: number;
  komentar: string;
  datum: string;
}

export default function OglasDetaljiClient({ id }: { id: string }) {
  const oglasId = id;
  const { user } = useAuth();
  const { messages } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = messages[`Classifieds.details.${key}`] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replaceAll(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [messages]
  );
  const [recenzije, setRecenzije] = useState<Recenzija[]>([]);
  const [prosjek, setProsjek] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const [ocjena, setOcjena] = useState(5);
  const [komentar, setKomentar] = useState('');

  async function load() {
    const token = user ? await user.getIdToken() : undefined;
    const res = await fetch(`${PUBLIC_API_URL}/recenzije/${oglasId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      setRecenzije(data.recenzije || []);
      setProsjek(data.prosjek || 0);
      setCanReview(!!data.canReview);
    }
  }

  useEffect(() => {
    if (oglasId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oglasId, user]);

  async function submitRecenzija(e: React.FormEvent) {
    e.preventDefault();
    const token = user ? await user.getIdToken() : undefined;
    await fetch(`${PUBLIC_API_URL}/recenzije`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ oglas: Number(oglasId), ocjena, komentar }),
    });
    setKomentar('');
    setOcjena(5);
    load();
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">{t('title', { id: oglasId || '' })}</h1>
      <p className="mb-4">{t('average', { rating: prosjek.toFixed(1) })}</p>
      <ul className="space-y-2 mb-4">
        {recenzije.map((r, i) => (
          <li key={i} className="border p-2 rounded">
            <div className="font-semibold">{t('scoreLabel', { rating: r.ocjena })}</div>
            <div className="text-sm">{r.komentar}</div>
          </li>
        ))}
      </ul>
      {canReview && (
        <form onSubmit={submitRecenzija} className="space-y-2">
          <select
            value={ocjena}
            onChange={(e) => setOcjena(Number(e.target.value))}
            className="border p-2 rounded"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <textarea
            value={komentar}
            onChange={(e) => setKomentar(e.target.value)}
            placeholder={t('commentPlaceholder')}
            className="w-full border p-2 rounded"
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            {t('submit')}
          </button>
        </form>
      )}
    </div>
  );
}


