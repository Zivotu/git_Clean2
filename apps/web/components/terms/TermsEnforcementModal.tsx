'use client';

import { useCallback, useEffect, useState } from 'react';
import { TERMS_POLICY } from '@thesara/policies/terms';
import { useI18n, useT } from '@/lib/i18n-provider';
import { getTermsDocUrl } from '@/lib/termsDocs';
import { useTermsLabel } from '@/hooks/useTermsLabel';

interface TermsEnforcementModalProps {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onOpenFull: () => void;
}

export default function TermsEnforcementModal({
  open,
  busy,
  error,
  onAccept,
  onDecline,
  onOpenFull,
}: TermsEnforcementModalProps) {
  const [agreed, setAgreed] = useState(false);
  const { locale } = useI18n();
  const tTerms = useT('Terms');
  const termsLabel = useTermsLabel();
  const tEnforce = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      tTerms(`enforcement.${key}`, params),
    [tTerms],
  );
  const labelPlaceholder = '__terms_label__';
  const checkboxTemplate = tEnforce('checkbox', { label: labelPlaceholder });
  const [checkboxBefore, checkboxAfter = ''] = checkboxTemplate.split(labelPlaceholder);
  const localizedDoc = getTermsDocUrl(locale);
  const embeddedSrc =
    localizedDoc || TERMS_POLICY.embedPath || TERMS_POLICY.fallbackUrl || TERMS_POLICY.url;

  useEffect(() => {
    if (open) {
      setAgreed(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-2xl space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
            {tEnforce('badge')}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">
            {tEnforce('title', { label: termsLabel })}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {tEnforce('intro', { version: TERMS_POLICY.version })}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50">
          <iframe
            title="Thesara Terms of Use"
            src={embeddedSrc}
            className="h-72 w-full rounded-2xl border-0"
          />
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {tEnforce('warning')}
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            {checkboxBefore}
            <button
              type="button"
              onClick={onOpenFull}
              className="text-emerald-700 underline underline-offset-2"
            >
              {termsLabel}
            </button>
            {checkboxAfter}
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onAccept}
            disabled={!agreed || busy}
            className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? tEnforce('saving') : tEnforce('primary')}
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            className="flex-1 rounded-2xl border border-gray-300 px-4 py-3 text-gray-700 hover:bg-gray-50"
          >
            {tEnforce('secondary')}
          </button>
        </div>
      </div>
    </div>
  );
}
