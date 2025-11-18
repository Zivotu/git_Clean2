'use client';

import { TERMS_POLICY } from '@thesara/policies/terms';
import type { MouseEvent } from 'react';
import { useI18n, useT } from '@/lib/i18n-provider';
import { getTermsDocUrl } from '@/lib/termsDocs';
import { useTermsLabel } from '@/hooks/useTermsLabel';

interface TermsPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export default function TermsPreviewModal({ open, onClose, title }: TermsPreviewModalProps) {
  const { locale } = useI18n();
  const tTerms = useT('Terms');
  const termsLabel = useTermsLabel();
  const localizedDoc = getTermsDocUrl(locale);
  const fallbackDoc = TERMS_POLICY.embedPath || TERMS_POLICY.fallbackUrl || TERMS_POLICY.url;
  const iframeSrc = localizedDoc || fallbackDoc;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
              Thesara
            </p>
            <h2 className="text-lg font-semibold text-gray-900">
              {title || termsLabel}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            aria-label={tTerms('preview.close')}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="h-[65vh] overflow-hidden bg-gray-50">
          <iframe
            src={iframeSrc}
            title="Thesara Terms of Use"
            className="h-full w-full border-0"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-6 py-4 text-sm">
          <span className="text-gray-500">
            {tTerms('preview.lastUpdated', { version: TERMS_POLICY.version })}
          </span>
          <div className="flex gap-2">
            <a
              href={TERMS_POLICY.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              {tTerms('preview.openFull')}
            </a>
            <button
              onClick={onClose}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"
            >
              {tTerms('preview.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
