"use client";

import { useCallback } from "react";
import { useI18n } from "@/lib/i18n-provider";

export default function PolitikaPrivatnostiPage() {
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`Legal.Privacy.${key}`] || key,
    [messages]
  );

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p>{t('body')}</p>
    </main>
  );
}
