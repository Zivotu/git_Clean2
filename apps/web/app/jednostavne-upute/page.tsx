"use client";

import Link from 'next/link';

import { useT } from '@/lib/i18n-provider';

const STEP_KEYS = ['1', '2', '3', '4', '5'];

export default function JednostavneUputePage() {
  const t = useT('Creators.SimpleGuide');

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/40 to-white text-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-20">
        <div className="rounded-3xl border border-emerald-100 bg-white/95 shadow-xl shadow-emerald-900/5 p-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-center text-emerald-600 mb-8">
            {t('title')}
          </h1>
          <ol className="space-y-4 text-lg leading-relaxed list-decimal list-inside text-gray-800">
            {STEP_KEYS.map((key) => (
              <li key={key}>{t(`steps.${key}`)}</li>
            ))}
          </ol>
          <div className="mt-12 text-center">
            <Link
              href="/create"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-10 py-4 text-2xl font-bold text-white shadow-lg shadow-emerald-600/40 transition hover:bg-emerald-700"
            >
              {t('cta')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
