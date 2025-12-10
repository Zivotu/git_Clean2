import type { ReactNode } from 'react';
import './__name-shim';
import './globals.css';

import Script from 'next/script';

import Header from '@/components/Header';
import { API_URL } from '@/lib/apiBase';
import { ThemeProvider } from '@/components/ThemeProvider';
import { GOLDEN_BOOK, isGoldenBookCampaignActive, getGoldenBookCountdown } from '@/lib/config';
import ChunkErrorBoundary from '@/components/ChunkErrorBoundary';
import { AuthProvider } from '@/lib/auth';
import I18nRootProvider from '@/components/I18nRootProvider';
import { AdsProvider } from '@/components/AdsProvider';
import AdScriptLoader from '@/components/AdScriptLoader';
import AdsConsentBanner from '@/components/AdsConsentBanner';
import { TermsProvider } from '@/components/terms/TermsProvider';
import { messages as ALL_MESSAGES, type Locale, defaultLocale } from '@/i18n/config';
import { getServerLocale } from '@/lib/locale';
import { BugGuardianProvider } from '@/components/BugGuardian/BugGuardianProvider';
import GlobalShell from '@/components/GlobalShell';

export const metadata = {
  title: 'Thesara - Discover, Play and Publish Mini-Apps',
  description: 'Discover, play and publish mini-apps. Turn AI chats into interactive applications. Join our creative community today!',
  metadataBase: new URL('https://www.thesara.space'),
  openGraph: {
    title: 'Thesara - Discover, Play and Publish Mini-Apps',
    description: 'Discover, play and publish mini-apps. Turn AI chats into interactive applications. Join our creative community today!',
    url: 'https://www.thesara.space',
    siteName: 'Thesara',
    images: [
      {
        url: '/og-image.png', // You'll need to create this image
        width: 1200,
        height: 630,
        alt: 'Thesara - Mini-Apps Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Thesara - Discover, Play and Publish Mini-Apps',
    description: 'Discover, play and publish mini-apps. Turn AI chats into interactive applications.',
    images: ['/og-image.png'], // Same image as Open Graph
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

// Firebase/Firestore se ne inicijalizira u parentu radi sigurnosnog modela.
// Ako je potrebno za dev debug, postavi NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE=1 i učitaj uvjetno:
if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_PARENT_FIREBASE === '1') {
  import('@/lib/firebase').catch(() => { }) // Uvoz modula će pokrenuti njegovu inicijalizaciju
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

  // Compute donate countdown label (Golden Book) for the donation button
  const _goldenCountdown = getGoldenBookCountdown();
  const donateCountdownLabel =
    isGoldenBookCampaignActive() && _goldenCountdown && _goldenCountdown.daysRemaining > 0
      ? (messages['Nav.donateCountdown'] || '{days} days').replace('{days}', String(_goldenCountdown.daysRemaining))
      : null;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#7c3aed" />
        <link rel="canonical" href="https://www.thesara.space" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:site" content="@thesara" />
        <meta name="twitter:creator" content="@thesara" />
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var reloadAttempts = 0;
                var MAX_RELOAD_ATTEMPTS = 3;
                var RELOAD_COOLDOWN = 5000; // 5 seconds
                
                window.addEventListener('error', function(e) {
                  // For runtime errors (thrown exceptions)
                  if (e.message && (/ChunkLoadError/i.test(e.message) || /Loading chunk/i.test(e.message))) {
                     console.warn('[Thesara] Chunk load error detected in runtime, reloading...');
                     performSafeReload('runtime_chunk_error');
                     return;
                  }
                  
                  // For resource loading errors (script/css tags)
                  if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {
                     var src = e.target.src || e.target.href || '';
                     
                     // Check if this is a Next.js static resource
                     if (src.indexOf('_next/static') !== -1) {
                        console.warn('[Thesara] Next.js resource failed to load:', src);
                        performSafeReload('resource_' + src);
                        return;
                     }
                  }
                }, true); // capture phase to catch resource errors
                
                function performSafeReload(errorKey) {
                  try {
                    // Check if we've attempted reload recently for this error
                    var lastReloadKey = 'chunk_reload_' + errorKey;
                    var lastReloadTime = sessionStorage.getItem(lastReloadKey);
                    var now = Date.now();
                    
                    // Allow reload if:
                    // 1. Never reloaded for this error, OR
                    // 2. Last reload was more than RELOAD_COOLDOWN ago
                    if (!lastReloadTime || (now - parseInt(lastReloadTime)) > RELOAD_COOLDOWN) {
                       // Check global reload attempts to prevent infinite loops
                       var globalReloads = parseInt(sessionStorage.getItem('global_reload_count') || '0');
                       
                       if (globalReloads >= MAX_RELOAD_ATTEMPTS) {
                          console.error('[Thesara] Max reload attempts reached. Please manually refresh (Ctrl+Shift+R)');
                          return;
                       }
                       
                       // Update counters
                       sessionStorage.setItem(lastReloadKey, now.toString());
                       sessionStorage.setItem('global_reload_count', (globalReloads + 1).toString());
                       
                       console.log('[Thesara] Reloading page to recover from error...');
                       
                       // Use location.replace to avoid adding to history
                       window.location.replace(window.location.href);
                    } else {
                       console.warn('[Thesara] Reload cooldown active for', errorKey);
                    }
                  } catch (err) {
                     // If sessionStorage is blocked (private mode), just reload once
                     console.warn('[Thesara] Storage error, performing simple reload');
                     window.location.reload();
                  }
                }
                
                // Reset global reload counter after 30 seconds of successful operation
                setTimeout(function() {
                   try {
                      sessionStorage.removeItem('global_reload_count');
                   } catch(e) {}
                }, 30000);
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-white text-gray-900">
        <ThemeProvider>
          <ChunkErrorBoundary>
            <AuthProvider>
              <TermsProvider>
                <AdsProvider>
                  <I18nRootProvider locale={locale} messages={messages}>
                    <BugGuardianProvider>
                      <AdScriptLoader />
                      <AdsConsentBanner />
                      {/* Render global header with beta-like defaults so it matches beta-home */}
                      <Header
                        // Banner / early access — compute remaining days server-side so banner can show
                        showTopBanner={isGoldenBookCampaignActive()}
                        topBannerCtaLabel={messages['Nav.subscribeEarlyAccess'] ?? 'Subscribe for early access'}
                        topBannerSubtitle={messages['Nav.earlyAccessSubtitle'] ?? 'Turn AI chats into mini apps.'}
                        earlyAccessRibbonLabel={messages['Nav.earlyAccessRibbon'] ?? 'EARLY ACCESS'}
                        earlyAccessBadgeText={messages['Nav.earlyAccessBadge'] ?? '30 dana potpuno besplatnih usluga!'}
                        earlyAccessCountdownLabel={messages['Nav.earlyAccessCountdownLabel'] ?? 'Countdown'}
                        earlyAccessCountdownUnit={messages['Nav.earlyAccessCountdownUnit'] ?? 'days'}
                        // Compute early access remaining days by fetching the internal API on server
                        earlyAccessRemainingDays={await (async () => {
                          try {
                            const res = await fetch(`${API_URL.replace(/\/+$/, '')}/early-access`, { cache: 'no-store' });
                            if (!res.ok) return null;
                            const json = await res.json();
                            const settings = json?.settings ?? null;
                            if (!settings || !settings.isActive) return null;
                            const DAY_MS = 24 * 60 * 60 * 1000;
                            const duration = settings.durationDays ?? settings.perUserDurationDays;
                            if (!duration || duration <= 0) return null;
                            const start = typeof settings.startsAt === 'number' && settings.startsAt > 0 ? settings.startsAt : Date.now();
                            const end = start + duration * DAY_MS;
                            const remaining = end - Date.now();
                            return remaining > 0 ? Math.max(0, Math.ceil(remaining / DAY_MS)) : 0;
                          } catch (e) {
                            return null;
                          }
                        })()}
                        // Donate / golden book
                        donateEnabled={GOLDEN_BOOK.enabled && Boolean(GOLDEN_BOOK.paymentLink)}
                        donateLabel={messages['Nav.donate'] ?? 'Donate'}
                        donateActive={isGoldenBookCampaignActive()}
                        donateLink={GOLDEN_BOOK.paymentLink}
                        donateCountdownLabel={donateCountdownLabel}
                        // Beta-like header labels & CTA so global header matches beta-home
                        headerLabels={{
                          homeAria: (messages['BetaHome.header.homeAria'] as string) ?? 'Thesara home',
                          liveIndicator: (messages['BetaHome.header.liveBadge'] as string) ?? 'Live now',
                          themeToggle: (messages['BetaHome.header.themeToggle'] as string) ?? 'Toggle theme',
                          backLink: (messages['BetaHome.header.backLink'] as string) ?? '← Back to live',
                          backLinkMobile: (messages['BetaHome.header.backLinkMobile'] as string) ?? '← Back',
                        }}
                        shortVideoUrl={'https://youtube.com/shorts/esSpiQr63WE?feature=share'}
                        shortVideoLabel={(messages['Nav.shortVideo'] as string) ?? 'Video'}
                        goProLabel={(messages['Nav.goPro'] as string) ?? 'Go Pro'}
                        adsOffLabel={(messages['Nav.adsOff'] as string) ?? 'AdsOff'}
                        goGoldLabel={(messages['Nav.goGold'] as string) ?? 'Go Gold'}
                        faqLabel={(messages['Nav.faq'] as string) ?? 'FAQ'}
                        feedbackLabel={(messages['Nav.feedback'] as string) ?? 'Feedback'}
                        heroSubmitLabel={(messages['BetaHome.hero.actions.submit'] as string) ?? 'Submit App'}
                      />
                      <GlobalShell>
                        {children}
                      </GlobalShell>
                    </BugGuardianProvider>
                  </I18nRootProvider>
                </AdsProvider>
              </TermsProvider>
            </AuthProvider>
          </ChunkErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
