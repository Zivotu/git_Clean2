"use client";

import { useCallback } from "react";
import { useI18n } from "@/lib/i18n-provider";

export default function PolitikaPrivatnostiPage() {
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`Legal.Privacy.${key}`] || key,
    [messages]
  );
  const sections = [
    { key: 'intro' },
    { key: 'data' },
    { key: 'adsense' },
    { key: 'choices' },
    { key: 'contact' },
  ];

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <div className="space-y-8 text-sm leading-relaxed text-gray-700">
        {sections.map((section) => (
          <section key={section.key}>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t(`${section.key}.title`)}
            </h2>
            <p>{t(`${section.key}.body`)}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
