'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { locales } from '@/i18n/config';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useI18n } from '@/lib/i18n-provider';

export default function LegacyHandlePage() {
  return (
    <Suspense fallback={null}>
      <LegacyHandleClient />
    </Suspense>
  );
}

function LegacyHandleClient() {
  const router = useRouter();
  const { messages } = useI18n();
  const handle = useRouteParam('handle', (segments) => {
    if (segments.length === 1 && segments[0] !== 'legacy-handle') {
      return segments[0];
    }
    if (segments.length > 1 && segments[0] === 'legacy-handle') {
      return segments[1] ?? '';
    }
    return undefined;
  });

  useEffect(() => {
    if (!handle) return;
    const lower = handle.toLowerCase();
    if ((locales as readonly string[]).includes(lower)) {
      router.replace('/');
      return;
    }
    router.replace(`/u?handle=${encodeURIComponent(handle)}`);
  }, [handle, router]);

  return (
    <div className="p-4 text-gray-500">
      {messages['LegacyHandle.redirecting'] || 'Redirecting...'}
    </div>
  );
}
