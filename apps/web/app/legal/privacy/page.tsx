"use client";

import { useCallback } from "react";
import { useI18n } from "@/lib/i18n-provider";

export default function PrivacyPage() {
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`Legal.Privacy.${key}`] || key,
    [messages]
  );

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold mb-4">{t('title')}</h1>
      <p>{t('body')}</p>
    </main>
  );
}
