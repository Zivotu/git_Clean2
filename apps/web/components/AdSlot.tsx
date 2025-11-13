'use client';

import { useAds } from './AdsProvider';
import { ADSENSE_CLIENT_ID, ADSENSE_TEST_MODE, type AdSlotKey } from '@/config/ads';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { logAdsTelemetry } from '@/lib/adsTelemetry';

type AdSlotProps = {
  slotId?: string;
  slotKey?: AdSlotKey | string;
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
  placement?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function AdSlot({
  slotId,
  slotKey,
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
  placement,
}: AdSlotProps) {
  const { showAds } = useAds();
  const [closed, setClosed] = useState(false);
  const insRef = useRef<HTMLModElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const effectiveSlotId = slotId?.trim();
  const renderedLoggedRef = useRef(false);
  const filledLoggedRef = useRef(false);
  const resolvedPlacement = placement || slotKey || label || 'unknown';

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
    renderedLoggedRef.current = false;
    filledLoggedRef.current = false;
  }, [showAds, closed]);

  useEffect(() => {
    if (!showAds || closed || !effectiveSlotId || renderedLoggedRef.current) return;
    logAdsTelemetry({
      type: 'slot_render_attempt',
      slotKey: slotKey ? String(slotKey) : undefined,
      slotId: effectiveSlotId,
      placement: typeof resolvedPlacement === 'string' ? resolvedPlacement : undefined,
    });
    renderedLoggedRef.current = true;
  }, [showAds, closed, effectiveSlotId, slotKey, resolvedPlacement]);

  useEffect(() => {
    if (!scriptReady || !showAds || closed || !effectiveSlotId || filledLoggedRef.current) return;
    logAdsTelemetry({
      type: 'slot_render_filled',
      slotKey: slotKey ? String(slotKey) : undefined,
      slotId: effectiveSlotId,
      placement: typeof resolvedPlacement === 'string' ? resolvedPlacement : undefined,
    });
    filledLoggedRef.current = true;
  }, [scriptReady, showAds, closed, effectiveSlotId, slotKey, resolvedPlacement]);

  const handleClose = () => {
    setClosed(true);
    if (effectiveSlotId) {
      logAdsTelemetry({
        type: 'slot_closed',
        slotKey: slotKey ? String(slotKey) : undefined,
        slotId: effectiveSlotId,
        placement: typeof resolvedPlacement === 'string' ? resolvedPlacement : undefined,
      });
    }
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
