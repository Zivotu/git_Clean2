'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

import '@/lib/fontawesome';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { getCreatorProfile } from '@/lib/creators';
import { getPlayUrl } from '@/lib/play';
import { auth } from '@/lib/firebase';
import { resolvePreviewUrl } from '@/lib/preview';
import Avatar from '@/components/Avatar';
import { useI18n } from '@/lib/i18n-provider';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { appDetailsHref, playHref } from '@/lib/urls';

import { useTheme } from '@/components/ThemeProvider';

// Types
export type Listing = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  tags?: string[];
  visibility: 'public' | 'unlisted';
  playUrl: string;
  createdAt: number;
  author?: { uid?: string; name?: string; photo?: string; handle?: string };
  likesCount?: number;
  playsCount?: number;
  previewUrl?: string;
  likedByMe?: boolean;
  price?: number;
  // Optional UI flag to indicate current user is subscribed to this app
  isSubscribed?: boolean;
};

// Helpers
function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function timeSince(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(mo / 12);
  return `${y}y ago`;
}

function makeAbsoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

const PlayGlyph = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M7 5.143a1 1 0 0 1 1.528-.85l10.286 6.357a1 1 0 0 1 0 1.7L8.528 18.707A1 1 0 0 1 7 17.857z" />
  </svg>
);

const InfoGlyph = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2m0 3.25a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 12 5.25M14 18H10a1 1 0 0 1 0-2h1v-4h-.5a1 1 0 0 1 0-2H12a1 1 0 0 1 1 1v5h1a1 1 0 0 1 0 2" />
  </svg>
);

// Component
export interface AppCardProps {
  item: Listing;
  viewMode: 'grid' | 'list';
  toggleLike?: (slug: string) => void;
  busy?: Record<string, boolean>;
  onDetails?: (item: Listing) => void;
  priority?: boolean;
}

const AppCard = React.memo(
  ({
    item,
    viewMode,
    toggleLike,
    busy = {},
    onDetails,
    priority = false,
  }: AppCardProps) => {
    const router = useRouter();
    const { user } = useAuth();
    const { locale } = useI18n();
    const subscribedLabel = locale === 'hr' ? 'Pretplaćeno' : 'Subscribed';
    const shareButtonRef = useRef<HTMLButtonElement | null>(null);
    const shareMenuRef = useRef<HTMLDivElement | null>(null);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const shareBaseUrl = useMemo(() => {
      const base = playHref(item.id, { run: 1 });
      return makeAbsoluteUrl(base) || base;
    }, [item.id]);
    const [shareUrl, setShareUrl] = useState<string | null>(shareBaseUrl);
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

    const imgSrc = resolvePreviewUrl(item.previewUrl);
    const hasPreview = Boolean(imgSrc);
    const newBadge = Date.now() - item.createdAt < 1000 * 60 * 60 * 24 * 7;
    const likedCount = item.likesCount || 0;
    const isHot = likedCount > 100;
    const imgProps = priority ? { priority: true, loading: 'eager' as const } : {};

    const goToDetails = () => router.push(appDetailsHref(item.slug));
    const onKey = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') goToDetails();
    };

    const handlePlayClick = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const activeUser = user ?? auth?.currentUser ?? null;
      const isOwner = !!activeUser?.uid && !!item.author?.uid && activeUser.uid === item.author.uid;

      const openInNewTab = (url: string) => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          router.push(url);
        }
      };

      if (typeof item.price === 'number' && item.price > 0 && !isOwner) {
        openInNewTab(`/paywall?slug=${encodeURIComponent(item.slug)}`);
        return;
      }

      const dest = await getPlayUrl(item.id);

      if (!activeUser?.uid) {
        openInNewTab(`/login?next=${encodeURIComponent(dest)}`);
      } else {
        openInNewTab(dest);
      }
    };

    const activeUid = user?.uid || auth?.currentUser?.uid || null;
    const isCreator = !!activeUid && !!item.author?.uid && activeUid === item.author.uid;
    const relativeCreated = useRelativeTime(item.createdAt, timeSince);

    const { isDark } = useTheme();

    const handleDetailsClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isCreator || !onDetails) {
        goToDetails();
      } else {
        onDetails(item);
      }
    };

    useEffect(() => {
      setShareUrl(shareBaseUrl);
    }, [shareBaseUrl]);

    useEffect(() => {
      if (!shareMenuOpen) return;
      const handleClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (
          (shareMenuRef.current && shareMenuRef.current.contains(target)) ||
          (shareButtonRef.current && shareButtonRef.current.contains(target))
        ) {
          return;
        }
        setShareMenuOpen(false);
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [shareMenuOpen]);

    useEffect(() => {
      if (!shareMenuOpen) return;
      const handleKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setShareMenuOpen(false);
      };
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }, [shareMenuOpen]);

    useEffect(() => {
      if (copyState !== 'copied') return;
      const timer = window.setTimeout(() => setCopyState('idle'), 2000);
      return () => window.clearTimeout(timer);
    }, [copyState]);

    const ensureShareUrl = async (): Promise<string | null> => {
      if (shareUrl) return shareUrl;
      const fallback = shareBaseUrl;
      setShareUrl(fallback);
      return fallback;
    };

    const handleShareClick = async (e: React.MouseEvent) => {
      e.stopPropagation();
      setCopyState('idle');

      const url = await ensureShareUrl();
      if (!url) {
        setShareMenuOpen((prev) => !prev);
        return;
      }

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: item.title,
            text: item.description || undefined,
            url,
          });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            return;
          }
          console.warn('Native share failed, falling back to menu', err);
        }
      }

      setShareMenuOpen((prev) => !prev);
    };

    const copyToClipboard = async (value: string) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
      const temp = document.createElement('textarea');
      temp.value = value;
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(temp);
      }
    };

    const handleCopyLink = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = await ensureShareUrl();
      if (!url) {
        setCopyState('error');
        return;
      }
      try {
        await copyToClipboard(url);
        setCopyState('copied');
        setShareMenuOpen(false);
      } catch (err) {
        console.error('Copy link failed', err);
        setCopyState('error');
      }
    };

    const shareTargets = useMemo(() => {
      if (!shareUrl) return [];
      const encodedUrl = encodeURIComponent(shareUrl);
      const encodedMessage = encodeURIComponent(`${item.title} - ${shareUrl}`);
      return [
        {
          id: 'whatsapp',
          label: 'WhatsApp',
          href: `https://wa.me/?text=${encodedMessage}`,
        },
        {
          id: 'facebook',
          label: 'Facebook',
          href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        },
        {
          id: 'linkedin',
          label: 'LinkedIn',
          href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        },
      ];
    }, [shareUrl, item.title]);

    const renderActionButtons = (layout: 'inline' | 'stacked') => {
      const isStacked = layout === 'stacked';
      const containerClass = isStacked ? 'mt-3 flex gap-2 sm:hidden' : 'hidden sm:flex items-center gap-2';
      const playButtonClasses = cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 text-white font-semibold shadow-sm transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
        isStacked ? 'flex-1 px-4 py-2 text-base' : 'px-4 py-1.5 text-sm'
      );
      const detailsButtonClasses = cn(
        'inline-flex items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:text-gray-700 hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300',
        isStacked ? 'flex-1 gap-2 px-4 py-2 text-sm bg-white' : 'p-2.5 text-xs'
      );
      return (
        <div className={containerClass}>
          <button type="button" onClick={handlePlayClick} className={playButtonClasses}>
            <PlayGlyph className={isStacked ? 'w-5 h-5' : 'w-4 h-4'} />
            <span>{locale === 'hr' ? 'Pokreni' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={handleDetailsClick}
            className={detailsButtonClasses}
            title={locale === 'hr' ? 'Detalji aplikacije' : 'App details'}
          >
            <InfoGlyph className={isStacked ? 'w-5 h-5' : 'w-4 h-4'} />
            {isStacked ? (
              <span>{locale === 'hr' ? 'Detalji' : 'Details'}</span>
            ) : (
              <span className="sr-only">{locale === 'hr' ? 'Detalji' : 'Details'}</span>
            )}
          </button>
        </div>
      );
    };

    const ShareMenu = ({ align = 'right' }: { align?: 'left' | 'right' }) => (
      <div className="relative">
        <button
          ref={shareButtonRef}
          type="button"
          onClick={handleShareClick}
          className="p-2 text-gray-700 hover:text-emerald-600 focus:outline-none"
          aria-label="Share mini app"
          aria-haspopup="menu"
          aria-expanded={shareMenuOpen}
        >
          <FontAwesomeIcon icon={['fas', 'share-alt'] as const} className="text-xl" />
        </button>
        {shareMenuOpen && (
          <div
            ref={shareMenuRef}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'absolute mt-2 w-56 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 text-sm text-gray-700 z-20',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2 hover:bg-gray-50"
            >
              <span>
                {copyState === 'copied' ? 'Link copied' : copyState === 'error' ? 'Try again' : 'Copy link'}
              </span>
            </button>
            <div className="mt-1 border-t border-gray-100" />
            {shareTargets.length ? (
              <div className="mt-1 space-y-1">
                {shareTargets.map((target) => (
                  <a
                    key={target.id}
                    href={target.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-gray-50"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShareMenuOpen(false);
                    }}
                  >
                    <span>{target.label}</span>
                    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414L12.414 10l-3.707 3.707a1 1 0 01-1.414 0z" />
                    </svg>
                  </a>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-xs text-gray-400">Link will be ready soon.</p>
            )}
          </div>
        )}
      </div>
    );

    const AuthorLink = () => {
      const baseHandle = item.author?.handle;
      const baseName =
        item.author?.name ||
        (item.author as any)?.displayName ||
        undefined;
      const basePhoto =
        item.author?.photo ||
        (item.author as any)?.photoURL ||
        (item.author as any)?.avatarUrl ||
        undefined;
      const [creator, setCreator] = useState<{
        handle?: string;
        displayName?: string;
        photoURL?: string;
      }>({
        handle: baseHandle,
        displayName: baseName,
        photoURL: basePhoto,
      });

      useEffect(() => {
        setCreator({
          handle: baseHandle,
          displayName: baseName,
          photoURL: basePhoto,
        });
      }, [baseHandle, baseName, basePhoto]);

      const authorUid = item.author?.uid;

      useEffect(() => {
        if (!authorUid) return;
        let cancelled = false;
        (async () => {
          const profile = await getCreatorProfile(authorUid);
          if (cancelled || !profile) return;
          setCreator((prev) => ({
            handle: profile.handle || prev.handle,
            displayName: profile.displayName || prev.displayName,
            photoURL: profile.photoURL || prev.photoURL,
          }));
        })();
        return () => {
          cancelled = true;
        };
      }, [authorUid]);

      const handle = creator.handle;
      const primaryName =
        creator.displayName ||
        (handle ? `@${handle}` : baseName) ||
        'Anonymous';
      const secondaryHandle =
        creator.displayName && handle ? `@${handle}` : undefined;
      const avatarSrc = creator.photoURL || basePhoto;
      const href = handle ? `/u/${handle}` : undefined;
      const Inner = (
        <>
          <Avatar
            uid={item.author?.uid}
            src={avatarSrc}
            name={primaryName}
            size={viewMode === 'list' ? 20 : 28}
            className={viewMode === 'grid' ? 'ring-1 ring-gray-200' : ''}
          />
          <span className="flex flex-col leading-tight">
            <span className="text-sm text-gray-700 font-medium">{primaryName}</span>
            {secondaryHandle && (
              <span className="text-xs text-gray-400">{secondaryHandle}</span>
            )}
          </span>
        </>
      );
      if (!href) {
        return (
          <span className="flex items-center gap-2 text-sm text-gray-600" title={primaryName}>
            {Inner}
          </span>
        );
      }
      return (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 text-sm text-gray-600 hover:underline"
          title={`Otvori profil ${primaryName}`}
        >
          {Inner}
        </Link>
      );
    };

    if (viewMode === 'list') {
      return (
        <article
          role="link"
          tabIndex={0}
          onClick={goToDetails}
          onKeyDown={onKey}
          className="group bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer flex items-center gap-4 p-4"
          aria-label={`Open details for ${item.title}`}
        >
          <div className="relative flex-shrink-0 w-32 h-32 rounded-xl overflow-hidden">
            {hasPreview ? (
              <Image
                src={imgSrc}
                alt={item.title}
                fill
                style={{ color: 'transparent' }}
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                {...imgProps}
              />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-medium">
                Bez grafike
              </div>
            )}
            {newBadge && (
              <span className="absolute top-2 left-2 rounded-full bg-emerald-500 text-white text-xs font-medium px-2 py-0.5">NEW</span>
            )}
            {isHot && (
              <span className="absolute top-2 right-2 rounded-full bg-orange-500 text-white text-xs font-medium px-2 py-0.5">HOT</span>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <AuthorLink />
              <h2 className="mt-1 text-xl font-semibold text-gray-900 group-hover:text-emerald-600 transition">{item.title}
                {item.isSubscribed && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Subscribed</span>
                )}
              </h2>
          {item.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-3 break-words">{item.description}</p>
          )}
        </div>
        {renderActionButtons('stacked')}
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>{relativeCreated || ''}</span>
              <div className="flex items-center gap-4">
                <ShareMenu align="left" />
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {item.playsCount ?? 0}
          </span>
          {renderActionButtons('inline')}
                <button
                  id={`like-${item.slug}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLike?.(item.slug);
                  }}
                  className={cn(
                    'flex items-center gap-1 text-sm',
                    item.likedByMe ? 'text-red-500' : 'text-gray-400',
                    (busy[item.slug] || !toggleLike) && 'opacity-50 cursor-not-allowed'
                  )}
                  disabled={busy[item.slug] || !toggleLike}
                  aria-label={item.likedByMe ? 'Unlike' : 'Like'}
                >
                  <svg className="w-4 h-4" fill={item.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {likedCount}
                </button>
              </div>
            </div>
            {!!item.tags?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">#{t}</span>
                ))}
                {item.tags.length > 3 && <span className="text-xs text-gray-400">+{item.tags.length - 3}</span>}
              </div>
            )}
          </div>
        </article>
      );
    }

    return (
      <article
        role="link"
        tabIndex={0}
        onClick={goToDetails}
        onKeyDown={onKey}
        className={cn(
          'group rounded-3xl flex flex-col transition-all duration-300 hover:shadow-md cursor-pointer animate-fadeIn',
          item.isSubscribed
            ? `border ring-1 ${isDark ? 'border-emerald-700 ring-emerald-800 bg-[#18181B]' : 'border-emerald-300 ring-emerald-200 bg-white'}`
            : `border ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-gray-200 bg-white'}`
        )}
        aria-label={`Open details for ${item.title}`}
      >
        <div className="relative aspect-video rounded-t-2xl overflow-hidden">
          {hasPreview ? (
            <Image
              src={imgSrc}
              alt={item.title}
              fill
              style={{ color: 'transparent' }}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              {...imgProps}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-xs font-medium ${isDark ? 'bg-[#09090B] text-zinc-600' : 'bg-slate-100 text-slate-500'}`}>
              Bez grafike
            </div>
          )}
          {/* Price/Free badge */}
          <div className="absolute top-2 left-2">
            <span className="rounded-full bg-gray-900/90 text-white text-xs font-semibold px-2 py-0.5 shadow">
              {typeof item.price === 'number' && item.price > 0
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.price) + '/mo'
                : 'FREE'}
            </span>
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            {newBadge && (
              <span className="rounded-full bg-emerald-500 text-white text-xs font-medium px-2 py-0.5">NEW</span>
            )}
            {isHot && (
              <span className="rounded-full bg-orange-500 text-white text-xs font-medium px-2 py-0.5">HOT</span>
            )}
          </div>
          {item.isSubscribed && (
            <div className="absolute bottom-2 left-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/95 text-white text-xs font-semibold px-2 py-0.5 shadow">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L8.5 12.086l6.793-6.793a1 1 0 0 1 1.414 0Z" clipRule="evenodd" /></svg>
                {subscribedLabel}
              </span>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col flex-1">
          <AuthorLink />
          <h2 className={`mt-1 text-xl font-semibold transition line-clamp-1 ${isDark ? 'text-zinc-100 group-hover:text-emerald-400' : 'text-gray-900 group-hover:text-emerald-600'}`}>{item.title}
            {item.isSubscribed && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{subscribedLabel}</span>
            )}
          </h2>
          {item.description && (
            <p className={`mt-1 text-sm line-clamp-3 break-words ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{item.description}</p>
          )}
          {!!item.tags?.length && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.slice(0, 4).map((t) => (
                <span key={t} className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">#{t}</span>
              ))}
              {item.tags.length > 4 && <span className="text-xs text-gray-400">+{item.tags.length - 4}</span>}
            </div>
          )}
          <div className="mt-auto pt-4 flex items-center justify-between text-sm text-gray-500">
            <span>{relativeCreated || ''}</span>
            <div className="flex items-center gap-4">
              <ShareMenu align="left" />
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {item.playsCount ?? 0}
              </span>
              {renderActionButtons('inline')}
              <button
                id={`like-${item.slug}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike?.(item.slug);
                }}
                className={cn(
                  'flex items-center gap-1 text-sm',
                  item.likedByMe ? 'text-red-500' : 'text-gray-400',
                  (busy[item.slug] || !toggleLike) && 'opacity-50 cursor-not-allowed'
                )}
                disabled={busy[item.slug] || !toggleLike}
                aria-label={item.likedByMe ? 'Unlike' : 'Like'}
              >
                <svg className="w-4 h-4" fill={item.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {likedCount}
              </button>
            </div>
          </div>
        {renderActionButtons('stacked')}
        </div>
      </article>
    );
  }
);

AppCard.displayName = 'AppCard';

export default AppCard;


