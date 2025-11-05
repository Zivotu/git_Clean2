 'use client';

import { useAds } from './AdsProvider';
import { ADSENSE_CLIENT_ID, ADSENSE_TEST_MODE } from '@/config/ads';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type AdSlotProps = {
  slotId?: string;
  className?: string;
  style?: CSSProperties;
  adStyle?: CSSProperties;
  format?: string;
  layout?: string;
  layoutKey?: string;
  fullWidthResponsive?: boolean;
  closable?: boolean;
  onClose?: () => void;
  label?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function AdSlot({
  slotId,
  className,
  style,
  adStyle,
  format = "auto",
  layout,
  layoutKey,
  fullWidthResponsive = true,
  closable = true,
  onClose,
  label = "Advertisement",
}: AdSlotProps) {
  const { showAds } = useAds();
  const [closed, setClosed] = useState(false);
  const insRef = useRef<HTMLModElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const effectiveSlotId = slotId?.trim();

  // Make TypeScript aware of the adsbygoogle property on window without using `any`.
  // window.adsbygoogle is declared globally in apps/web/types/global.d.ts

  useEffect(() => {
    if (!showAds || closed || !effectiveSlotId) return;
    const node = insRef.current;
    if (!node) return;

    const initAd = () => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setScriptReady(true);
      } catch (err: unknown) {
        // Avoid using `any` for linting — stringify unknown error safely for logs.
        const errMsg = err instanceof Error ? err : String(err);
        console.warn('[AdSlot] Failed to push ad slot', errMsg);
      }
    };

    if (node.getAttribute("data-adsbygoogle-status")) {
      setScriptReady(true);
      return;
    }

    const timer = window.setTimeout(initAd, 0);
    return () => window.clearTimeout(timer);
  }, [showAds, closed, effectiveSlotId]);

  useEffect(() => {
    if (showAds && !closed) return;
    setScriptReady(false);
  }, [showAds, closed]);

  const handleClose = () => {
    setClosed(true);
    onClose?.();
  };

  const wrapperClass = useMemo(
    () =>
      cx(
        "relative w-full overflow-hidden rounded-xl border border-gray-200 bg-white/70 shadow-sm transition-all",
        !scriptReady && "animate-pulse bg-gray-100",
        className,
      ),
    [className, scriptReady],
  );

  if (!showAds || closed) {
    return null;
  }

  if (!effectiveSlotId) {
    return (
      <div className={wrapperClass} style={style}>
        <div className="flex h-24 items-center justify-center text-sm text-gray-500">
          {label} placeholder (postavi ID oglasa)
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass} style={style}>
      <span className="sr-only">{label}</span>
      {closable && (
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-2 top-2 rounded-full bg-white/80 px-2 pb-1 text-lg leading-none text-gray-500 shadow hover:text-gray-700"
          aria-label="Zatvori oglas"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      )}
      <ins
        ref={insRef}
        className="adsbygoogle block"
        style={{ display: "block", minHeight: "120px", ...adStyle }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={effectiveSlotId}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
        data-ad-layout={layout}
        data-ad-layout-key={layoutKey}
        data-adtest={ADSENSE_TEST_MODE ? "on" : undefined}
      />
    </div>
  );
}
