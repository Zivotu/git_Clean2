'use client';

import { useEffect } from 'react';
import { useAds } from './AdsProvider';
import { ADSENSE_CLIENT_ID } from '@/config/ads';

const SCRIPT_ID = 'thesara-adsense-loader';

export default function AdScriptLoader() {
  const { showAds } = useAds();

  useEffect(() => {
    if (!showAds || typeof window === 'undefined') return;
    const existing =
      document.getElementById(SCRIPT_ID) ||
      document.querySelector(`script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]`);
    if (existing) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  }, [showAds]);

  return null;
}
