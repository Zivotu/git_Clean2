"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n-provider";
import {
  fetchDonationByPaymentIntent,
  submitDonationAlias,
  type DonationEntry,
  resolvePaymentIntentFromSession,
} from "@/lib/donations";
import { triggerConfetti } from "@/components/Confetti";

type Status = "idle" | "resolving" | "loading" | "ready" | "missing" | "error";

export default function DonateThankYouPage() {
  const t = useT("DonateThankYou");
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPaymentIntentId =
    searchParams?.get("pi") ??
    searchParams?.get("payment_intent") ??
    searchParams?.get("paymentIntentId") ??
    "";
  const sessionParam =
    searchParams?.get("session_id") ??
    searchParams?.get("sessionId") ??
    searchParams?.get("cs") ??
    "";
  const [paymentIntentId, setPaymentIntentId] = useState(initialPaymentIntentId);

  const [alias, setAlias] = useState("");
  const [status, setStatus] = useState<Status>(
    paymentIntentId ? "loading" : sessionParam ? "resolving" : "missing",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [donation, setDonation] = useState<DonationEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [sessionResolveError, setSessionResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!paymentIntentId && sessionParam) {
      setSessionResolveError(null);
      setStatus("resolving");
      resolvePaymentIntentFromSession(sessionParam)
        .then((pi) => {
          if (cancelled) return;
          setPaymentIntentId(pi);
          setStatus("loading");
        })
        .catch(() => {
          if (cancelled) return;
          setSessionResolveError(t("sessionResolveFailed"));
          setStatus("missing");
        });
      return () => {
        cancelled = true;
      };
    }
    if (!paymentIntentId) {
      setStatus("missing");
      setDonation(null);
      return;
    }
  }, [paymentIntentId, sessionParam, t]);

  useEffect(() => {
    if (!paymentIntentId) {
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setSuccess(null);
    fetchDonationByPaymentIntent(paymentIntentId)
      .then((entry) => {
        if (cancelled) return;
        if (!entry) {
          setStatus("error");
          setError(t("notFound"));
          return;
        }
        setDonation(entry);
        setAlias(entry.aliasStatus === "pending" ? "" : entry.alias);
        setStatus("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus("error");
        setError(err.message || t("errorGeneric"));
      });
    return () => {
      cancelled = true;
    };
  }, [paymentIntentId, t]);

  useEffect(() => {
    if (status === "ready" && !celebrated) {
      triggerConfetti();
      setCelebrated(true);
    }
  }, [status, celebrated]);

  const aliasPreviouslySaved =
    donation && donation.aliasStatus !== "pending" && donation.alias.trim().length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentIntentId || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const payload = alias.trim();
    try {
      const response = await submitDonationAlias(paymentIntentId, payload);
      setSuccess(t("success"));
      setDonation((prev) =>
        prev
          ? {
              ...prev,
              alias: response.alias,
              aliasStatus: response.aliasStatus,
            }
          : null,
      );
      setRedirecting(true);
      setTimeout(() => {
        router.push(`/golden-book?highlight=${encodeURIComponent(paymentIntentId)}`);
      }, 1500);
    } catch (err: any) {
      setError(err?.message || t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const helperText = useMemo(() => {
    if (!paymentIntentId) {
      return sessionResolveError || t("missingPaymentIntent");
    }
    if (status === "error" && error) {
      return error;
    }
    if (aliasPreviouslySaved && !success) {
      return t("alreadySetHint");
    }
    if (success) {
      return success;
    }
    return null;
  }, [aliasPreviouslySaved, error, paymentIntentId, status, success, sessionResolveError, t]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 px-6 py-8 shadow-sm">
        <p className="text-sm uppercase tracking-widest text-emerald-600 font-semibold">
          {t("celebrationKicker")}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-3 text-gray-700">{t("celebrationBody")}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("stepOne")}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("stepTwo")}
          </span>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">{t("aliasTitle")}</h2>
          <p className="mt-1 text-gray-600">{t("intro")}</p>
        </div>

        {!paymentIntentId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t("missingPaymentIntent")}
          </div>
        )}

        {status === "resolving" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {t("sessionResolving")}
          </div>
        )}

        {paymentIntentId && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <label htmlFor="alias" className="block text-sm font-medium text-gray-700">
              {t("aliasLabel")}
            </label>
              <input
                id="alias"
                name="alias"
                type="text"
                maxLength={40}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                disabled={submitting || !paymentIntentId || status !== "ready"}
                placeholder={t("aliasPlaceholder")}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-gray-100"
              />
              <p className="mt-2 text-sm text-gray-500">{t("aliasOptional")}</p>

            {helperText && (
              <p
                className={`mt-3 text-sm ${
                  success || aliasPreviouslySaved ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {helperText}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting || !paymentIntentId || status !== "ready"}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-white font-medium shadow-sm transition hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500"
              >
                {submitting ? t("saving") : t("submit")}
              </button>
            </div>
            {redirecting && (
              <p className="mt-4 text-sm text-gray-500 flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                {t("redirecting")}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
