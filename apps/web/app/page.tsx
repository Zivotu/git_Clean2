import { Suspense } from 'react';
import type { Listing as ApiListing } from '@/lib/types';
import { getListings } from '@/lib/loaders';
import { defaultLocale, messages as ALL_MESSAGES } from '@/i18n/config';
import BetaHomeClient from './beta-home/BetaHomeClient';
import { getServerLocale } from '@/lib/locale';

function HomeFallback({ label }: { label?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">
      {label || 'Loading...'}
    </div>
  );
}

export default async function Page() {
  const locale = await getServerLocale(defaultLocale);
  const messages = ALL_MESSAGES[locale] || ALL_MESSAGES[defaultLocale];
  const loadingLabel = (messages['Home.loading'] as string) || 'Loading...';

  let initialItems: ApiListing[] = [];
  try {
    const { items } = await getListings({ locale });
    initialItems = items;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Home] Failed to prefetch listings', error);
    }
  }

  return (
    <Suspense fallback={<HomeFallback label={loadingLabel} />}>
      <BetaHomeClient initialItems={initialItems} />
    </Suspense>
  );
}


