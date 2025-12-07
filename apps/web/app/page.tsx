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

import { resolvePreviewUrl } from '@/lib/preview';

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

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Thesara',
    url: 'https://www.thesara.space',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://www.thesara.space/search?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  };

  const appListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: initialItems.slice(0, 12).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'SoftwareApplication',
        name: item.title,
        description: item.description || 'Mini application on Thesara',
        applicationCategory: item.tags?.[0] || 'GameApplication',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: typeof item.price === 'number' ? item.price : 0,
          priceCurrency: 'EUR'
        },
        author: {
          '@type': 'Person',
          name: item.author?.name || item.author?.handle || 'Unknown'
        },
        image: item.previewUrl ? resolvePreviewUrl(item.previewUrl) : undefined
      }
    }))
  };

  return (
    <Suspense fallback={<HomeFallback label={loadingLabel} />}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appListSchema) }}
      />
      <BetaHomeClient initialItems={initialItems} />
    </Suspense>
  );
}


