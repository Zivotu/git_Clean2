"use client";

import { useCallback } from "react";
import { useI18n } from "@/lib/i18n-provider";

export default function AboutPage() {
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`About.${key}`] || key,
    [messages]
  );

  return (
    <div className="min-h-screen max-w-2xl mx-auto p-6 space-y-6 bg-gray-50 dark:bg-[#0b0b0b] text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">{t("subtitle")}</p>
      </header>
      <section className="rounded-3xl border border-zinc-300 dark:border-white/5 bg-white/5 dark:bg-[#0b0b0b] p-6 shadow-sm space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{t("garageTitle")}</h2>
        <p className="text-zinc-700 dark:text-zinc-300">{t("garageBody")}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("comingSoon")}</p>
      </section>
    </div>
  );
}

