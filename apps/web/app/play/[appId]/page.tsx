import { Metadata } from 'next';
import PlayPageClient from './PlayPageClient';
import { getApiBase } from '@/lib/apiBase';
import type { AppRecord } from '@/lib/types';

async function getApp(appId: string): Promise<AppRecord | null> {
  try {
    const apiBase = getApiBase() || '/api';
    const res = await fetch(`${apiBase}/app-meta/${appId}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ appId: string }> }): Promise<Metadata> {
  const { appId } = await params;
  const app = await getApp(appId);

  if (!app) {
    return {
      title: 'App Not Found - Thesara',
    };
  }

  const title = app.title || app.name || 'Untitled App';
  const description = app.description || `Play ${title} on Thesara.`;
  const images = app.previewUrl ? [app.previewUrl] : [];

  return {
    title: `${title} - Thesara`,
    description: description,
    openGraph: {
      title: `${title} - Thesara`,
      description: description,
      images: images,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} - Thesara`,
      description: description,
      images: images,
    },
    manifest: `/play/${appId}/manifest.webmanifest`,
  };
}

export default async function Page({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;

  const app = await getApp(appId);
  if (!app) {
    return <div className="p-6 text-red-600">App not found.</div>;
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: app.title || app.name,
    description: app.description,
    applicationCategory: 'WebApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: app.price || '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Person',
      name: app.author?.name || 'Unknown',
    },
    image: app.previewUrl,
    screenshot: app.screenshotUrls,
    datePublished: app.publishedAt ? new Date(app.publishedAt).toISOString() : undefined,
    dateModified: app.updatedAt ? new Date(app.updatedAt).toISOString() : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PlayPageClient app={app} />
    </>
  );
}
