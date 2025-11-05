'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { useAds } from './AdsProvider';
import { ADSENSE_CLIENT_ID } from '@/config/ads';

export default function AdScriptLoader() {
  const { showAds } = useAds();
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (showAds) {
      setShouldLoad(true);
    }
  }, [showAds]);

  if (!shouldLoad) return null;

  return (
    <Script
      id="adsbygoogle-loader"
      strategy="afterInteractive"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      crossOrigin="anonymous"
    />
  );
}
