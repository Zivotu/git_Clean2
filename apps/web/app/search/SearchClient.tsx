"use client";
import { useEffect, useState, useCallback } from "react";
import { PUBLIC_API_URL } from '@/lib/config';
import { handleFetchError } from '@/lib/handleFetchError';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import { useI18n } from '@/lib/i18n-provider';

type Oglas = {
  id: number;
  title: string;
  lokacija: string;
  cijena: number;
  kategorija: string;
  slike: string[];
  opis: string;
};

export default function SearchClient() {
  const params = useSafeSearchParams();
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`Search.${key}`] || key,
    [messages]
  );
  const [items, setItems] = useState<Oglas[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [lokacija, setLokacija] = useState(params.get('lokacija') || '');
  const [cijenaMin, setCijenaMin] = useState(params.get('cijenaMin') || '');
  const [cijenaMax, setCijenaMax] = useState(params.get('cijenaMax') || '');
  const [kategorija, setKategorija] = useState(params.get('kategorija') || '');

  useEffect(() => {
    const q = new URLSearchParams();
    if (lokacija) q.set('lokacija', lokacija);
    if (cijenaMin) q.set('cijenaMin', cijenaMin);
    if (cijenaMax) q.set('cijenaMax', cijenaMax);
    if (kategorija) q.set('kategorija', kategorija);
    q.set('page', String(page));
    fetch(`${PUBLIC_API_URL}/oglasi?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setError(null);
        setItems(d.items || []);
      })
      .catch((err) => {
        handleFetchError(err, t('errorShort'));
        setError(t('errorLong'));
        setItems([]);
      });
  }, [page, lokacija, cijenaMin, cijenaMax, kategorija, t]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-4">
        <input
          value={lokacija}
          onChange={(e) => setLokacija(e.target.value)}
          placeholder={t('filters.location')}
          className="border p-2 rounded"
        />
        <input
          value={cijenaMin}
          onChange={(e) => setCijenaMin(e.target.value)}
          placeholder={t('filters.minPrice')}
          type="number"
          className="border p-2 rounded w-24"
        />
        <input
          value={cijenaMax}
          onChange={(e) => setCijenaMax(e.target.value)}
          placeholder={t('filters.maxPrice')}
          type="number"
          className="border p-2 rounded w-24"
        />
        <input
          value={kategorija}
          onChange={(e) => setKategorija(e.target.value)}
          placeholder={t('filters.category')}
          className="border p-2 rounded"
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
          {t('actions.apply')}
        </button>
      </form>
      <ul className="space-y-2">
        {items.map((o) => (
          <li key={o.id} className="border p-2 rounded">
            <h2 className="font-semibold">{o.title}</h2>
            <p className="text-sm text-gray-600">
              {o.lokacija} - {o.cijena} - {o.kategorija}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          {t('actions.prev')}
        </button>
        <span className="px-3 py-1">{page}</span>
        <button onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded">
          {t('actions.next')}
        </button>
      </div>
    </div>
  );
}


