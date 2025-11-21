"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useI18n, useT } from "@/lib/i18n-provider";
import { fetchDonations, type DonationEntry } from "@/lib/donations";
import { GOLDEN_BOOK, isGoldenBookCampaignActive } from "@/lib/config";
import { useSearchParams } from "next/navigation";
import GoldenBookHero from "../../../../assets/GoldenBook_2.jpg";
import DonationQr from "../../../../assets/Thesara_Donation_QR.png";

const MAX_LIST = 500;

const normalizeMillis = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (candidate.toMillis) {
      const ms = candidate.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof candidate.seconds === "number") {
      const nanos = typeof candidate.nanoseconds === "number" ? candidate.nanoseconds : 0;
      return candidate.seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return null;
};

const toDate = (value: unknown): Date | null => {
  const ms = normalizeMillis(value);
  return ms ? new Date(ms) : null;
};

export default function GoldenBookPage() {
  const { locale, messages } = useI18n();
  const t = useT("GoldenBookPage");
  const searchParams = useSearchParams();
  const highlightFromQuery = searchParams?.get("highlight") ?? "";
  const [donations, setDonations] = useState<DonationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState(highlightFromQuery);
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const { isDark } = useTheme();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDonations(MAX_LIST)
      .then((items) => {
        if (!cancelled) setDonations(items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Failed to load donations");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      });
    } catch {
      return new Intl.DateTimeFormat("en", { dateStyle: "medium" });
    }
  }, [locale]);

  const startLabel = (() => {
    const date = toDate(GOLDEN_BOOK.campaignStartMs);
    return date ? formatDate.format(date) : null;
  })();
  const endLabel = (() => {
    const date = toDate(GOLDEN_BOOK.campaignEndMs);
    return date ? formatDate.format(date) : null;
  })();

  const campaignActive = isGoldenBookCampaignActive();
  const donateLink = GOLDEN_BOOK.paymentLink;
  const donateEnabled = GOLDEN_BOOK.enabled && Boolean(donateLink);
  const donateActive = donateEnabled && campaignActive;
  const qrTitle = messages["GoldenBookPage.qrTitle"] ?? "Scan to donate instantly";
  const qrHint =
    messages["GoldenBookPage.qrHint"] ??
    "Open your camera or banking app and point it at the code to open the donation link.";

  useEffect(() => {
    setPendingHighlight(highlightFromQuery);
    setActiveHighlight(null);
  }, [highlightFromQuery]);

  useEffect(() => {
    if (!pendingHighlight || !donations.length) return;
    const match = donations.find((entry) => entry.id === pendingHighlight);
    if (!match) return;
    const node = itemRefs.current.get(match.id);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setActiveHighlight(match.id);
    const timeout = window.setTimeout(() => {
      setActiveHighlight(null);
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [pendingHighlight, donations]);



  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <section className={`rounded-3xl border p-6 shadow-sm backdrop-blur space-y-6 ${isDark ? 'border-[#27272A] bg-[#18181B]/80' : 'border-gray-200 bg-white/80'}`}>
          <div className="relative mx-auto max-w-xs sm:max-w-sm">
            <div
              className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-br from-amber-100/70 via-white to-emerald-50/60 blur-3xl opacity-70"
              aria-hidden="true"
            />
            <div className={`relative overflow-hidden rounded-[32px] border shadow-xl ${isDark ? 'border-amber-200/20 bg-[#09090B]' : 'border-amber-100 bg-white'}`}>
              <Image
                src={GoldenBookHero}
                alt="Golden Book illustration"
                priority
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
          {donateEnabled && donateLink && (
            <div className={`rounded-3xl border p-4 text-center shadow-sm max-w-[240px] mx-auto ${isDark ? 'border-emerald-900/50 bg-[#09090B]/90' : 'border-emerald-50 bg-white/90'}`}>
              <p className={`text-sm font-semibold ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{qrTitle}</p>
              <div className={`mt-3 rounded-2xl border border-dashed p-2 ${isDark ? 'border-emerald-700/50 bg-[#18181B]' : 'border-emerald-200 bg-white'}`}>
                <Image
                  src={DonationQr}
                  alt={qrTitle}
                  className="h-auto w-full object-contain"
                  priority={false}
                />
              </div>
              <p className={`mt-2 text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{qrHint}</p>
            </div>
          )}
        </section>

        <section className={`rounded-3xl border p-8 shadow-sm backdrop-blur ${isDark ? 'border-[#27272A] bg-[#18181B]/80' : 'border-gray-200 bg-white/80'}`}>
          <p className="text-sm uppercase tracking-widest text-emerald-600 font-semibold">
            {t("title")}
          </p>
          <h1 className={`mt-4 text-4xl font-black ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{t("heroTitle")}</h1>
          <h2 className={`mt-2 text-3xl font-bold ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>{t("subtitle")}</h2>

          <p className={`mt-4 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
            {startLabel && endLabel
              ? t("activeWindow").replace("{start}", startLabel).replace("{end}", endLabel)
              : campaignActive
                ? t("alwaysOpen")
                : t("closedWindow")}
          </p>
          <p className={`mt-2 ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{t("permanentNote")}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {donateActive ? (
              <a
                href={donateLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full bg-emerald-600 px-6 py-3 text-white font-semibold shadow hover:bg-emerald-700 transition"
              >
                {t("cta")}
              </a>
            ) : (
              <span className={`inline-flex items-center rounded-full px-6 py-3 font-semibold ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-600'}`}>
                {t("ctaClosed")}
              </span>
            )}
          </div>
        </section>

        <section className={`rounded-3xl border p-6 shadow-sm backdrop-blur ${isDark ? 'border-[#27272A] bg-[#18181B]/80' : 'border-gray-200 bg-white/80'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className={`text-2xl font-semibold ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{t("listTitle")}</h2>
            {loading && (
              <span className={`text-sm animate-pulse ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>Loading...</span>
            )}
            {activeHighlight && (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                {t("highlightToast")}
              </span>
            )}
          </div>
          {error && (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-rose-900/50 bg-rose-900/20 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {error}
            </div>
          )}
          {!error && !loading && donations.length === 0 && (
            <div className={`mt-6 rounded-2xl border border-dashed px-6 py-8 text-center ${isDark ? 'border-zinc-700 text-zinc-500' : 'border-gray-300 text-gray-500'}`}>
              {t("empty")}
            </div>
          )}
          <ul ref={listRef} className="mt-6 grid gap-4">
            {donations.map((entry) => {
              const createdAtDate = toDate(entry.createdAt);
              return (
                <li
                  key={entry.id}
                  ref={(node) => {
                    if (!node) {
                      itemRefs.current.delete(entry.id);
                    } else {
                      itemRefs.current.set(entry.id, node);
                    }
                  }}
                  className={`rounded-2xl border p-5 shadow-sm transition ${activeHighlight === entry.id
                    ? "border-emerald-300 shadow-emerald-100 golden-highlight"
                    : isDark
                      ? "border-[#27272A] bg-[#09090B]"
                      : "border-gray-100 bg-white"
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className={`text-lg ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{entry.alias}</strong>
                    {entry.aliasStatus === "pending" && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        {t("pendingBadge")}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                    {createdAtDate ? formatDate.format(createdAtDate) : "..."}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
