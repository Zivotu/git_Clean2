"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { useTheme } from '@/components/ThemeProvider';
import { SITE_NAME } from "@/lib/config";
import { useI18n } from "@/lib/i18n-provider";
import faqEn from "@/messages/faq.en.manual.json";
import faqHr from "@/messages/faq.hr.manual.json";
import faqDe from "@/messages/faq.de.manual.json";

type QA = { q: string; a: string };
type Section = { id: string; title: string; items: QA[] };

export default function FaqPage() {
  const { locale, messages } = useI18n();
  const { isDark } = useTheme();
  const data: Section[] = (locale === 'en' ? (faqEn as any) : locale === 'de' ? (faqDe as any) : (faqHr as any)) as Section[];
  const [open, setOpen] = useState<Record<string, number | null>>({});
  const toggle = (sec: string, idx: number) => {
    setOpen((p) => ({ ...p, [sec]: p[sec] === idx ? null : idx }));
  };
  const repl = (s: string) => s.replaceAll('{site}', SITE_NAME);
  const t = useCallback(
    (key: string) => messages[`FAQ.${key}`] || key,
    [messages]
  );

  return (
    <div className="max-w-4xl mx-auto p-6 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-center justify-between mb-6">
        <Logo isDark={isDark} />
        <Link href="/" className="text-sm text-gray-600 hover:text-emerald-700 dark:text-zinc-400 dark:hover:text-emerald-500">
          {t('back')}
        </Link>
      </div>
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-gray-600 dark:text-zinc-400">{t('intro')}</p>

      <div className="mt-6 space-y-6">
        {data.map((s) => (
          <section
            key={s.id}
            id={s.id}
            className="bg-white/80 dark:bg-[#0b0b0b] border border-gray-200/60 dark:border-white/5 rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-200/60 dark:border-white/3">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">{repl(s.title)}</h2>
            </div>
            <ul className="divide-y divide-gray-200/60 dark:divide-white/5">
              {s.items.map((it, i) => {
                const isOpen = open[s.id] === i;
                return (
                  <li key={i}>
                    <button
                      onClick={() => toggle(s.id, i)}
                      className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-gray-50 dark:hover:bg-purple-800/20"
                    >
                      <span className="font-medium text-gray-900 dark:text-zinc-100">{repl(it.q)}</span>
                      <svg className={`w-5 h-5 text-gray-500 dark:text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 text-gray-700 dark:text-zinc-300">
                        {repl(it.a)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
