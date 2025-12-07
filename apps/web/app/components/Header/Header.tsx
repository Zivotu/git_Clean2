"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import ProfileCard from '@/components/ProfileCard';
import { useAuth, getDisplayName } from '@/lib/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { PUBLIC_API_URL } from '@/lib/config';
import {
  Video,
  Crown,
  HelpCircle,
  SunMedium,
  MoonStar,
  Upload,
  Heart,
  MessageSquare,
  X,
  Menu,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';
import { useEntitlements } from '@/hooks/useEntitlements';

import GoldenBookIcon from '../../../../../assets/GoldenBook_Icon_1.png';

type HeaderLabels = {
  homeAria: string;
  liveIndicator: string;
  themeToggle: string;
  backLink: string;
  backLinkMobile: string;
};

type HeaderProps = {
  headerLabels?: HeaderLabels;
  shortVideoUrl?: string;
  shortVideoLabel?: string;
  goProLabel?: string;
  adsOffLabel?: string;
  goGoldLabel?: string;
  faqLabel?: string;
  feedbackLabel?: string;
  donateEnabled?: boolean;
  donateLabel?: string;
  donateActive?: boolean;
  donateLink?: string;
  donateCountdownLabel?: string | null;
  heroSubmitLabel?: string;
  onSubmitClick?: () => void;
  profileSection?: React.ReactNode;
  // Beta/top banner props
  showTopBanner?: boolean;
  topBannerCtaLabel?: string;
  topBannerSubtitle?: string;
  earlyAccessRibbonLabel?: string;
  earlyAccessBadgeText?: string;
  earlyAccessCountdownLabel?: string;
  earlyAccessCountdownUnit?: string;
  earlyAccessRemainingDays?: number | null;
  subscribeStatus?: 'idle' | 'loading' | 'success' | 'error';
  subscribeMessage?: string | null;
  onSubscribe?: () => void;
};

const DEFAULT_HEADER_LABELS: HeaderLabels = {
  homeAria: 'Thesara home',
  liveIndicator: 'Live',
  themeToggle: 'Toggle theme',
  backLink: '← Back to live',
  backLinkMobile: '← Back',
};

function HeaderChip({ icon: Icon, label, isDark, subtle = false, href, external = false, onClick }: any) {
  const className = `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-300 ${subtle
    ? isDark
      ? 'border-[#27272A] bg-[#18181B] text-zinc-300 hover:bg-[#09090B]'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    : isDark
      ? 'border-transparent bg-[#22C55E]/10 text-emerald-300 hover:bg-[#22C55E]/20'
      : 'border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
    }`;
  const content = (
    <>
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </>
  );
  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={className} onClick={onClick}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button className={className} type="button" onClick={onClick}>
      {content}
    </button>
  );
}

function HeaderPrimaryButton({ label, href, onClick, className = '' }: any) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full bg-[#16A34A] px-6 py-2 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#15803D] ${className}`}
    >
      <Upload className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

function HeaderDonationButton({ label, href, countdown, isDark, active }: any) {
  if (active && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-600"
      >
        <Heart className="h-3.5 w-3.5" />
        <span>{label}</span>
        {countdown && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
            {countdown}
          </span>
        )}
      </a>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-400' : 'border-slate-200 bg-white text-slate-500'
        }`}
    >
      <Heart className="h-3.5 w-3.5" />
      <span>{label}</span>
    </span>
  );
}

export default function Header({
  headerLabels = DEFAULT_HEADER_LABELS,
  shortVideoUrl = '',
  shortVideoLabel = 'Video',
  goProLabel = 'Go Pro',
  adsOffLabel = 'AdsOff',
  goGoldLabel = 'Go Gold',
  faqLabel = 'FAQ',
  feedbackLabel = 'Feedback',
  donateEnabled = false,
  donateLabel = 'Donate',
  donateActive = false,
  donateLink,
  donateCountdownLabel = null,
  heroSubmitLabel = 'Submit',
  onSubmitClick = () => { },
  profileSection = null,
  showTopBanner = false,
  topBannerCtaLabel = 'Subscribe for early access',
  topBannerSubtitle = 'Turn AI chats into mini apps.',
  earlyAccessRibbonLabel = 'EARLY ACCESS',
  earlyAccessBadgeText = '30 dana potpuno besplatnih usluga!',
  earlyAccessCountdownLabel = 'Countdown',
  earlyAccessCountdownUnit = 'days',
  earlyAccessRemainingDays = null,
  subscribeStatus = 'idle',
  subscribeMessage = null,
  onSubscribe = () => { },
}: HeaderProps) {
  const { isDark, toggleTheme } = useTheme();
  const { messages } = useI18n();
  const { data: entitlements } = useEntitlements();
  const [showVideoPopup, setShowVideoPopup] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const topBannerCtaLabelLocal = (messages && messages['Nav.launchBadge']) ?? 'Live since 17.11.2025.';
  const topBannerSubtitleLocal = (messages && messages['Nav.earlyAccessSubtitle']) ?? topBannerSubtitle;
  const earlyAccessRibbonLabelLocal = (messages && messages['Nav.earlyAccessRibbon']) ?? earlyAccessRibbonLabel;
  const earlyAccessBadgeTextLocal = (messages && messages['Nav.earlyAccessBadge']) ?? earlyAccessBadgeText;
  const earlyAccessCountdownLabelLocal = (messages && messages['Nav.earlyAccessCountdownLabel']) ?? earlyAccessCountdownLabel;
  const earlyAccessCountdownUnitLocal = (messages && messages['Nav.earlyAccessCountdownUnit']) ?? earlyAccessCountdownUnit;

  // Determine GoPro link text and visibility based on entitlements
  const hasGold = entitlements?.gold ?? false;
  const hasNoAds = entitlements?.noAds ?? false;
  const showProLink = !hasGold || !hasNoAds;
  const showCrownInProfile = hasGold && hasNoAds;

  let proLinkText = goProLabel;
  if (!hasGold && hasNoAds) {
    proLinkText = goGoldLabel;
  } else if (hasGold && !hasNoAds) {
    proLinkText = adsOffLabel;
  }

  // If a page didn't pass a profileSection, build a default one using auth
  const authCtx = useAuth?.();
  const user = authCtx?.user ?? null;
  const [creatorProfile, setCreatorProfile] = React.useState<{ displayName?: string; photoURL?: string } | null>(null);

  React.useEffect(() => {
    let canceled = false;
    if (!user?.uid) {
      setCreatorProfile(null);
      return;
    }
    const loadCreatorProfile = async () => {
      try {
        const res = await fetch(`${PUBLIC_API_URL}/creators/id/${encodeURIComponent(user.uid)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (canceled) return;
        const displayName =
          typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : '';
        const photoCandidates = [data.photoURL, data.photo, data.avatarUrl];
        const resolvedPhoto =
          (photoCandidates.find((value) => typeof value === 'string' && value.trim()) as string | undefined) || '';
        setCreatorProfile({
          displayName,
          photoURL: resolvedPhoto,
        });
      } catch (err) {
        if (!canceled) {
          console.warn('Failed to load creator profile', err);
        }
      }
    };
    loadCreatorProfile();
    return () => {
      canceled = true;
    };
  }, [user?.uid]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ displayName?: string; photoURL?: string }>).detail;
      if (!detail) return;
      setCreatorProfile((prev) => ({
        displayName: detail.displayName ?? prev?.displayName ?? '',
        photoURL: detail.photoURL ?? prev?.photoURL ?? '',
      }));
    };
    window.addEventListener('creator-profile-updated', handler as EventListener);
    return () => window.removeEventListener('creator-profile-updated', handler as EventListener);
  }, []);

  const creatorDisplayName = creatorProfile?.displayName?.trim();
  const creatorPhoto = creatorProfile?.photoURL?.trim();
  const fallbackProfileName = getDisplayName(user) || undefined;
  const sanitizedCreatorName =
    creatorDisplayName && creatorDisplayName !== user?.uid ? creatorDisplayName : undefined;
  // Creator documents sometimes fall back to UID when created manually, so prefer auth name in that case.
  const resolvedProfileName = sanitizedCreatorName || fallbackProfileName || 'Guest';
  const resolvedProfilePhoto = creatorPhoto || ((user as any)?.photoURL ?? null);

  const profileLabels = {
    login: (messages && messages['Nav.login']) || 'Sign In',
    logout: (messages && messages['Nav.logout']) || 'Sign Out',
    viewProfile: (messages && messages['Nav.viewProfile']) || 'View profile',
  };

  const defaultProfileSection = (
    <ProfileCard
      user={user}
      displayName={resolvedProfileName}
      photo={resolvedProfilePhoto}
      isDark={isDark}
      showCrown={showCrownInProfile}
      loginLabel={profileLabels.login}
      logoutLabel={profileLabels.logout}
      viewProfileLabel={profileLabels.viewProfile}
      onLogout={() => {
        try {
          if (auth) void signOut(auth).catch(() => { });
        } catch { }
      }}
    />
  );

  const mobileProfileSection = (
    <ProfileCard
      user={user}
      displayName={resolvedProfileName}
      photo={resolvedProfilePhoto}
      isDark={isDark}
      showCrown={showCrownInProfile}
      compact={true}
      loginLabel={profileLabels.login}
      logoutLabel={profileLabels.logout}
      viewProfileLabel={profileLabels.viewProfile}
      onLogout={() => {
        try {
          if (auth) void signOut(auth).catch(() => { });
        } catch { }
      }}
    />
  );

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const NavLinks = () => (
    <>
      <Link
        href="https://youtube.com/shorts/EdwGjcLEn1g"
        target="_blank"
        className="transition-opacity hover:opacity-80"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <Image
          src={isDark ? '/assets/VideoLink_Button_B.png' : '/assets/VideoLink_Button_W.png'}
          alt={shortVideoLabel || "Short Video"}
          width={120}
          height={32}
          className="h-8 w-auto object-contain"
        />
      </Link>
      {showProLink && (
        <HeaderChip icon={Crown} label={proLinkText} isDark={isDark} subtle href="/pro" onClick={() => setIsMobileMenuOpen(false)} />
      )}
      <HeaderChip icon={HelpCircle} label={faqLabel} isDark={isDark} subtle href="/faq" onClick={() => setIsMobileMenuOpen(false)} />
      <HeaderChip icon={MessageSquare} label={feedbackLabel} isDark={isDark} subtle href="/feedback" onClick={() => setIsMobileMenuOpen(false)} />
      {donateEnabled && (
        <HeaderDonationButton
          label={donateLabel}
          href={donateActive && donateLink ? donateLink : undefined}
          countdown={donateActive ? donateCountdownLabel ?? undefined : undefined}
          isDark={isDark}
          active={Boolean(donateActive && donateLink)}
        />
      )}
    </>
  );

  return (
    <>
      {showTopBanner && (
        <div
          className={`w-full border-b text-xs md:text-sm transition-colors duration-300 ${isDark
            ? 'border-[#27272A] bg-[#4C1D95] text-zinc-50'
            : 'border-violet-200 bg-gradient-to-r from-violet-100 via-violet-200 to-white text-violet-900'
            }`}
        >
          <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-2 md:flex-row">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{topBannerCtaLabelLocal}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-1 font-semibold">
                <span className="text-[9px]">✨</span>
                <span>{earlyAccessBadgeTextLocal}</span>
              </span>
              {earlyAccessRemainingDays !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-1">
                  <span className="uppercase tracking-wide">{earlyAccessCountdownLabelLocal}</span>
                  <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-mono">
                    {earlyAccessRemainingDays} {earlyAccessCountdownUnitLocal}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <header
        className={`sticky top-0 z-30 border-b border-transparent ${isDark ? 'bg-[#09090B]/95 backdrop-blur' : 'bg-white/90 backdrop-blur'
          }`}
      >
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-3 lg:px-10">
          {/* Logo Section */}
          <div className="flex items-center gap-3">
            <Link
              href="/golden-book"
              className="inline-flex items-center justify-center rounded-xl transition hover:-translate-y-0.5"
              title={headerLabels.homeAria}
              aria-label={headerLabels.homeAria}
            >
              <Image
                src={GoldenBookIcon}
                alt={headerLabels.homeAria}
                width={76}
                height={44}
                priority={false}
                className="h-11 w-auto object-contain"
              />
            </Link>
            <Link href="/" className="flex h-14 w-[180px] md:w-[220px] items-center gap-2" aria-label={headerLabels.homeAria}>
              <span className="inline-flex h-full w-full items-center">
                <Image
                  src={isDark ? '/assets/Thesara_Logo_dark.png' : '/assets/Thesara_Logo.png'}
                  alt="Thesara"
                  width={220}
                  height={56}
                  priority
                  sizes="(max-width: 1024px) 180px, 220px"
                  className="h-full w-full object-contain"
                />
              </span>
            </Link>
            <span className="hidden md:inline-flex items-center gap-2" title={headerLabels.liveIndicator} aria-label={headerLabels.liveIndicator}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gradient-to-br from-emerald-200 via-emerald-400 to-emerald-600 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              </span>
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex flex-1 flex-nowrap items-center justify-center gap-3 overflow-x-auto text-base font-medium min-w-max px-4">
            <NavLinks />
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-3">
              <LocaleSwitcher />
              <button
                onClick={toggleTheme}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm transition ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-200' : 'border-slate-200 bg-white text-slate-700'}`}
                aria-label={headerLabels.themeToggle}
              >
                {mounted && isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              </button>
            </div>
            <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
              <HeaderPrimaryButton label={heroSubmitLabel} href="/create" onClick={onSubmitClick} />
              <div className="flex-shrink-0">{profileSection ?? defaultProfileSection}</div>
            </div>
          </div>

          {/* Mobile Actions & Hamburger */}
          <div className="flex items-center gap-2 lg:hidden">
            {mobileProfileSection}
            <button
              className={`p-2 ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className={`absolute top-full left-0 w-full lg:hidden border-b shadow-xl ${isDark ? 'border-[#27272A] bg-[#09090B]' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-3">
                <NavLinks />
              </div>
              <div className="h-px w-full bg-gray-200 dark:bg-gray-800" />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <HeaderPrimaryButton label={heroSubmitLabel} href="/create" onClick={() => { onSubmitClick(); setIsMobileMenuOpen(false); }} />
                <div className="flex items-center gap-3">
                  <LocaleSwitcher />
                  <button
                    onClick={toggleTheme}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm transition ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-200' : 'border-slate-200 bg-white text-slate-700'}`}
                    aria-label={headerLabels.themeToggle}
                  >
                    {mounted && isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Decorative purple accent line used on beta */}
        <div className="mx-auto w-full max-w-[1600px] px-4 lg:px-10">
          <div className={`h-1 w-full rounded-b-full bg-gradient-to-r from-[#A855F7] via-[#8B5CF6] to-transparent`} />
        </div>
      </header>

      {/* Video Popup Modal */}
      {showVideoPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowVideoPopup(false)}>
          <div className="relative w-full max-w-4xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowVideoPopup(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition"
              aria-label={messages['BetaHome.video.close'] ?? 'Close video'}
            >
              <X className="h-8 w-8" />
            </button>
            <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg">
              <iframe
                className="absolute top-0 left-0 w-full h-full"
                src={shortVideoUrl.replace('youtube.com/shorts/', 'youtube.com/embed/')}
                title={shortVideoLabel || (messages['Nav.shortVideo'] as string) || 'Short video'}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
