"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { useI18n } from "@/lib/i18n-provider";

type BugGuardianContextValue = {
  open: () => void;
};

const BugGuardianContext = createContext<BugGuardianContextValue | null>(null);

export function useBugGuardian() {
  const ctx = useContext(BugGuardianContext);
  if (!ctx) throw new Error("useBugGuardian must be used within BugGuardianProvider");
  return ctx;
}

export function BugGuardianProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <BugGuardianContext.Provider value={value}>
      {children}
      {isOpen ? <BugGuardianModal onClose={close} /> : null}
    </BugGuardianContext.Provider>
  );
}

function BugGuardianModal({ onClose }: { onClose: () => void }) {
  const { messages } = useI18n();
  const t = useCallback(
    (key: string) => messages[`BugGuardian.${key}`] ?? key,
    [messages]
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-6 sm:px-6"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full flex items-center justify-center">
        <div
          className="relative overflow-hidden rounded-[32px] shadow-2xl border border-white/10"
          style={{ width: 'min(98vw, calc(98vh * 1.7778))', maxWidth: '1920px' }}
        >
          <div className="relative w-full bg-gray-900" style={{ aspectRatio: '16 / 9' }}>
            <Image
              src="/assets/Bugs_Opened.jpg"
              alt={t("title")}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 960px"
              priority
            />
            <div className="absolute inset-y-0 left-0 w-full bg-black/70 text-white px-6 py-8 sm:px-10 sm:py-10 md:w-[23%] md:bg-black/75 flex flex-col gap-5 justify-center">
              <p className="text-3xl font-semibold leading-snug">{t("title")}</p>
              <p className="text-lg leading-relaxed text-gray-100">{t("line1")}</p>
              <p className="text-lg leading-relaxed text-gray-100">{t("line2")}</p>
              <p className="text-lg leading-relaxed text-gray-100">{t("line3")}</p>
              <p className="text-xl font-medium tracking-wide text-emerald-200">{t("thanks")}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
