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

// ✅ Next 15.5 očekuje Promise u params
export default async function Page({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;

  const app = await getApp(appId);
  if (!app) {
    return <div className="p-6 text-red-600">App not found.</div>;
  }
  return <PlayPageClient app={app} />;
}
