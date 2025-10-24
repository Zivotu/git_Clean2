import type { ReactNode } from 'react';
import './__name-shim';
import './globals.css';

import Header from '@/components/Header';
import ChunkErrorBoundary from '@/components/ChunkErrorBoundary';
import { AuthProvider } from '@/lib/auth';
import I18nRootProvider from '@/components/I18nRootProvider';
import { messages as ALL_MESSAGES, type Locale, defaultLocale } from '@/i18n/config';
import { getServerLocale } from '@/lib/locale';

export const metadata = {
  title: 'CreateX',
  description: 'Discover, play and publish mini-apps.',
};

// Firebase/Firestore se ne inicijalizira u parentu radi sigurnosnog modela.
// Ako je potrebno za dev debug, postavi NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE=1 i učitaj uvjetno:
if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE === '1') {
  // import('@/lib/firebase').then(m => m.initFirebase()).catch(() => {})
}

if (typeof window !== 'undefined') {
  void import('@/lib/apiBase').then(({ API_URL }) => {
    // eslint-disable-next-line no-console
    console.info(`[theSara/web] API base: ${API_URL}`);
  });
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale: Locale = await getServerLocale(defaultLocale);
  const messages = ALL_MESSAGES[locale] || ALL_MESSAGES[defaultLocale];

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-white text-gray-900">

        <ChunkErrorBoundary>
          <AuthProvider>
            <I18nRootProvider locale={locale} messages={messages}>
              <Header />
              {children}
            </I18nRootProvider>
          </AuthProvider>
        </ChunkErrorBoundary>
      </body>
    </html>
  );
}
