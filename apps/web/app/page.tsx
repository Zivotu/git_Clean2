import { Suspense } from 'react';
import type { Listing as ApiListing } from '@/lib/types';
import { getListings } from '@/lib/loaders';
import { defaultLocale } from '@/i18n/config';
import BetaHomeClient from './beta-home/BetaHomeClient';

function HomeFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">
      Loading...
    </div>
  );
}

export default async function Page() {
  const locale = defaultLocale;
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
    <Suspense fallback={<HomeFallback />}>
      <BetaHomeClient initialItems={initialItems} />
    </Suspense>
  );
}


