'use client';

import { useEffect, useState } from 'react';
import { TERMS_POLICY } from '@thesara/policies/terms';

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

  useEffect(() => {
    if (open) {
      setAgreed(false);
    }
  }, [open]);

  if (!open) return null;
  const embeddedSrc = TERMS_POLICY.embedPath || TERMS_POLICY.fallbackUrl || TERMS_POLICY.url;

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-2xl space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
            Sigurnost korisnika
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">
            Prihvati {TERMS_POLICY.shortLabel}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Nastavkom korištenja platforme trebaš potvrditi da se slažeš s
            aktualnom verzijom uvjeta (v{TERMS_POLICY.version}).
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
          Odbijanjem uvjeta bit ćeš odjavljen i nećeš moći objavljivati aplikacije niti kupovati
          pakete sve dok ih ne prihvatiš.
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            Prihvaćam{' '}
            <button
              type="button"
              onClick={onOpenFull}
              className="text-emerald-700 underline underline-offset-2"
            >
              {TERMS_POLICY.shortLabel}
            </button>{' '}
            i potvrđujem da sam ih pročitao/la i razumio/la.
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onAccept}
            disabled={!agreed || busy}
            className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Spremanje…' : 'Prihvaćam uvjete'}
          </button>
          <button
            onClick={onDecline}
            disabled={busy}
            className="flex-1 rounded-2xl border border-gray-300 px-4 py-3 text-gray-700 hover:bg-gray-50"
          >
            Odjavi me
          </button>
        </div>
      </div>
    </div>
  );
}
