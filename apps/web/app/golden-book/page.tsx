"use client";

import React from "react";
import Image from "next/image";
import { useTheme } from "@/components/ThemeProvider";
import { useT, useI18n } from "@/lib/i18n-provider";
import DonateQr from "../../../../assets/Donate_qr_raw.jpg";
import { fetchDonations, type DonationEntry } from "@/lib/donations";
import { GOLDEN_BOOK } from "@/lib/config";

const donors = [
  {
    name: "Anonimni donator",
    date: "13. stu 2025.",
    amount: "50 €",
  },
  {
    name: "Ivana K.",
    date: "14. stu 2025.",
    amount: "25 €",
  },
  {
    name: "Marko P.",
    date: "15. stu 2025.",
    amount: "100 €",
  },
];

export default function GoldenBookPage() {
  const t = useT("GoldenBook");
  const { locale } = useI18n();
  const { isDark } = useTheme();
  const [fetchedDonors, setFetchedDonors] = React.useState<DonationEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDonations(200)
      .then((items) => {
        if (!cancelled) setFetchedDonors(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error)?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${isDark
        ? "bg-[#050010] text-purple-50"
        : "bg-white text-green-900"
        }`}
    >
      {/* header removed: global header is used instead; theme switch handled globally */}

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_minmax(260px,1.3fr)] md:py-12">
        {/* Left: Golden book card (slightly larger) */}
        <section
          className={`relative flex flex-col gap-5 rounded-3xl border p-5 md:p-6 ${isDark
            ? "border-slate-800/80 bg-slate-950/60"
            : "border-green-100 bg-green-50"
            }`}
        >
          <div
            className={`pointer-events-none absolute inset-x-2 -top-10 h-40 rounded-full blur-3xl ${isDark ? "bg-purple-500/20" : "bg-green-300/40"
              }`}
          />
          <div className="relative flex flex-col gap-4">
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${isDark ? "text-purple-300" : "text-green-600"
                }`}
            >
              {t('addYourName')}
            </p>
            <h1
              className={`text-2xl font-semibold leading-tight ${isDark ? "text-slate-50" : "text-green-900"
                }`}
            >
              {t('titlePrefix')}
              <span
                className={`block bg-clip-text text-transparent ${isDark
                  ? "bg-gradient-to-r from-purple-200 via-purple-400 to-pink-100"
                  : "bg-gradient-to-r from-green-500 via-emerald-500 to-lime-500"
                  }`}
              >
                {t('titleSuffix')}
              </span>
            </h1>

            <p
              className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-green-800"
                }`}
            >
              {t('descriptionPart1')}
              <span
                className={`font-semibold ${isDark ? "text-slate-200" : "text-green-700"
                  }`}
              >
                {" "}
                {t('descriptionHighlight')}
              </span>{" "}
              {t('descriptionPart2')}
            </p>
          </div>

          {/* Golden book preview (moderately larger) */}
          <div className="relative mt-1 flex flex-1 items-center justify-center">
            <div
              className={`absolute inset-y-4 left-4 right-4 rounded-[40px] blur-2xl ${isDark
                ? "bg-gradient-to-br from-purple-400/40 via-purple-300/20 to-pink-500/30"
                : "bg-gradient-to-br from-green-400/40 via-emerald-300/20 to-lime-400/40"
                }`}
            />
            <div
              className={`relative h-44 w-40 rotate-[-6deg] rounded-[32px] border  ${isDark
                ? "border-purple-300/70 bg-gradient-to-br from-purple-200 via-purple-300 to-purple-500"
                : "border-green-400/70 bg-gradient-to-br from-green-200 via-emerald-200 to-green-400"
                }`}
            />
            <p
              className={`pointer-events-none absolute mt-36 text-[10px] uppercase tracking-[0.35em] ${isDark ? "text-purple-100/70" : "text-green-600"
                }`}
            >
              {t('yourNameLivesHere')}
            </p>
          </div>

          <div
            className={`mt-1 flex flex-col gap-3 rounded-2xl p-3 text-xs ${isDark
              ? "bg-slate-900/70 text-slate-300"
              : "bg-white text-green-800"
              }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={`text-[11px] uppercase tracking-[0.28em] ${isDark ? "text-slate-500" : "text-green-500"
                  }`}
              >
                {t('campaignWindow')}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-[11px] ${isDark ? "bg-slate-900 text-slate-300" : "bg-green-50 text-green-800"
                  }`}
              >
                {t('campaignDates')}
              </span>
            </div>
            <p
              className={`text-[11px] leading-relaxed ${isDark ? "text-slate-400" : "text-green-700"
                }`}
            >
              {t('campaignNote')}
            </p>
          </div>

          {GOLDEN_BOOK?.paymentLink ? (
            <a
              href={GOLDEN_BOOK.paymentLink}
              target="_blank"
              rel="noreferrer"
              className={`mt-1 inline-flex items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.23em]  transition ${isDark
                ? "bg-purple-400/90 text-slate-950 hover:bg-purple-300"
                : "bg-green-500 text-white hover:bg-green-600"
                }`}
            >
              {t('becomeEarlyDonor')}
            </a>
          ) : (
            <button
              disabled
              className={`mt-1 inline-flex items-center justify-center rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.23em]  transition ${isDark
                ? "bg-purple-800 text-slate-400"
                : "bg-gray-200 text-gray-500"
                }`}
            >
              {t('becomeEarlyDonor')}
            </button>
          )}
        </section>

        {/* Middle: Main copy & QR */}
        <section
          className={`flex flex-col gap-5 rounded-3xl border p-5  md:p-6 ${isDark
            ? "border-slate-800/80 bg-slate-950/70"
            : "border-green-100 bg-white"
            }`}
        >
          <div className="space-y-4">
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.32em] ${isDark ? "text-emerald-400" : "text-green-500"
                }`}
            >
              {t('supportersTitle')}
            </p>
            <h2
              className={`text-3xl font-semibold leading-tight tracking-tight md:text-4xl ${isDark ? "text-slate-50" : "text-green-900"
                }`}
            >
              {t('mainTitlePrefix')}
              <span
                className={`block ${isDark ? "text-slate-300" : "text-green-700"}`}>
                {t('mainTitleSuffix')}
              </span>
            </h2>

            <p
              className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-green-800"
                }`}
            >
              {t('mainDescription')}
            </p>
          </div>

          <div
            className={`grid gap-4 rounded-2xl border p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-5 ${isDark
              ? "border-slate-800 bg-slate-900/60"
              : "border-green-100 bg-green-50"
              }`}
          >
            <div className="flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <p
                  className={`text-xs font-medium uppercase tracking-[0.26em] ${isDark ? "text-slate-500" : "text-green-600"
                    }`}
                >
                  {t('howItWorks')}
                </p>
                <ul
                  className={`space-y-1.5 text-xs ${isDark ? "text-slate-300" : "text-green-800"
                    }`}
                >
                  <li>{t('step1')}</li>
                  <li>{t('step2')}</li>
                  <li>
                    {t('step3')}
                  </li>
                </ul>
              </div>

              <div
                className={`flex flex-wrap items-center gap-3 text-[11px] ${isDark ? "text-slate-400" : "text-green-700"
                  }`}
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${isDark ? "bg-slate-900" : "bg-white"
                    }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-emerald-400" : "bg-green-500"
                      }`}
                  />
                  {t('transparentRecords')}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${isDark ? "bg-slate-900" : "bg-white"
                    }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-purple-300" : "bg-green-400"
                      }`}
                  />
                  {t('publicNames')}
                </span>
              </div>
            </div>

            {/* QR area */}
            <div
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl p-3 ${isDark
                ? "bg-slate-950/80"
                : "bg-white border border-green-100"
                }`}
            >
              <div
                className={`flex h-32 w-32 items-center justify-center rounded-2xl border overflow-hidden ${isDark
                  ? "border-slate-700 bg-slate-900/80"
                  : "border-green-200 bg-green-50"
                  }`}
              >
                <Image src={DonateQr} alt="Donation QR" width={128} height={128} className="object-contain" />
              </div>
              <p
                className={`text-center text-[11px] leading-relaxed ${isDark ? "text-slate-400" : "text-green-700"
                  }`}
              >
                {t('qrDescription')}
              </p>
              {GOLDEN_BOOK?.paymentLink ? (
                <a
                  href={GOLDEN_BOOK.paymentLink}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] transition ${isDark
                    ? "bg-emerald-400/90 text-slate-950 hover:bg-emerald-300"
                    : "bg-green-500 text-white hover:bg-green-600"
                    }`}
                >
                  {t('payWithCard')}
                </a>
              ) : (
                <button
                  disabled
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] transition ${isDark
                    ? "bg-emerald-800 text-slate-400"
                    : "bg-gray-200 text-gray-500"
                    }`}
                >
                  {t('payWithCard')}
                </button>
              )}
            </div>
          </div>

          {/* Removed the three informational cards to simplify layout */}
        </section>

        {/* Right: Donors list */}
        <aside
          className={`flex flex-col gap-4 rounded-3xl border p-4 md:p-5 ${isDark
            ? "border-slate-800/80 bg-slate-950/70"
            : "border-green-100 bg-white"
            }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${isDark ? "text-slate-500" : "text-green-500"
                  }`}
              >
                {t('donorsTitle')}
              </p>
              <p
                className={`text-xs ${isDark ? "text-slate-400" : "text-green-700"
                  }`}
              >
                {t('earlySupporters')}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] ${isDark ? "bg-slate-900 text-slate-300" : "bg-green-50 text-green-800"
                }`}
            >
              {(fetchedDonors && fetchedDonors.length) || donors.length} {t('entriesCount')}
            </span>
          </div>

          <div className="space-y-2.5">
            {error && (
              <div className={`text-sm rounded-md p-2 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                {error}
              </div>
            )}
            {loading && (
              <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{t('loadingDonors')}</div>
            )}

            {fetchedDonors && fetchedDonors.length > 0 ? (
              fetchedDonors.map((entry) => {
                const name = entry.alias && entry.alias !== 'anonymous' ? entry.alias : t('anonymousDonor');
                const date = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-xs ${isDark ? 'border-slate-800 bg-slate-950/80' : 'border-green-100 bg-green-50'
                      }`}
                  >
                    <div className="flex flex-col">
                      <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-green-900'}>{name}</span>
                      <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-green-600'}`}>{date}</span>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] ${isDark ? 'bg-slate-900 text-emerald-300' : 'bg-green-100 text-green-700'}`}>—</span>
                  </div>
                );
              })
            ) : (
              donors.map((donor, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-xs ${isDark ? 'border-slate-800 bg-slate-950/80' : 'border-green-100 bg-green-50'
                    }`}
                >
                  <div className="flex flex-col">
                    <span className={isDark ? 'font-medium text-slate-100' : 'font-medium text-green-900'}>{donor.name === 'Anonimni donator' ? t('anonymousDonor') : donor.name}</span>
                    <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-green-600'}`}>{donor.date}</span>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${isDark ? 'bg-slate-900 text-emerald-300' : 'bg-green-100 text-green-700'}`}>{donor.amount}</span>
                </div>
              ))
            )}
          </div>

          {/* 'Pogledaj sve donatore' removed — list already shows all donors */}

          <p
            className={`pt-1 text-[10px] leading-relaxed ${isDark ? "text-slate-500" : "text-green-700"
              }`}
          >
            {t('transparencyNote')}
          </p>
        </aside>
      </main>
    </div>
  );
}
