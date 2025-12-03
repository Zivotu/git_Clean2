"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { redeemPromoCode } from "@/lib/ambassador";
import { useI18n } from "@/lib/i18n-provider";

export default function RedeemPage() {
  const { user, loading } = useAuth();
  const { locale, messages } = useI18n();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = messages[`Promo.${key}`] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replaceAll(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [messages]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await redeemPromoCode(code.trim());
      setMsg(res?.message || t("success"));
      if ((res as any)?.expiresAt) setExpiresAt((res as any).expiresAt as number);
    } catch (error: any) {
      setErr(error?.message || t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const dateLocale = locale === "de" ? "de-DE" : locale === "en" ? "en-US" : "hr-HR";

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">{t("title")}</h1>
      {!user ? (
        <p className="text-sm text-gray-600">{t("mustBeSignedIn")}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("label")}</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("placeholder")}
              className="w-full rounded border px-3 py-2"
              maxLength={32}
            />
          </div>
          <button
            type="submit"
            disabled={!code || busy}
            className="inline-flex items-center rounded bg-emerald-600 text-white px-4 py-2 disabled:opacity-50"
          >
            {busy ? t("submitting") : t("submit")}
          </button>
          {msg ? (
            <p className="text-sm text-emerald-700">
              {msg}
              {expiresAt ? (
                <>
                  {" "}
                  {t("validUntil", {
                    date: new Date(expiresAt).toLocaleDateString(dateLocale),
                  })}
                </>
              ) : null}
            </p>
          ) : null}
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </form>
      )}
      <p className="mt-6 text-xs text-gray-500">{t("footnote")}</p>
    </div>
  );
}
