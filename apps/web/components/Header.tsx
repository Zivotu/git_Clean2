"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth, getDisplayName } from '@/lib/auth';
import Avatar from '@/components/Avatar';
import Logo from '@/components/Logo';
import { triggerConfetti } from '@/components/Confetti';
import FeedbackModal from '@/components/FeedbackModal';
import { useI18n } from '@/lib/i18n-provider';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { GOLDEN_BOOK, getGoldenBookCountdown, isGoldenBookCampaignActive } from '@/lib/config';
import GoldenBookIcon from '../../../assets/GoldenBook_Icon_1.png';
import { useEarlyAccessCampaign } from '@/hooks/useEarlyAccessCampaign';
import { useEntitlements } from '@/hooks/useEntitlements';
import { apiPost } from '@/lib/api';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Header() {
  const { messages } = useI18n();
  const tNav = (k: string) => messages[`Nav.${k}`] || k;
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { user } = useAuth();
  const name = getDisplayName(user);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [subscribeMessage, setSubscribeMessage] = useState<string | null>(null);
  const donateLink = GOLDEN_BOOK.paymentLink;
  const donateEnabled = GOLDEN_BOOK.enabled && Boolean(donateLink);
  const donateActive = donateEnabled && isGoldenBookCampaignActive();
  const countdown = getGoldenBookCountdown();
  const { data: entitlements } = useEntitlements();
  const { data: campaign } = useEarlyAccessCampaign();
  const donateCountdownLabel =
    countdown && countdown.daysRemaining > 0
      ? (messages['Nav.donateCountdown'] || '{days} days left').replace(
          '{days}',
          String(countdown.daysRemaining),
        )
      : null;
  const earlyAccessRemainingDays = useMemo(() => {
    if (!campaign?.isActive) return null;
    const duration = campaign.durationDays ?? campaign.perUserDurationDays;
    if (!duration || duration <= 0) return null;
    const start =
      typeof campaign.startsAt === 'number' && campaign.startsAt > 0
        ? campaign.startsAt
        : Date.now();
    const end = start + duration * DAY_MS;
    const remaining = end - Date.now();
    return remaining > 0 ? Math.max(0, Math.ceil(remaining / DAY_MS)) : 0;
  }, [
    campaign?.durationDays,
    campaign?.perUserDurationDays,
    campaign?.isActive,
    campaign?.startsAt,
  ]);
  const earlyAccessBadgeText =
    messages['Nav.earlyAccessBadge'] ?? '30 dana potpuno besplatnih usluga!';
  const earlyAccessDaysText = messages['Nav.earlyAccessDays'] ?? '{days} days left';
  const earlyAccessRibbonLabel = messages['Nav.earlyAccessRibbon'] ?? 'EARLY ACCESS';
  const earlyAccessCountdownLabel = messages['Nav.earlyAccessCountdownLabel'] ?? 'Countdown';
  const earlyAccessCountdownUnit = messages['Nav.earlyAccessCountdownUnit'] ?? 'days';
  const formatEarlyAccessDays = (value: number) => {
    if (!Number.isFinite(value)) return '';
    if (earlyAccessDaysText.includes('{days}')) {
      return earlyAccessDaysText.replace('{days}', String(value));
    }
    return `${value} ${earlyAccessDaysText}`.trim();
  };
  const earlyAccessTooltip =
    messages['Nav.earlyAccessTooltip'] ??
    'Register today and get 30 days of Gold + No Ads for free. No tricks—just publish while everything is unlocked.';
  const showEarlyAccessBadge = campaign?.isActive && earlyAccessRemainingDays !== null;
  const badgeImages = useMemo(() => {
    const results: Array<{ key: string; src: string; alt: string }> = [];
    if (campaign?.isActive || entitlements?.gold) {
      results.push({
        key: 'gold',
        src: '/assets/GoldUser_Badge.png',
        alt: messages['Nav.goldBadge'] ?? 'Gold member',
      });
    }
    if (campaign?.isActive || entitlements?.noAds) {
      results.push({
        key: 'noads',
        src: '/assets/NoAds_Badge.png',
        alt: messages['Nav.noAdsBadge'] ?? 'No Ads',
      });
    }
    return results;
  }, [campaign?.isActive, entitlements?.gold, entitlements?.noAds, messages]);
  const alreadySubscribed = Boolean(entitlements?.earlyAccess?.subscribedAt);
  const showSubscribeButton = Boolean(
    campaign?.isActive && (!user || !alreadySubscribed) && subscribeStatus !== 'success',
  );
  const paidAppsLabel = messages['Nav.paidApps'] ?? 'Paid Apps';
  const profileLabel = messages['Nav.myProfile'] ?? messages['Nav.profile'] ?? 'Profile';
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const showTopEarlyAccessBar = Boolean(campaign?.isActive);
  const topBannerCtaLabel = messages['Nav.subscribeEarlyAccess'] ?? 'Subscribe for early access';

  const handlePublishClick = useCallback(() => {
    triggerConfetti();
    router.push('/create');
  }, [router]);

  const handleEarlyAccessBadgeClick = useCallback(() => {
    router.push('/login');
  }, [router]);

  const handleSubscribe = useCallback(async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setSubscribeStatus('loading');
    setSubscribeMessage(null);
    try {
      await apiPost('/me/early-access/subscribe');
      setSubscribeStatus('success');
      setSubscribeMessage(
        messages['Nav.earlyAccessSubscribed'] ?? "You'll get 50% off the first month.",
      );
    } catch (err: any) {
      const msg =
        err?.message || messages['Nav.earlyAccessSubscribeError'] || 'Subscription failed.';
      setSubscribeStatus('error');
      setSubscribeMessage(msg);
    }
  }, [messages, router, user]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [profileMenuOpen]);

  const toggleProfileMenu = useCallback(() => {
    setProfileMenuOpen((prev) => !prev);
  }, []);

  const handleMobileMenuToggle = useCallback(() => {
    setProfileMenuOpen(false);
    setShowMobileMenu((prev) => !prev);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      {showTopEarlyAccessBar && (
        <div className="bg-purple-700 text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-1.5 text-[11px] font-semibold sm:text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="uppercase tracking-wide">{topBannerCtaLabel}</span>
              {showSubscribeButton && (
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={subscribeStatus === 'loading'}
                  className="inline-flex items-center justify-center rounded-full bg-white px-3 py-0.5 text-[11px] font-bold text-purple-700 shadow-sm transition hover:bg-purple-50 disabled:opacity-60 sm:px-4 sm:py-1 sm:text-sm"
                >
                  {topBannerCtaLabel}
                </button>
              )}
              {subscribeMessage && (
                <span className="text-[10px] font-normal text-purple-100 sm:text-xs">
                  {subscribeMessage}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2 text-purple-900">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-0.5 text-purple-700 shadow-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M12 2.75l1.9 5.84h6.15l-4.98 3.62 1.9 5.84L12 14.43l-4.97 3.62 1.9-5.84-4.98-3.62H10.1L12 2.75z" />
                  </svg>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-purple-600">
                  {earlyAccessRibbonLabel}
                </span>
                <span className="text-sm font-bold text-purple-800">
                  {earlyAccessBadgeText}
                </span>
              </div>
              {earlyAccessRemainingDays !== null && (
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-0.5 text-purple-700 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-purple-600">
                    {earlyAccessCountdownLabel}
                  </span>
                  <span className="text-lg font-black text-purple-900 leading-none">
                    {earlyAccessRemainingDays}
                  </span>
                  <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide">
                    {earlyAccessCountdownUnit}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="relative mx-auto w-[90%] px-4 py-4">
        <div className="flex items-center gap-4 w-full">
          <Logo className="shrink-0" />
          <div className="hidden md:flex flex-1 justify-center min-w-0">
            <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
              {pathname === '/create' ? (
                <span className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-base font-semibold">
                  {tNav('publishApp')}
                </span>
              ) : (
                <Link
                  href="/create"
                  onClick={handlePublishClick}
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-base font-semibold transition hover:bg-emerald-700"
                  title="Publish new app"
                >
                  {tNav('publishApp')}
                </Link>
              )}
              {pathname === '/pro' ? (
                <span className="px-4 py-2 rounded-lg bg-gray-200 text-gray-900 font-medium">{tNav('goPro')}</span>
              ) : (
                <Link
                  href="/pro"
                  className="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition font-medium"
                  title="Go Pro"
                >
                  {tNav('goPro')}
                </Link>
              )}
              {pathname === '/faq' ? (
                <span className="px-3 py-2 rounded-lg bg-gray-200 text-gray-900 font-medium">{tNav('faq')}</span>
              ) : (
                <Link
                  href="/faq"
                  className="px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition font-medium"
                  title="FAQ"
                >
                  {tNav('faq')}
                </Link>
              )}
              <Link
                href="/golden-book"
                className={`rounded-lg transition px-2 py-1 ${
                  pathname === '/golden-book' ? 'ring-2 ring-amber-200' : 'hover:bg-gray-100'
                }`}
                title="Golden Book"
                aria-label={tNav('goldenBook')}
              >
                <Image
                  src={GoldenBookIcon}
                  alt={tNav('goldenBook')}
                  width={40}
                  height={40}
                  style={{ height: 40, width: 'auto' }}
                  className="object-contain"
                  priority={false}
                />
                <span className="sr-only">{tNav('goldenBook')}</span>
              </Link>
              {donateEnabled && (
                donateActive ? (
                  <a
                    href={donateLink as string}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-medium transition hover:bg-amber-600 flex items-center gap-2"
                  >
                    {tNav('donate')}
                    {donateCountdownLabel && (
                      <span className="text-[11px] bg-white/25 rounded-full px-2 py-0.5 font-semibold">
                        {donateCountdownLabel}
                      </span>
                    )}
                  </a>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 font-medium">
                    {tNav('donate')}
                  </span>
                )
              )}
              {/* Feedback button (text only) */}
              <button
                type="button"
                onClick={() => setShowFeedback(true)}
                className="px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition font-medium"
                title={tNav('feedback')}
              >
                {tNav('feedback')}
              </button>
            </nav>
          </div>
          <div className="hidden md:flex items-center justify-end gap-4 ml-4 flex-shrink-0" ref={profileMenuRef}>
            <div className="rounded-full border border-gray-200 px-3 py-1 shadow-sm bg-white">
              <LocaleSwitcher />
            </div>
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleProfileMenu}
                  aria-expanded={profileMenuOpen}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1 shadow-sm transition hover:border-gray-300"
                >
                  <Avatar
                    uid={user.uid}
                    src={user.photoURL ?? undefined}
                    name={name}
                    size={28}
                    className="ring-1 ring-gray-200"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-4 w-4 text-gray-500"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h14M3 10h14M3 14h14" />
                  </svg>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-xl space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        uid={user.uid}
                        src={user.photoURL ?? undefined}
                        name={name}
                        size={36}
                        className="ring-1 ring-gray-200"
                      />
                      <div>
                        <p className="font-semibold text-gray-900">{name || tNav('login')}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Link
                        href="/my"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center justify-between rounded-lg px-2 py-1 text-gray-700 hover:bg-gray-50"
                      >
                        <span>{tNav('myProjects')}</span>
                      </Link>
                      <Link
                        href="/my-creators"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center justify-between rounded-lg px-2 py-1 text-gray-700 hover:bg-gray-50"
                      >
                        <span>{tNav('myCreators')}</span>
                      </Link>
                      <Link
                        href="/pro-apps"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center justify-between rounded-lg px-2 py-1 text-gray-700 hover:bg-gray-50"
                      >
                        <span>{paidAppsLabel}</span>
                      </Link>
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Perks</p>
                      {badgeImages.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {badgeImages.map((badge) => (
                            <span
                              key={badge.key}
                              className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700"
                            >
                              <Image src={badge.src} alt={badge.alt} width={28} height={18} className="h-3 w-auto" />
                              {badge.alt}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-400">No perks unlocked just yet.</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                      <Link
                        href="/profile"
                        onClick={() => setProfileMenuOpen(false)}
                        className="text-gray-700 hover:text-indigo-600"
                      >
                        {profileLabel}
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          auth && signOut(auth);
                        }}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        {tNav('logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition font-medium"
                title="Sign in"
              >
                {tNav('login')}
              </Link>
            )}
          </div>
          <button
            className="md:hidden ml-auto p-2 rounded-lg hover:bg-gray-100 transition"
            onClick={handleMobileMenuToggle}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showMobileMenu ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
        {showMobileMenu && (
          <nav className="md:hidden mt-4 pb-3 space-y-2 border-t pt-3">
            <div className="flex justify-end">
              <div className="rounded-full border border-gray-200 px-3 py-1 shadow-sm bg-white">
                <LocaleSwitcher />
              </div>
            </div>
            {showEarlyAccessBadge && (
              <button
                type="button"
                onClick={handleEarlyAccessBadgeClick}
                title={earlyAccessTooltip}
                className="flex flex-col items-center gap-1 rounded-lg bg-amber-100 text-amber-900 px-4 py-2 text-sm font-semibold w-full shadow-sm"
              >
                <span>{earlyAccessBadgeText}</span>
                <span className="text-xs font-normal text-amber-800">
                  {formatEarlyAccessDays(earlyAccessRemainingDays)}
                </span>
              </button>
            )}
            {pathname === '/create' ? (
              <span className="block px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-base font-semibold text-center">
                {tNav('publishApp')}
              </span>
            ) : (
              <Link
                href="/create"
                onClick={handlePublishClick}
                className="block px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-base font-semibold text-center"
                title="Publish new app"
              >
                {tNav('publishApp')}
              </Link>
            )}
            {pathname === '/my' ? (
              <span className="block px-4 py-2 rounded-lg text-gray-900 text-center bg-gray-200">
                {tNav('myProjects')}
              </span>
            ) : (
              <Link href="/my" className="block px-4 py-2 rounded-lg text-gray-600 text-center" title="My projects">
                {tNav('myProjects')}
              </Link>
            )}
              {user &&
                (pathname === '/my-creators' ? (
                  <span className="block px-4 py-2 rounded-lg text-gray-900 text-center bg-gray-200">{tNav('myCreators')}</span>
                ) : (
                  <Link
                    href="/my-creators"
                    className="block px-4 py-2 rounded-lg text-gray-600 text-center"
                    title="My creators"
                  >
                    {tNav('myCreators')}
                  </Link>
                ))}

              {user &&
                (pathname === '/pro-apps' ? (
                  <span className="block px-4 py-2 rounded-lg text-gray-900 text-center bg-gray-200">{paidAppsLabel}</span>
                ) : (
                  <Link
                    href="/pro-apps"
                    className="block px-4 py-2 rounded-lg text-gray-600 text-center"
                    title="Paid Apps"
                  >
                    {paidAppsLabel}
                  </Link>
                ))}
            {pathname === '/pro' ? (
              <span className="block px-4 py-2 rounded-lg text-gray-900 text-center bg-gray-200">{tNav('goPro')}</span>
            ) : (
              <Link href="/pro" className="block px-4 py-2 rounded-lg text-gray-600 text-center" title="Go Pro">
                {tNav('goPro')}
              </Link>
            )}
            {pathname === '/faq' ? (
              <span className="block px-4 py-2 rounded-lg text-gray-900 text-center bg-gray-200">{tNav('faq')}</span>
            ) : (
              <Link href="/faq" className="block px-4 py-2 rounded-lg text-gray-600 text-center" title="FAQ">
                {tNav('faq')}
              </Link>
            )}
            <Link
              href="/golden-book"
              className={`block rounded-lg ${
                pathname === '/golden-book' ? 'bg-gray-200' : 'bg-transparent'
              } p-2`}
              title="Golden Book"
              aria-label={tNav('goldenBook')}
            >
              <Image
                src={GoldenBookIcon}
                alt={tNav('goldenBook')}
                width={64}
                height={64}
                style={{ height: 64, width: 'auto' }}
                className="mx-auto object-contain"
              />
              <span className="sr-only">{tNav('goldenBook')}</span>
            </Link>
            {donateEnabled && (
              donateActive ? (
                <a
                  href={donateLink as string}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-center font-medium"
                >
                  {tNav('donate')}
                  {donateCountdownLabel && (
                    <span className="text-xs bg-white/25 rounded-full px-2 py-0.5 font-semibold">
                      {donateCountdownLabel}
                    </span>
                  )}
                </a>
              ) : (
                <span className="block px-4 py-2 rounded-lg bg-gray-100 text-gray-400 text-center">
                  {tNav('donate')}
                </span>
              )
            )}
            {badgeImages.length > 0 && (
              <div className="flex items-center justify-center gap-4 py-2">
                {badgeImages.map((badge) => (
                  <Image
                    key={badge.key}
                    src={badge.src}
                    alt={badge.alt}
                    width={72}
                    height={44}
                    className="object-contain max-h-10 w-auto"
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setShowMobileMenu(false);
                setShowFeedback(true);
              }}
              className="block px-4 py-2 rounded-lg text-gray-600 text-center"
            >
              {tNav('feedback')}
            </button>
            {user ? (
              <>
                {pathname === '/profile' ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200">
                    <Avatar uid={user.uid} src={user.photoURL ?? undefined} name={name} size={28} />
                    <span className="text-sm text-gray-900">{name}</span>
                  </div>
                ) : (
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100"
                    onClick={() => setShowMobileMenu(false)}
                    title="My profile"
                  >
                    <Avatar uid={user.uid} src={user.photoURL ?? undefined} name={name} size={28} />
                    <span className="text-sm text-gray-900">{name}</span>
                  </Link>
                )}
                <button
                  onClick={() => auth && signOut(auth)}
                  className="block w-full px-4 py-2 rounded-lg text-gray-600 text-center"
                >
                  {tNav('logout')}
                </button>
              </>
            ) : (
              <Link href="/login" className="block px-4 py-2 rounded-lg bg-gray-900 text-white text-center" title="Sign in">
                {tNav('login')}
              </Link>
            )}
          </nav>
        )}
        {/* Feedback modal rendered at top-level of header so it's part of header component tree */}
        <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
      </div>
      {/* Decorative Bugs graphic positioned just under the header (looks like it's hanging from the header). Placed as child of header so left:0 is viewport-left. */}
      <div
        className="hidden md:block"
        style={{ position: 'absolute', left: 0, top: '100%', transform: 'translateY(1px)', zIndex: 40, pointerEvents: 'none' }}
      >
        {/* Increased by 20% from 112 -> 135 */}
        <Image src="/assets/Bugs.png" alt="Bugs" width={135} height={135} />
      </div>
    </header>
  );
}
