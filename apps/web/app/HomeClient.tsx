'use client';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, type TargetAndTransition } from 'framer-motion';
import { PUBLIC_API_URL, SITE_NAME } from '@/lib/config';
import { useAuth, getDisplayName } from '@/lib/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Logo from '@/components/Logo';
import { triggerConfetti, triggerHearts } from '@/components/Confetti';
import { handleFetchError } from '@/lib/handleFetchError';
import { apiFetch, apiGet, ApiError } from '@/lib/api';
import AppCard, { type Listing } from '@/components/AppCard';
import AdSlot from '@/components/AdSlot';
import { useAds } from '@/components/AdsProvider';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useEarlyAccessCampaign } from '@/hooks/useEarlyAccessCampaign';
import { useI18n } from '@/lib/i18n-provider';
import { AD_SLOT_IDS } from '@/config/ads';
import type { Listing as ApiListing } from '@/lib/types';
import { resolvePreviewUrl } from '@/lib/preview';
import { playHref, appDetailsHref } from '@/lib/urls';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import AdminAccessTrigger from '@/components/AdminAccessTrigger';
import PartnershipModal from '@/components/PartnershipModal';
import { useBugGuardian } from '@/components/BugGuardian/BugGuardianProvider';
export { };
type HomeClientProps = {
  initialItems?: ApiListing[];
};

type LoadOptions = {
  silent?: boolean;
};

function toCardListing(item: ApiListing): Listing {
  const rawCreated = (item as any).createdAt ?? item.createdAt;
  const createdAt = typeof rawCreated === 'number'
    ? rawCreated
    : rawCreated
      ? new Date(rawCreated).getTime()
      : Date.now();

  const tags = Array.isArray(item.tags)
    ? item.tags
    : item.tags
      ? [String(item.tags)]
      : [];

  const likesCount = (item as any).likesCount;
  const playsCount = (item as any).playsCount;
  const likedByMe = (item as any).likedByMe;
  const price = (item as any).price;
  const isSubscribed = (item as any).isSubscribed;

  return {
    ...item,
    tags,
    visibility: item.visibility === 'unlisted' ? 'unlisted' : 'public',
    playUrl: (item as any).playUrl ?? '',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    likesCount: typeof likesCount === 'number' ? likesCount : undefined,
    playsCount: typeof playsCount === 'number' ? playsCount : undefined,
    likedByMe: typeof likedByMe === 'boolean' ? likedByMe : undefined,
    price: typeof price === 'number' ? price : undefined,
    isSubscribed: typeof isSubscribed === 'boolean' ? isSubscribed : undefined,
  } as Listing;
}

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type FeedEntry = { kind: 'app'; item: Listing } | { kind: 'ad'; key: string };

type CommunityStats = {
  publishedApps: number;
  membersCount: number;
};

type TrendingCarouselProps = {
  items: Listing[];
  title: string;
  countLabel: string;
  onOpen: (slug: string) => void;
};

function TrendingCarousel({ items, title, countLabel, onOpen }: TrendingCarouselProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const firstSlideRef = useRef<HTMLDivElement | null>(null);
  const [slideSize, setSlideSize] = useState(296);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [disableTransition, setDisableTransition] = useState(false);

  useEffect(() => {
    const measure = () => {
      const el = firstSlideRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setSlideSize(Math.round(rect.width + 16));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [items.length]);

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const t = setInterval(() => {
      setCarouselIndex((i) => i + 1);
    }, 8000);
    return () => clearInterval(t);
  }, [items.length, paused]);

  useEffect(() => {
    setCarouselIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (items.length === 0) return;
    if (carouselIndex >= items.length) {
      const id = setTimeout(() => {
        setDisableTransition(true);
        setCarouselIndex(0);
        requestAnimationFrame(() => setDisableTransition(false));
      }, 400);
      return () => clearTimeout(id);
    }
  }, [carouselIndex, items.length]);

  const prevCarousel = useCallback(() => {
    setDisableTransition(false);
    setCarouselIndex((prev) => (prev > 0 ? prev - 1 : items.length > 0 ? items.length - 1 : 0));
  }, [items.length]);

  const nextCarousel = useCallback(() => {
    setDisableTransition(false);
    setCarouselIndex((prev) => prev + 1);
  }, []);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <div className="text-xs text-gray-500">{countLabel}</div>
      </div>
      <div className="relative">
        <div className="overflow-hidden pb-2">
          <div
            ref={trackRef}
            className={cn('flex gap-4', disableTransition ? '' : 'transition-transform duration-500 ease-out')}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            style={{ transform: `translateX(-${carouselIndex * slideSize}px)` }}
          >
            {[...items, ...items].map((it, idx) => {
              const img = resolvePreviewUrl(it.previewUrl);
              const hasPreview = Boolean(img);
              const imgProps = idx === 0 ? { priority: true, loading: 'eager' as const } : {};
              return (
                <div
                  key={`${it.id}-${idx}`}
                  data-carousel-item
                  ref={idx === 0 ? firstSlideRef : undefined}
                  className="w-[280px] flex-none"
                >
                  <div
                    onClick={() => onOpen(it.slug)}
                    className="group cursor-pointer rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden"
                  >
                    <div className="relative h-40">
                      {hasPreview ? (
                        <Image
                          src={img}
                          alt={it.title}
                          fill
                          style={{ color: 'transparent' }}
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          {...imgProps}
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 text-slate-500 text-xs font-medium grid place-items-center">
                          Bez grafike
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                        <span className="text-white text-base font-medium line-clamp-1">{it.title}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <button
          onClick={prevCarousel}
          className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-md"
          aria-label="Previous"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={nextCarousel}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/80 p-2 rounded-full shadow-md"
          aria-label="Next"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function HomeAdsRail({ slotId, slotKey }: { slotId?: string; slotKey: string }) {
  if (!slotId) return null;
  return (
    <div className="sticky top-28 space-y-4">
      <AdSlot
        slotId={slotId}
        slotKey={slotKey}
        placement={`home.${slotKey}`}
        className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm"
        label="Advertisement"
      />
    </div>
  );
}

type Point = { x: number; y: number };
type SpiderPath = {
  start: Point;
  end: Point;
  duration: number;
  angle: number;
  id: string;
};

const SPIDER_MIN_DELAY = 18000;
const SPIDER_MAX_DELAY = 42000;

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function choice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function angleDeg(from: Point, to: Point) {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function getPathBounds() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pad = 80;
  return { w, h, pad };
}

function makeSpiderPath(): SpiderPath {
  const { w, h, pad } = getPathBounds();
  const edge = choice(['left', 'right', 'top', 'bottom'] as const);
  let start: Point = { x: 0, y: 0 };
  let end: Point = { x: 0, y: 0 };

  if (edge === 'left') {
    start = { x: -pad, y: rand(0, h) };
    end = { x: w + pad, y: rand(0, h) };
  } else if (edge === 'right') {
    start = { x: w + pad, y: rand(0, h) };
    end = { x: -pad, y: rand(0, h) };
  } else if (edge === 'top') {
    start = { x: rand(0, w), y: -pad };
    end = { x: rand(0, w), y: h + pad };
  } else {
    start = { x: rand(0, w), y: h + pad };
    end = { x: rand(0, w), y: -pad };
  }

  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const duration = distance / rand(60, 80);
  const angle = angleDeg(start, end);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return { start, end, duration, angle, id };
}

function BugSprite({ size = 21, angle = 0 }: { size?: number; angle?: number }) {
  return (
    <div
      className="leading-none select-none"
      style={{ transform: `rotate(${angle}deg)` }}
      title="I&apos;m playing hide and seek with the developers 🙂"
      aria-hidden
    >
      <span style={{ fontSize: size, display: 'inline-block' }}>🕷️</span>
    </div>
  );
}

function WalkingBug({
  path,
  onDone,
  onClick,
}: {
  path: SpiderPath;
  onDone: () => void;
  onClick: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const wiggle: TargetAndTransition = {
    y: [0, -1.5, 0, 1.5, 0],
    transition: { repeat: Infinity, duration: 0.35, ease: 'easeInOut' },
  };

  return (
    <motion.div
      initial={{ x: path.start.x, y: path.start.y }}
      animate={{ x: path.end.x, y: path.end.y }}
      transition={{ duration: path.duration, ease: 'linear' }}
      onAnimationComplete={onDone}
      className="absolute z-[9999] pointer-events-auto"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      aria-hidden
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      <div className="relative">
        {showTip && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] bg-black/80 text-white rounded px-2 py-1 shadow whitespace-nowrap pointer-events-none">
            I&apos;m playing hide and seek with the developers <span>🙂</span>
          </div>
        )}
        <motion.div animate={wiggle}>
          <BugSprite angle={path.angle} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function SpiderOverlay() {
  const { open: openBugGuardian } = useBugGuardian();
  const [bugs, setBugs] = useState<SpiderPath[]>([]);
  const timerRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const planNext = useCallback(() => {
    if (typeof window === 'undefined') return;
    clearTimer();
    const nextInMs = rand(SPIDER_MIN_DELAY, SPIDER_MAX_DELAY);
    timerRef.current = window.setTimeout(() => {
      setBugs((prev) => {
        if (prev.length === 0) {
          return [makeSpiderPath()];
        }
        planNext();
        return prev;
      });
    }, nextInMs);
  }, [clearTimer]);

  useEffect(() => {
    if (!mounted) return;
    planNext();
    return () => {
      clearTimer();
    };
  }, [planNext, clearTimer, mounted]);

  if (!mounted || typeof window === 'undefined') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden select-none">
      {bugs.map((bug) => (
        <WalkingBug
          key={bug.id}
          path={bug}
          onClick={openBugGuardian}
          onDone={() => {
            setBugs((prev) => prev.filter((b) => b.id !== bug.id));
            planNext();
          }}
        />
      ))}
    </div>
  );
}

function Toast({
  message,
  type = 'success',
  onClose,
}: {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  const colors = {
    success: 'from-emerald-500 to-green-600',
    error: 'from-red-500 to-red-600',
    info: 'from-blue-500 to-blue-600',
  } as const;
  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slideInRight">
      <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-lg bg-gradient-to-r', colors[type])}>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}

function DetailsModal({ open, item, onClose }: { open: boolean; item: Listing | null; onClose: () => void }) {
  const [full, setFull] = useState<Listing | null>(null);
  const { messages, locale } = useI18n();
  const tHome = (k: string, params?: Record<string, any>) => {
    let s = messages[`Home.${k}`] || '';
    if (params) for (const [pk, pv] of Object.entries(params)) s = s.replaceAll(`{${pk}}`, String(pv));
    return s || k;
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!open || !item?.slug) { setFull(null); return; }
      try {
        const { getListingBySlug } = await import('@/lib/loaders');
        const detail = await getListingBySlug(item.slug, { locale });
        if (!cancelled && detail) setFull({ ...item, ...toCardListing(detail) });
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [open, item?.slug, locale, item]);
  if (!open || !item) return null;
  const data = (full || item) as Listing;
  const imgSrc = resolvePreviewUrl(data.previewUrl);
  const hasPreview = Boolean(imgSrc);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden animate-slideUp">
        <div className="relative h-56 bg-gray-50">
          {hasPreview ? (
            <Image src={imgSrc} alt={data.title} fill style={{ color: 'transparent' }} className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm font-medium">
              Bez grafike
            </div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white shadow" aria-label="Close">
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 line-clamp-1">{data.title}</h2>
            <span className="text-sm text-gray-500">{tHome('plays', { count: data.playsCount ?? 0 })}</span>
          </div>
          {typeof data.price === 'number' && data.price > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
              Price: €{Number(data.price).toFixed(2)}
            </div>
          )}
          {data.description && (
            <p className="mt-2 text-gray-600 whitespace-pre-line">{data.description}</p>
          )}
          {!!data.tags?.length && (
            <div className="mt-3 flex flex-wrap gap-1">
              {data.tags.map((t) => (
                <span key={t} className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">#{t}</span>
              ))}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={playHref(data.id, { run: 1 })}
              prefetch={false}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            >
              Play
            </Link>
            <Link href={appDetailsHref(data.slug)} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>Full Details</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeClient({ initialItems = [] }: HomeClientProps) {
  const ent = useEntitlements();
  const { data: earlyAccessCampaign } = useEarlyAccessCampaign();
  const [showEarlyAccessPopup, setShowEarlyAccessPopup] = useState(false);
  const popupStorageKey = useMemo(
    () => (earlyAccessCampaign?.id ? `eaPopupSeen:${earlyAccessCampaign.id}` : null),
    [earlyAccessCampaign?.id],
  );
  const initialItemsRef = useRef(initialItems?.map(toCardListing) ?? []);
  const initialPublishedCount = useMemo(
    () => initialItemsRef.current.filter((item) => item.visibility !== 'unlisted').length,
    [initialItemsRef],
  );
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const router = useRouter();
  const searchParams = useSafeSearchParams();
  const { messages, locale } = useI18n();
  const tHome = (k: string, params?: Record<string, any>) => {
    let s = messages[`Home.${k}`] || '';
    if (params) for (const [pk, pv] of Object.entries(params)) s = s.replaceAll(`{${pk}}`, String(pv));
    return s || k;
  };
  const tToast = useCallback((k: string) => messages[`Toasts.${k}`] || k, [messages]);
  const tNav = (k: string) => messages[`Nav.${k}`] || k;
  const tFooter = (k: string) => messages[`Footer.${k}`] || k;
  const popupTitle = messages['Home.earlyAccessTitle'] || 'Early Access is live!';
  const popupBody =
    messages['Home.earlyAccessBody'] ||
    'Gold + NoAds are active for you during the campaign. Publish an app to make the most of it.';
  const popupCta = messages['Home.earlyAccessPublish'] || 'Publish an app';
  const popupSignIn = messages['Home.earlyAccessSignIn'] || 'Sign in now';
  const popupDismiss = messages['Home.earlyAccessDismiss'] || 'Close';
  const [items, setItems] = useState<Listing[]>(initialItemsRef.current);
  const [q, setQ] = useState('');
  const [isLoading, setIsLoading] = useState(initialItemsRef.current.length === 0);
  const { user } = useAuth();
  const primaryCtaLabel = user ? popupCta : popupSignIn;
  const primaryHref = user ? '/create' : '/login';
  const [isAdmin, setIsAdmin] = useState(false);
  const [detailsItem, setDetailsItem] = useState<Listing | null>(null);
  const [communityStats, setCommunityStats] = useState<CommunityStats>({
    publishedApps: initialPublishedCount,
    membersCount: 0,
  });
  const dismissEarlyAccessPopup = useCallback(() => {
    if (typeof window !== 'undefined' && popupStorageKey) {
      try {
        window.localStorage.setItem(popupStorageKey, String(Date.now()));
      } catch {
        /* noop */
      }
    }
    setShowEarlyAccessPopup(false);
  }, [popupStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!earlyAccessCampaign?.isActive || !popupStorageKey) {
      setShowEarlyAccessPopup(false);
      return;
    }
    try {
      if (window.localStorage.getItem(popupStorageKey)) {
        setShowEarlyAccessPopup(false);
        return;
      }
    } catch {
      /* ignore storage errors */
    }
    setShowEarlyAccessPopup(true);
  }, [earlyAccessCampaign?.isActive, popupStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      let adminClaim = false;
      if (user) {
        try {
          const tok = await auth?.currentUser?.getIdTokenResult(true);
          adminClaim = !!tok?.claims?.admin || tok?.claims?.role === 'admin' || !!tok?.claims?.isAdmin;
        } catch {
          adminClaim = false;
        }
      }
      if (!cancelled) setIsAdmin(adminClaim);
    };
    check();
    return () => { cancelled = true; };
  }, [user]);
  const name = getDisplayName(user);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'new' | 'popular' | 'title'>('new');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showPartnership, setShowPartnership] = useState(false);
  const { isSlotEnabled, showAds } = useAds();
  const openDetails = useCallback((it: Listing) => setDetailsItem(it), []);
  const closeDetails = useCallback(() => setDetailsItem(null), []);
  const welcome = searchParams.get('welcome');
  const homeRailLeftSlotRaw = (AD_SLOT_IDS.homeRailLeft || '').trim();
  const homeRailRightSlotRaw = (AD_SLOT_IDS.homeRailRight || '').trim();
  const homeGridInlineSlotRaw = (AD_SLOT_IDS.homeGridInline || '').trim();
  const homeFeedFooterSlotRaw = (AD_SLOT_IDS.homeFeedFooter || '').trim();
  const homeRailLeftSlot = isSlotEnabled('homeRailLeft') ? homeRailLeftSlotRaw : '';
  const homeRailRightSlot = isSlotEnabled('homeRailRight') ? homeRailRightSlotRaw : '';
  const homeGridInlineSlot = isSlotEnabled('homeGridInline') ? homeGridInlineSlotRaw : '';
  const homeFeedFooterSlot = isSlotEnabled('homeFeedFooter') ? homeFeedFooterSlotRaw : '';
  const showHomeCtaBanner = true;
  const shouldInjectGridAds = showAds && viewMode === 'grid' && homeGridInlineSlot.length > 0;
  const [leftPanelDensity, setLeftPanelDensity] = useState<'default' | 'compact'>('default');
  const pageContainerClass = 'w-full max-w-none';
  const renderSearchAndStats = (wrapperClassName: string) => (
    <div className={wrapperClassName}>
      <div className="bg-white rounded-2xl border border-gray-200 p-2.5 mb-2 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2 w-full">
          <div className="relative flex-1 min-w-[220px]">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="search-input"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
              }}
              placeholder={tHome('searchPlaceholder')}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-10 pr-4 py-2 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none transition"
              type="text"
              aria-label={tHome('searchPlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded transition flex items-center', viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200')}
              aria-label="Grid view"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition flex items-center', viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200')}
              aria-label="List view"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 flex-wrap">
              {tagData.slice(0, 6).map(([tag]) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1 rounded-full text-sm border transition',
                    selectedTags.includes(tag)
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  )}
                  aria-pressed={selectedTags.includes(tag)}
                >
                  #{tag}
                </button>
              ))}
              {tagData.length > 6 && (
                <button className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700">+{tagData.length - 6}</button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'new' | 'popular' | 'title')}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:border-emerald-500"
            >
              <option value="new">{tHome('sort.new')}</option>
              <option value="popular">{tHome('sort.popular')}</option>
              <option value="title">{tHome('sort.title')}</option>
            </select>
            {(selectedTags.length > 0 || q) && (
              <button onClick={clearFilters} className="text-sm text-red-500 hover:underline">
                {tHome('clear')}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end text-xs sm:text-sm text-gray-600 mt-1 mb-4">
        <div className="flex flex-wrap gap-4">
          <div
            className="flex items-center gap-2"
            title={tHome('publishedCount', { count: formattedStats.apps })}
          >
            <span className="text-base font-semibold text-gray-900">{formattedStats.apps}</span>
            <svg
              className="h-5 w-5 text-gray-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
            </svg>
            <span className="sr-only">{tHome('publishedCount', { count: formattedStats.apps })}</span>
          </div>
          <div
            className="flex items-center gap-2"
            title={tHome('membersCount', { count: formattedStats.members })}
          >
            <span className="text-base font-semibold text-gray-900">{formattedStats.members}</span>
            <svg
              className="h-5 w-5 text-gray-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.5 7.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0ZM4 19.25a5.75 5.75 0 0111.5 0v.25H4v-.25Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.75 10.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0ZM13.5 19.5v-.25a4.25 4.25 0 015.5-4.08"
              />
            </svg>
            <span className="sr-only">{tHome('membersCount', { count: formattedStats.members })}</span>
          </div>
        </div>
      </div>
      {errorMessage && (<div className="mb-6 p-4 rounded-lg bg-red-50 text-red-700 text-sm">{errorMessage}</div>)}
    </div>
  );
  const renderListings = (wrapperClassName: string, options: { hideRails?: boolean } = {}) => {
    const { hideRails = false } = options;
    const layoutClass = hideRails ? '' : homeLayoutClass;
    return (
      <div className={wrapperClassName}>
        <div className={layoutClass}>
          {!hideRails && homeRailLeftSlot && (
            <div className="hidden xl:block">
              <HomeAdsRail slotId={homeRailLeftSlot} slotKey="homeRailLeft" />
            </div>
          )}
          <div>
            {isLoading ? (
              <div className={cardsLayoutClass}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-pulse">
                    <div className="aspect-video bg-gray-100" />
                    <div className="p-4">
                      <div className="h-6 bg-gray-100 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-gray-100 rounded w-full mb-4" />
                      <div className="flex gap-2"><div className="h-4 bg-gray-100 rounded w-16" /><div className="h-4 bg-gray-100 rounded w-16" /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : processed.length ? (
              <div className={cardsLayoutClass}>
                {(() => {
                  let renderedAppIndex = 0;
                  return entriesToRender.map((entry) => {
                    if (entry.kind === 'ad') {
                      if (!homeGridInlineSlot) return null;
                      return (
                        <div
                          key={entry.key}
                          className="h-full rounded-2xl border border-gray-200 bg-white shadow-sm"
                        >
                          <div className="h-full p-4">
                            <AdSlot
                              slotId={homeGridInlineSlot}
                              slotKey="homeGridInline"
                              placement="home.grid.inline"
                              className="h-full w-full"
                              adStyle={{ minHeight: '100%' }}
                              label="Advertisement"
                              closable={false}
                            />
                          </div>
                        </div>
                      );
                    }
                    const item = entry.item;
                    const isFirst = renderedAppIndex === 0;
                    renderedAppIndex += 1;
                    return (
                      <AppCard
                        key={item.id}
                        item={{ ...item, isSubscribed: subscribed.has(item.id) }}
                        toggleLike={toggleLike}
                        busy={busy}
                        viewMode={viewMode}
                        onDetails={openDetails}
                        priority={isFirst}
                      />
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="text-center py-20">
                <h3 className="text-2xl font-bold text-gray-900">{tHome('noApps')}</h3>
                <p className="mt-2 text-gray-500">{q || selectedTags.length ? tHome('tryAdjust') : tHome('beFirst')}</p>
                <div className="mt-6">
                  <Link href="/create" onClick={handlePublishClick} className="px-5 py-2.5 rounded-lg bg-emerald-500 text-white font-medium transition hover:bg-emerald-600" title="Publish your first app">{tHome('publish')}</Link>
                </div>
              </div>
            )}
            {errorDetails && (
              <div className="mt-6 text-center">
                <p className="text-sm text-red-700">{errorDetails}</p>
                <button onClick={() => load()} className="mt-2 px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600">{tToast('retry')}</button>
              </div>
            )}
            {homeFeedFooterSlot && (
              <div className="mt-10">
                <AdSlot
                  slotId={homeFeedFooterSlot}
                  slotKey="homeFeedFooter"
                  placement="home.feed.footer"
                  className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm"
                  adStyle={{ minHeight: '300px' }}
                  label="Advertisement"
                />
              </div>
            )}
          </div>
          {!hideRails && homeRailRightSlot && (
            <div className="hidden xl:block">
              <HomeAdsRail slotId={homeRailRightSlot} slotKey="homeRailRight" />
            </div>
          )}
        </div>
      </div>
    );
  };
  const homeLayoutClass = useMemo(() => {
    const hasLeft = Boolean(homeRailLeftSlot);
    const hasRight = Boolean(homeRailRightSlot);
    if (hasLeft && hasRight) {
      return 'xl:grid xl:grid-cols-[220px_minmax(0,1fr)_220px] xl:gap-3';
    }
    if (hasLeft) {
      return 'xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-3';
    }
    if (hasRight) {
      return 'xl:grid xl:grid-cols-[minmax(0,1fr)_220px] xl:gap-3';
    }
    return '';
  }, [homeRailLeftSlot, homeRailRightSlot]);
  const [ctaTopOffset, setCtaTopOffset] = useState(0);

  useEffect(() => {
    if (!showHomeCtaBanner) return;
    const header = document.querySelector<HTMLElement>('header.sticky');
    if (!header) {
      setCtaTopOffset(0);
      return;
    }
    const updateOffset = () => {
      setCtaTopOffset(header.getBoundingClientRect().height || 0);
    };
    updateOffset();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateOffset())
        : null;
    resizeObserver?.observe(header);
    window.addEventListener('resize', updateOffset);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, [showHomeCtaBanner]);

  // Load subscribed app ids to highlight cards
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.uid) {
        setSubscribed(new Set());
        return;
      }
      try {
        const json = await apiGet('/me/subscribed-apps', { auth: true });
        const { normalizeList } = await import('@/lib/adapters');
        const { items: subscribedItems } = normalizeList(json);
        if (cancelled) return;
        const ids = new Set(subscribedItems.map((it) => it.id));
        setSubscribed(ids);
      } catch {
        const purchases = ent.data?.purchases || [];
        const ids = new Set<string>();
        for (const token of purchases) {
          if (typeof token !== 'string') continue;
          if (token.includes(':')) {
            const [, value] = token.split(':', 2);
            if (value && value.length > 0) ids.add(value);
            continue;
          }
          if (token.length > 8) {
            ids.add(token);
          }
        }
        setSubscribed(ids);
      }
    })();
    return () => { cancelled = true; };
  }, [ent.data?.purchases, user?.uid]);

  useEffect(() => {
    if (welcome) {
      setToast({ message: tToast('welcome'), type: 'success' });
      router.replace('/');
    }
  }, [welcome, router, tToast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const measure = () => {
      setLeftPanelDensity(window.innerHeight < 920 ? 'compact' : 'default');
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const handlePublishClick = useCallback(() => {
    triggerConfetti();
    router.push('/create');
  }, [router]);

  const toggleLike = useCallback(
    async (slug: string) => {
      if (busy[slug]) return;
      if (!user?.uid) {
        setToast({ message: tToast('loginToLike'), type: 'info' });
        return;
      }
      setBusy((prev) => ({ ...prev, [slug]: true }));
      try {
        const current = items.find((it) => it.slug === slug);
        const like = !(current?.likedByMe);
        try {
          await apiFetch(`/listing/${slug}/like`, { method: 'POST', body: { uid: user?.uid, like }, auth: true });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            if (auth) await signOut(auth);
            window.location.href = '/login';
            return;
          }
          if (e instanceof ApiError && e.status === 429) {
            setToast({ message: tToast('slowDown'), type: 'info' });
            return;
          }
          throw e;
        }
        setItems((prev) => prev.map((it) => it.slug === slug ? { ...it, likedByMe: like, likesCount: Math.max(0, (it.likesCount || 0) + (like ? 1 : -1)) } : it));
        const el = document.getElementById(`like-${slug}`);
        if (el) {
          el.classList.add('animate-bounce');
          setTimeout(() => el.classList.remove('animate-bounce'), 500);
        }
        if (like) triggerHearts();
      } catch (e) {
        handleFetchError(e, 'Failed to toggle like');
        setToast({ message: tToast('likeError'), type: 'error' });
      } finally {
        setBusy((prev) => ({ ...prev, [slug]: false }));
      }
    },
    [busy, items, user, tToast]
  );

  const load = useCallback((options: LoadOptions = {}) => {
    let retryCount = 0;
    const maxRetries = 3;
    const fetchData = async () => {
      const { silent } = options;
      if (!silent) {
        setIsLoading(true);
      }
      setErrorMessage('');
      setErrorDetails('');
      try {
        const { getListings } = await import('@/lib/loaders');
        const { items: normalized } = await getListings({ locale });
        const mappedItems = normalized.map(toCardListing);
        setItems(mappedItems);
        setCommunityStats((prev) => ({
          ...prev,
          publishedApps: mappedItems.filter((it) => it.visibility !== 'unlisted').length,
        }));
      } catch (e) {
        handleFetchError(e, 'Failed to load listings');
        if (!silent) {
          setErrorDetails(e instanceof Error ? e.message : String(e));
        }
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchData, 1000 * retryCount);
          return;
        }
        if (silent) {
          setToast({ message: tToast('loadError'), type: 'error' });
        } else {
          setErrorMessage(tToast('loadError'));
          setItems([]);
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    };
    fetchData();
  }, [tToast, locale]);

  const lastLocaleRef = useRef<string | null>(null);
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    lastLocaleRef.current = locale;
    if (initialItemsRef.current.length) {
      load({ silent: true });
      return;
    }
    load();
  }, [load, locale]);

  // Re-fetch listings when locale changes so cards update immediately
  useEffect(() => {
    if (!fetched.current) return;
    if (lastLocaleRef.current === locale) return;
    lastLocaleRef.current = locale;
    load();
  }, [locale, load]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const statsUrl = `${PUBLIC_API_URL}/community/stats`;

    const loadStats = async () => {
      try {
        const res = await fetch(statsUrl, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setCommunityStats((prev) => ({
          publishedApps:
            typeof data?.publishedApps === 'number' ? data.publishedApps : prev.publishedApps,
          membersCount:
            typeof data?.membersCount === 'number' ? data.membersCount : prev.membersCount,
        }));
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  const tagData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) (it.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }, []);
  const clearFilters = useCallback(() => { setSelectedTags([]); setQ(''); setSortBy('new'); }, []);

  const processed = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let result = items.filter(x => x.visibility !== 'unlisted');
    if (needle) {
      result = result
        .filter(x => {
          const score = (x.title.toLowerCase().includes(needle) ? 3 : 0) + ((x.description || '').toLowerCase().includes(needle) ? 2 : 0) + ((x.tags || []).some(t => t.toLowerCase().includes(needle)) ? 1 : 0);
          return score > 0;
        })
        .sort((a, b) => {
          const scoreA = (a.title.toLowerCase().includes(needle) ? 3 : 0) + ((a.description || '').toLowerCase().includes(needle) ? 2 : 0) + ((a.tags || []).some(t => t.toLowerCase().includes(needle)) ? 1 : 0);
          const scoreB = (b.title.toLowerCase().includes(needle) ? 3 : 0) + ((b.description || '').toLowerCase().includes(needle) ? 2 : 0) + ((b.tags || []).some(t => t.toLowerCase().includes(needle)) ? 1 : 0);
          return scoreB - scoreA;
        });
    }
    if (selectedTags.length) {
      result = result.filter(x => { const tags = x.tags || []; return selectedTags.every(t => tags.includes(t)); });
    }
    if (!needle) {
      result = [...result].sort((a, b) => {
        if (sortBy === 'new') {
          const tb = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt ?? 0).getTime();
          const ta = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt ?? 0).getTime();
          return (tb || 0) - (ta || 0);
        }
        if (sortBy === 'popular') return (b.likesCount || 0) - (a.likesCount || 0);
        return a.title.localeCompare(b.title);
      });
    }
    return result;
  }, [items, q, selectedTags, sortBy]);

  const numberFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(locale || 'en-US');
    } catch {
      return new Intl.NumberFormat('en-US');
    }
  }, [locale]);

  const formattedStats = useMemo(
    () => ({
      apps: numberFormatter.format(Math.max(0, communityStats.publishedApps)),
      members: numberFormatter.format(Math.max(0, communityStats.membersCount)),
    }),
    [communityStats, numberFormatter],
  );


  const gridEntries = useMemo<FeedEntry[]>(() => {
    if (!shouldInjectGridAds) {
      return processed.map((item) => ({ kind: 'app', item }));
    }
    const next: FeedEntry[] = [];
    processed.forEach((item, index) => {
      next.push({ kind: 'app', item });
      const nextIndex = index + 1;
      if (homeGridInlineSlot && nextIndex % 8 === 0 && nextIndex < processed.length) {
        next.push({ kind: 'ad', key: `home-grid-ad-${index}` });
      }
    });
    return next;
  }, [processed, shouldInjectGridAds, homeGridInlineSlot]);

  const topLiked = useMemo(() => {
    const src = processed.length ? processed : items;
    const sorted = [...src].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
    const withPreview = sorted.filter((x) => !!x.previewUrl);
    const withoutPreview = sorted.filter((x) => !x.previewUrl);
    return [...withPreview, ...withoutPreview].slice(0, 10);
  }, [processed, items]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && e.ctrlKey) { e.preventDefault(); document.getElementById('search-input')?.focus(); }
      if (e.key === 'Escape') setShowFilters(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const cardsLayoutClass = cn(
    viewMode === 'grid'
      ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'
      : 'space-y-4',
  );
  const entriesToRender: FeedEntry[] =
    viewMode === 'grid'
      ? gridEntries
      : processed.map((item) => ({ kind: 'app', item }));
  const homeCtaBannerAlt = (messages['Home.cta.bannerAlt'] as string) || 'Thesara promo banner';
  const stackedHomeCtaImages = [
    '/assets/CTA_Part_1.jpg',
    '/assets/CTA_Part_2.jpg',
    '/assets/CTA_Part_3.jpg',
    '/assets/CTA_Part_4.jpg',
  ] as const;
  const sidePanelsTop = Math.max(0, ctaTopOffset) + 16;
  const heroFrameClass = 'w-full max-w-none';

  return (
    <>
      <SpiderOverlay />
      <div className="px-4 pt-6 2xl:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
          <div className="flex-1 text-left">
            <p className="font-semibold">Preview a brand new Thesara home experience.</p>
            <p className="text-xs text-emerald-800/90">Switch to the BetaNewDesign to explore the redesign without affecting the live page.</p>
          </div>
          <Link
            href="/beta-home"
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            BetaNewDesign
          </Link>
        </div>
      </div>
      <section className="pt-10 pb-4 relative">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900">
              {tHome('headline.one')} <span className="text-emerald-600">{tHome('headline.two')}</span>
            </h1>
            <p className="mt-2 text-lg text-gray-500 max-w-2xl">{tHome('tagline')}</p>
          </div>
          <div className="w-full mt-6">
            <TrendingCarousel
              items={topLiked}
              title={tHome('trending')}
              countLabel={tHome('appsCount', { count: topLiked.length })}
              onOpen={(slug) => router.push(appDetailsHref(slug))}
            />
          </div>
          {renderSearchAndStats('w-full mt-6')}
          {renderListings('w-full mt-4 pb-4', { hideRails: true })}
        </div>
      </section>
    </>
  );
}
