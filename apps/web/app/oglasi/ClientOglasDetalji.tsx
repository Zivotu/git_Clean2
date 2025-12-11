"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-provider';

interface Recenzija {
  id?: string;
  korisnik: string;
  ocjena: number;
  komentar: string;
  datum: string;
  canDelete?: boolean;
}

export default function OglasDetaljiClient({ id }: { id: string }) {
  const oglasId = id;
  const { user } = useAuth();
  const { messages } = useI18n();
  const t = useCallback(
    (key: string, params?: Record<string, string | number>, fallback?: string) => {
      let value = (messages[`Classifieds.details.${key}`] as string) || fallback || key;
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
  const [isOwner, setIsOwner] = useState(false);
  const [ocjena, setOcjena] = useState(5);
  const [komentar, setKomentar] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function load() {
    const token = user ? await user.getIdToken() : undefined;
    const res = await fetch(`${PUBLIC_API_URL}/recenzije/${oglasId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      setRecenzije(data.recenzije || []);
      setProsjek(data.prosjek || 0);
      setCanReview(Boolean(data.canReview));
      setIsOwner(Boolean(data.isOwner));
    }
  }

  useEffect(() => {
    if (oglasId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oglasId, user]);

  async function submitRecenzija(e: React.FormEvent) {
    e.preventDefault();
    if (!oglasId || !komentar.trim()) return;
    setIsSubmitting(true);
    try {
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
      await load();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteRecenzija(id: string) {
    if (!id) return;
    const token = user ? await user.getIdToken() : undefined;
    try {
      await fetch(`${PUBLIC_API_URL}/recenzije/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      await load();
    } catch (e) {
      // ignore
    }
  }

  const totalReviews = recenzije.length;
  const formattedAverage = prosjek ? prosjek.toFixed(1) : '—';
  const ratingDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    recenzije.forEach((r) => {
      const index = Math.min(5, Math.max(1, Math.round(r.ocjena)));
      counts[index - 1] += 1;
    });
    const percentages = counts.map((count) =>
      totalReviews ? Math.round((count / totalReviews) * 100) : 0
    );
    return { counts, percentages };
  }, [recenzije, totalReviews]);

  const ratingLabel = (value: number) =>
    t(`scoreLabel`, { rating: value }, `${value} / 5`);

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('hr-HR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const screenshots = [
    {
      id: 1,
      alt: 'UI pregled recenzija',
      src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=60',
    },
    {
      id: 2,
      alt: 'Stanje prije prve recenzije',
      src: 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=60',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white py-10 px-4">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1.3fr]">
          <section>
            <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-600">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {t('chip.miniApp', undefined, 'Mini aplikacija')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                🧩 {t('chip.details', undefined, 'Detalji oglasa')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                🌐 thesara.space
              </span>
            </div>

            <header className="grid gap-4 sm:grid-cols-[auto,1fr] sm:items-center">
              <figure className="flex h-24 w-24 items-center justify-center rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-100 via-white to-blue-200 text-4xl">
                <span>👁‍🗨</span>
              </figure>
              <div>
                <h1 className="text-3xl font-semibold leading-snug text-slate-900">
                  {t('title', { id: oglasId || '' }, 'Detalji mini aplikacije')}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {t(
                    'subtitle',
                    undefined,
                    'Moderan pregled recenzija i ocjena kako bi korisnici brže procijenili kvalitetu oglasa.'
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {t('meta.author', undefined, 'Autor')}: <strong>@thesara</strong>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {t('meta.updated', undefined, 'Zadnje ažuriranje')}:{" "}
                    <strong>{t('meta.updatedValue', undefined, '05/2025')}</strong>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    {t('meta.category', undefined, 'Kategorija')}:{" "}
                    <strong>{t('meta.categoryValue', undefined, 'Oglasi')}</strong>
                  </div>
                </div>
              </div>
            </header>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label={t('metric.average', undefined, 'Prosječna ocjena')}
                value={`${formattedAverage} / 5`}
                icon="★"
              />
              <MetricCard
                label={t('metric.reviews', undefined, 'Broj recenzija')}
                value={totalReviews || '—'}
                icon="👥"
              />
              <MetricCard
                label={t('metric.opens', undefined, 'Otvaranja')}
                value={t('metric.opensValue', undefined, '–')}
                icon="📂"
              />
              <MetricCard
                label={t('metric.likes', undefined, 'Sviđanja')}
                value={t('metric.likesValue', undefined, '–')}
                icon="❤️"
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold uppercase tracking-[0.1em] text-slate-50 shadow-lg shadow-slate-900/30"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-900">
                  ▶
                </span>
                {t('cta.play', undefined, 'Pokreni aplikaciju')}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600"
              >
                ℹ️ {t('cta.moreInfo', undefined, 'Više informacija')}
              </button>
              <p className="text-xs text-slate-400">
                {t('cta.note', undefined, 'Aplikacija se otvara u novoj kartici.')}
              </p>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              {t(
                'description',
                undefined,
                'Ovaj modul dodaje sustav ocjenjivanja i recenzija na detalje oglasa kako bi se istaknuo kredibilitet sadržaja i autora.'
              )}
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t('screenshots.title', undefined, 'Screenshotovi')}
              </p>
              <p className="text-xs text-slate-400">
                {t(
                  'screenshots.subtitle',
                  undefined,
                  'Kako modul izgleda unutar stranice (demo podaci).'
                )}
              </p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
              {screenshots.map((shot) => (
                <figure
                  key={shot.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <Image
                    src={shot.src}
                    alt={shot.alt}
                    width={900}
                    height={384}
                    className="h-48 w-full object-cover"
                    loading="lazy"
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    unoptimized
                  />
                </figure>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {t(
                'screenshots.note',
                undefined,
                'U produkciji ovdje dolaze stvarni screenshotovi (desktop + mobile).'
              )}
            </p>
          </section>
        </div>

        <div className="my-8 h-px bg-slate-200" />

        <section>
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-1 flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {formattedAverage} <span className="text-xs text-slate-400">/ 5</span>
                </p>
                <RatingStars value={prosjek} />
                <p className="text-xs text-slate-500">
                  {t('rating.summary', { count: totalReviews }, 'Na temelju recenzija korisnika.')}
                </p>
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5">
              {ratingDistribution.percentages
                .map((percentage, index) => {
                  const star = 5 - index;
                  const count = ratingDistribution.counts[star - 1];
                  return { star, percentage: ratingDistribution.percentages[star - 1], count };
                })
                .sort((a, b) => b.star - a.star)
                .map(({ star, percentage, count }) => (
                  <div key={star} className="mb-2 flex items-center gap-3 text-xs text-slate-500 last:mb-0">
                    <span className="w-8">{star}★</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="w-10 text-right">
                      {totalReviews ? `${percentage}%` : count}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center gap-3 text-sm font-semibold text-slate-900">
            {t('reviews.title', undefined, 'Recenzije korisnika')}
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              {totalReviews} {t('reviews.count', undefined, 'recenzija')}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-3">
              {recenzije.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                  {t(
                    'reviews.empty',
                    undefined,
                    'Još nema recenzija. Budi prvi koji će podijeliti iskustvo!'
                  )}
                </div>
              )}
              {recenzije.map((r, index) => (
                <article
                  key={`${r.korisnik}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <header className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{r.korisnik || t('reviews.anonymous', undefined, 'Guest')}</p>
                      <p className="text-xs text-slate-400">{formatDate(r.datum)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {ratingLabel(r.ocjena)}
                      </span>
                      {(isOwner || (user && user.uid === r.korisnik)) && r.id && (
                        <button
                          type="button"
                          onClick={() => deleteRecenzija(r.id!)}
                          className="text-xs text-rose-500 hover:underline"
                        >
                          {t('reviews.delete', undefined, 'Obriši')}
                        </button>
                      )}
                    </div>
                  </header>
                  <p className="mt-2 text-sm text-slate-600">{r.komentar}</p>
                </article>
              ))}
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <h2 className="text-base font-semibold text-slate-900">
                {t('form.title', undefined, 'Ostavi svoju recenziju')}
              </h2>
              <p className="text-xs text-slate-500">
                {t(
                  'form.subtitle',
                  undefined,
                  'Recenziju može ostaviti samo korisnik koji je isprobao mini aplikaciju.'
                )}
              </p>

              {canReview ? (
                <form onSubmit={submitRecenzija} className="mt-4 space-y-4">
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('form.ratingLabel', undefined, 'Tvoja ocjena')}
                    <select
                      value={ocjena}
                      onChange={(e) => setOcjena(Number(e.target.value))}
                      className="mt-2 w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-sm"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} – {ratingLabel(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('form.commentLabel', undefined, 'Komentar')}
                    <textarea
                      value={komentar}
                      onChange={(e) => setKomentar(e.target.value)}
                      placeholder={t('commentPlaceholder', undefined, 'Napiši kratko svoje iskustvo...')}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner shadow-slate-100"
                      minLength={10}
                      rows={4}
                    />
                  </label>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <p>{t('form.note', undefined, 'Minimalno 10 znakova. Izbjegavaj linkove.')}</p>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-lg shadow-blue-600/30 disabled:opacity-60"
                    >
                      ⬆ {isSubmitting ? t('form.sending', undefined, 'Slanje...') : t('submit', undefined, 'Pošalji')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-500">
                  {t(
                    'form.disabled',
                    undefined,
                    'Za ostavljanje recenzije prijavi se i isprobaj aplikaciju.'
                  )}
                </div>
              )}
            </aside>
          </div>
          <p className="mt-6 text-right text-xs text-slate-400">
            {t('report.label', undefined, 'Primijetiš li neprikladan sadržaj?')}{' '}
            <button type="button" className="font-semibold text-rose-500 underline">
              {t('report.action', undefined, 'Prijavi sadržaj')}
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
      <p className="text-xs uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span className="text-base">{icon}</span>
        {value}
      </div>
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="mt-1 flex gap-1 text-lg text-amber-400">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star}>{star <= rounded ? '★' : '☆'}</span>
      ))}
    </div>
  );
}

