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
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-gray-600 mt-2">{t("subtitle")}</p>
      </header>
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">{t("garageTitle")}</h2>
        <p className="text-gray-700">{t("garageBody")}</p>
        <p className="text-sm text-gray-500">{t("comingSoon")}</p>
      </section>
    </main>
  );
}

