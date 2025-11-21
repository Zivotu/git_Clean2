import { Suspense } from 'react';
import type { Listing as ApiListing } from '@/lib/types';
import { getListings } from '@/lib/loaders';
import { defaultLocale } from '@/i18n/config';
import BetaHomeClient from './BetaHomeClient';

function BetaFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">
      Loading beta experience...
    </div>
  );
}

export default async function BetaHomePage() {
  const locale = defaultLocale;
  let initialItems: ApiListing[] = [];
  try {
    const { items } = await getListings({ locale });
    initialItems = items;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[beta-home] failed to load listings', error);
    }
  }

  return (
    <Suspense fallback={<BetaFallback />}>
      <BetaHomeClient initialItems={initialItems} />
    </Suspense>
  );
}
