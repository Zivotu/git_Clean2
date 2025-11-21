"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import ProfileCard from '@/components/ProfileCard';
import { useAuth, getDisplayName } from '@/lib/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  Video,
  Crown,
  HelpCircle,
  SunMedium,
  MoonStar,
  Upload,
  Heart,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';

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
  faqLabel?: string;
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
  faqLabel = 'FAQ',
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
  const topBannerCtaLabelLocal = (messages && messages['Nav.subscribeEarlyAccess']) ?? topBannerCtaLabel;
  const topBannerSubtitleLocal = (messages && messages['Nav.earlyAccessSubtitle']) ?? topBannerSubtitle;
  const earlyAccessRibbonLabelLocal = (messages && messages['Nav.earlyAccessRibbon']) ?? earlyAccessRibbonLabel;
  const earlyAccessBadgeTextLocal = (messages && messages['Nav.earlyAccessBadge']) ?? earlyAccessBadgeText;
  const earlyAccessCountdownLabelLocal = (messages && messages['Nav.earlyAccessCountdownLabel']) ?? earlyAccessCountdownLabel;
  const earlyAccessCountdownUnitLocal = (messages && messages['Nav.earlyAccessCountdownUnit']) ?? earlyAccessCountdownUnit;
  // If a page didn't pass a profileSection, build a default one using auth
  const authCtx = useAuth?.();
  const user = authCtx?.user ?? null;
  const defaultProfileSection = (
    <ProfileCard
      user={user}
      displayName={getDisplayName(user) || 'Guest'}
      photo={(user as any)?.photoURL ?? null}
      isDark={isDark}
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
              <button
                type="button"
                onClick={onSubscribe}
                disabled={subscribeStatus === 'loading'}
                className="rounded-full bg-black/20 px-2 py-1 font-semibold uppercase tracking-wide transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {topBannerCtaLabelLocal}
              </button>
              <span className="hidden items-center gap-1 md:inline-flex">
                <span className="font-semibold">{earlyAccessRibbonLabelLocal}</span>
                <span className="opacity-80">— {topBannerSubtitleLocal}</span>
              </span>
              {subscribeMessage && (
                <span className="text-[10px] font-normal text-emerald-200 sm:text-xs">{subscribeMessage}</span>
              )}
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
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pt-5 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex flex-1 items-center gap-3">
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
            <Link href="/" className="flex h-14 w-[220px] items-center gap-2" aria-label={headerLabels.homeAria}>
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
            <span className="inline-flex items-center gap-2" title={headerLabels.liveIndicator} aria-label={headerLabels.liveIndicator}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gradient-to-br from-emerald-200 via-emerald-400 to-emerald-600 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              </span>
            </span>
          </div>

          <nav className="flex flex-1 flex-nowrap items-center gap-3 overflow-x-auto text-base font-medium min-w-max">
            <HeaderChip icon={Video} label={shortVideoLabel} isDark={isDark} href={shortVideoUrl} external />
            <HeaderChip icon={Crown} label={goProLabel} isDark={isDark} subtle href="/pro" />
            <HeaderChip icon={HelpCircle} label={faqLabel} isDark={isDark} subtle href="/faq" />
            {donateEnabled && (
              <HeaderDonationButton
                label={donateLabel}
                href={donateActive && donateLink ? donateLink : undefined}
                countdown={donateActive ? donateCountdownLabel ?? undefined : undefined}
                isDark={isDark}
                active={Boolean(donateActive && donateLink)}
              />
            )}
          </nav>

          <div className="flex flex-1 items-center gap-3">
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
        </div>

        {/* Decorative purple accent line used on beta */}
        <div className="mx-auto w-full max-w-[1600px] px-4 lg:px-10">
          <div className={`h-1 w-full rounded-b-full bg-gradient-to-r from-[#A855F7] via-[#8B5CF6] to-transparent`} />
        </div>
      </header>
    </>
  );
}
