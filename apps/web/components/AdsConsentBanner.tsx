'use client';

import { useAds } from './AdsProvider';
import { useI18n } from '@/lib/i18n-provider';

export default function AdsConsentBanner() {
  const {
    shouldShowConsentBanner,
    grantConsent,
    rejectConsent,
    consentStatus,
    loading,
  } = useAds();
  const { messages } = useI18n();
  const t = (key: string) => messages[`AdsConsent.${key}`] || key;

  if (loading || !shouldShowConsentBanner || consentStatus !== 'unknown') {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-200 bg-white/95 shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 text-sm text-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-gray-900">{t('title')}</p>
          <p className="text-gray-600">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => rejectConsent('banner')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            {t('reject')}
          </button>
          <button
            type="button"
            onClick={() => grantConsent('banner')}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
