import type { ReactNode } from 'react';
import './__name-shim';
import './globals.css';

import Script from 'next/script';

import Header from '@/components/Header';
import ChunkErrorBoundary from '@/components/ChunkErrorBoundary';
import { AuthProvider } from '@/lib/auth';
import I18nRootProvider from '@/components/I18nRootProvider';
import { AdsProvider } from '@/components/AdsProvider';
import AdScriptLoader from '@/components/AdScriptLoader';
import AdsConsentBanner from '@/components/AdsConsentBanner';
import { TermsProvider } from '@/components/terms/TermsProvider';
import { messages as ALL_MESSAGES, type Locale, defaultLocale } from '@/i18n/config';
import { getServerLocale } from '@/lib/locale';

export const metadata = {
  title: 'Thesara',
  description: 'Discover, play and publish mini-apps.',
};

// Firebase/Firestore se ne inicijalizira u parentu radi sigurnosnog modela.
// Ako je potrebno za dev debug, postavi NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE=1 i učitaj uvjetno:
if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE === '1') {
  import('@/lib/firebase').catch(() => {}) // Uvoz modula će pokrenuti njegovu inicijalizaciju
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
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-Q5LEE6M2QB"
          strategy="afterInteractive"
        />
        <Script id="google-gtag" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-Q5LEE6M2QB');`}
        </Script>
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "u61xrk1m1g");`}
        </Script>
      </head>
      <body className="min-h-screen bg-white text-gray-900">

        <ChunkErrorBoundary>
          <AuthProvider>
            <TermsProvider>
              <AdsProvider>
                <I18nRootProvider locale={locale} messages={messages}>
                  <AdScriptLoader />
                  <AdsConsentBanner />
                  <Header />
                  {children}
                </I18nRootProvider>
              </AdsProvider>
            </TermsProvider>
          </AuthProvider>
        </ChunkErrorBoundary>
      </body>
    </html>
  );
}
