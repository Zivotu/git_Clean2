'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  SunMedium,
  MoonStar,
  Play,
  ArrowRight,
  Gamepad2,
  LayoutDashboard,
  User,
  Rocket,
  AppWindow,
  Wand2,
  Sparkles,
  FolderKanban,
  Users,
  Video,
  Upload,
  Crown,
  HelpCircle,
  Heart,
  Cat,
  DollarSign,
  Bell,
  LayoutGrid,
  Rows,
  ChevronDown,
  Minus,
  Plus,
  RefreshCcw,
  X,
} from 'lucide-react';
import type { Listing as ApiListing } from '@/lib/types';
import { resolvePreviewUrl } from '@/lib/preview';
import { sendToLogin } from '@/lib/loginRedirect';
import { playHref, appDetailsHref } from '@/lib/urls';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import Logo from '@/components/Logo';
import { useI18n } from '@/lib/i18n-provider';
import { useAuth } from '@/lib/auth';
import { apiPost } from '@/lib/api';
import { useEarlyAccessCampaign } from '@/hooks/useEarlyAccessCampaign';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import { PUBLIC_API_URL, GOLDEN_BOOK, isGoldenBookCampaignActive, getGoldenBookCountdown } from '@/lib/config';
import GoldenBookIcon from '../../../../assets/GoldenBook_Icon_1.png';
import { triggerConfetti } from '@/components/Confetti';
import Avatar from '@/components/Avatar';
import PartnershipModal from '@/components/PartnershipModal';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { BetaAppCard, type BetaApp, type ListingLabels } from '@/components/BetaAppCard';
import { useTheme } from '@/components/ThemeProvider';
import { getTagFallbackLabel, normalizeTags } from '@/lib/tags';



const gradientPalette = [
  'from-purple-700 via-fuchsia-600 to-indigo-700',
  'from-pink-500 via-fuchsia-500 to-indigo-500',
  'from-sky-500 via-cyan-500 to-emerald-500',
  'from-amber-500 via-orange-500 to-rose-500',
  'from-slate-800 via-slate-700 to-slate-900',
  'from-emerald-500 via-teal-500 to-cyan-600',
  'from-indigo-500 via-violet-500 to-purple-600',
  'from-rose-500 via-pink-500 to-orange-500',
  'from-blue-500 via-sky-500 to-cyan-400',
  'from-lime-500 via-emerald-500 to-teal-500',
];


const shortVideoUrl = 'https://youtube.com/shorts/m_4RqaGClFI';
const promoBanners = [
  {
    href: '/jednostavne-upute',
    titleKey: 'promo.banners.0.title',
    subtitleKey: 'promo.banners.0.subtitle',
    titleFallback: 'Jednostavne upute',
    subtitleFallback: 'Kako iz razgovora s AI-jem doći do objave na Thesari.',
    image: '/assets/CTA_Part_1.jpg',
  },
  {
    href: '/docs/thesara_terms.html',
    titleKey: 'promo.banners.1.title',
    subtitleKey: 'promo.banners.1.subtitle',
    titleFallback: 'Pravila objave',
    subtitleFallback: 'Sve o monetizaciji, licencama i uvjetima.',
    image: '/assets/CTA_Part_2.jpg',
  },
] as const;

const columnLayouts: Record<number, string> = {
  2: 'grid grid-cols-1 gap-8 sm:grid-cols-2',
  3: 'grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  6: 'grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
};
const MIN_GRID_COLUMNS = 2;
const MAX_GRID_COLUMNS = 6;
const DEFAULT_GRID_COLUMNS = 3;
const TRENDING_SLIDE_SIZE = 3;
const FILTER_ALL = 'all';
const FILTER_TRENDING = 'trending';
const DAY_MS = 24 * 60 * 60 * 1000;
const SYNC_QUERY_KEYS = ['q', 'sort', 'view', 'filter', 'tag', 'cols'] as const;
const GRID_COLUMNS_STORAGE_KEY = 'betaHome.gridColumns';
const VIEW_MODE_STORAGE_KEY = 'betaHome.viewMode';

function formatMetric(count?: number | null, newLabel = 'New') {
  if (!count || count <= 0) return newLabel;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}m`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

function pickCategory(tags: string[] | null, translator: (key: string, fallback: string) => string, fallback: string) {
  if (!tags?.length) return fallback;
  const tag = tags[0];
  const fallbackLabel = getTagFallbackLabel(tag);
  return translator(`tags.${tag}`, fallbackLabel)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatMessage(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(String(value)),
    template,
  );
}

function makeInitials(name: string) {
  if (!name) return '??';
  return name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function mapListings(
  items: ApiListing[],
  options: {
    defaultDescription: string;
    fallbackCategory: string;
    metricNewLabel: string;
    unknownAuthor: string;
    translator: (key: string, fallback: string) => string;
  },
): BetaApp[] {
  const sortedByLikes = [...items].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  const trendingIds = new Set(sortedByLikes.slice(0, 6).map((listing) => listing.id));

  return items.map((item, index) => {
    const authorName = item.author?.name || item.author?.handle || options.unknownAuthor;
    const rawTags = Array.isArray(item.tags)
      ? item.tags
        .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
        .filter((tag) => Boolean(tag))
      : [];

    // Normalize tags
    const tags = normalizeTags(rawTags);
    const createdAt =
      typeof item.createdAt === 'number'
        ? item.createdAt
        : item.createdAt
          ? new Date(item.createdAt).getTime()
          : Date.now();
    return {
      id: item.id,
      slug: item.slug,
      name: item.title,
      description: item.description || options.defaultDescription,
      category: pickCategory(tags, options.translator, options.fallbackCategory),
      authorName,
      authorInitials: makeInitials(authorName),
      authorPhoto: item.author?.photo || null,
      authorId: item.author?.uid, // Pass authorId for fresh data fetching
      authorHandle: item.author?.handle || undefined, // Added this line
      playsCount: item.playsCount || 0,
      likesCount: item.likesCount || 0,
      usersLabel: formatMetric(item.playsCount, options.metricNewLabel),
      likesLabel: formatMetric(item.likesCount, options.metricNewLabel),
      price: typeof item.price === 'number' ? item.price : null,
      tag: trendingIds.has(item.id) ? 'trending' : undefined,
      previewUrl: resolvePreviewUrl(item.previewUrl),
      gradientClass: gradientPalette[index % gradientPalette.length],
      tags,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      likedByMe: (item as any).likedByMe,
    };
  });
}

type BetaHomeClientProps = {
  initialItems?: ApiListing[];
};

export default function BetaHomeClient({ initialItems = [] }: BetaHomeClientProps) {
  const { messages, locale } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSafeSearchParams();
  const { data: earlyAccessCampaign } = useEarlyAccessCampaign();
  const { data: entitlements } = useEntitlements();

  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [subscribeMessage, setSubscribeMessage] = useState<string | null>(null);
  const [randomIndex, setRandomIndex] = useState<number | null>(null);
  const [rawListings, setRawListings] = useState<ApiListing[]>(initialItems);
  const [isLoadingListings, setIsLoadingListings] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorDetails, setLoadErrorDetails] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<BetaApp | null>(null);
  const [showPartnership, setShowPartnership] = useState(false);
  const [showEarlyAccessPopup, setShowEarlyAccessPopup] = useState(false);
  const [communityStats, setCommunityStats] = useState<{ publishedApps: number; membersCount: number }>({
    publishedApps: initialItems.length,
    membersCount: 0,
  });
  const popupStorageKey = useMemo(
    () => (earlyAccessCampaign?.id ? `eaPopupSeen:${earlyAccessCampaign.id}` : null),
    [earlyAccessCampaign?.id],
  );
  const tHome = (key: string) => messages[`Home.${key}`] || '';
  const tNav = (key: string) => messages[`Nav.${key}`] || key;
  const tFooter = (key: string) => messages[`Footer.${key}`] || key;
  const tBeta = (key: string, fallback = '', params?: Record<string, string | number>) =>
    formatMessage((messages[`BetaHome.${key}`] as string) ?? fallback, params);

  const defaultDescription = tBeta(
    'listing.defaultDescription',
    'Mini aplikacija iz Thesara zajednice.',
  );
  const fallbackCategory = tBeta('categories.fallback', 'Apps');
  const metricNewLabel = tBeta('format.metricNew', 'New');
  const unknownAuthor = tBeta('listing.unknownAuthor', 'Anon');
  const mappingOptions = useMemo(
    () => ({
      defaultDescription,
      fallbackCategory,
      metricNewLabel,
      unknownAuthor,
      translator: (key: string, fallback: string) => tBeta(key, fallback),
    }),
    [defaultDescription, fallbackCategory, metricNewLabel, unknownAuthor, tBeta],
  );
  const apps = useMemo(() => mapListings(rawListings, mappingOptions), [rawListings, mappingOptions]);
  useEffect(() => {
    setRawListings(initialItems);
    setCommunityStats((prev) => ({
      ...prev,
      publishedApps: initialItems.length || prev.publishedApps,
    }));
  }, [initialItems]);
  // Theme is driven globally by Header. Initialize from localStorage and listen for changes.
  const { isDark } = useTheme();
  const [activeFilter, setActiveFilter] = useState<string>(FILTER_ALL);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [cardsPerRow, setCardsPerRow] = useState(DEFAULT_GRID_COLUMNS);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'new' | 'popular' | 'title'>('new');
  const [initialQuerySynced, setInitialQuerySynced] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);



  const filters = useMemo(() => {
    const categories = Array.from(new Set(apps.map((app) => app.category))).slice(0, 5);
    return [FILTER_ALL, FILTER_TRENDING, ...categories];
  }, [apps]);

  // Predefined tag keys (will be localized via i18n)
  const PREDEFINED_TAG_KEYS = [
    'tags.games',
    'tags.quiz',
    'tags.learning',
    'tags.tools',
    'tags.business',
    'tags.entertainment',
    'tags.other',
  ];

  const _predefinedTagKeysHash = PREDEFINED_TAG_KEYS.join('|');
  const visibleTags = useMemo(() =>
    PREDEFINED_TAG_KEYS.map((key) => {
      const canonicalKey = key.split('.').pop() || key;
      return { key: canonicalKey, label: tBeta(key, canonicalKey), count: 0 };
    }),
    // include locale/messages, tBeta and PREDEFINED_TAG_KEYS so labels recompute on locale change
    [locale, messages, _predefinedTagKeysHash, tBeta, PREDEFINED_TAG_KEYS],
  );
  const hiddenTagCount = 0;

  const trendingApps = useMemo(() => {
    const tagged = apps.filter((app) => app.tag === 'trending');
    if (tagged.length >= 4) return tagged;
    return [...tagged, ...apps.filter((app) => !app.tag)].slice(0, 4);
  }, [apps]);
  const trendingSlides = useMemo(() => {
    if (!trendingApps.length) return [];
    return chunkArray(trendingApps, TRENDING_SLIDE_SIZE);
  }, [trendingApps]);
  const [trendingIndex, setTrendingIndex] = useState(0);
  useEffect(() => {
    if (trendingSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setTrendingIndex((prev) => (prev + 1) % trendingSlides.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [trendingSlides.length]);

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = apps.filter((app) => {
      if (activeFilter === FILTER_TRENDING && app.tag !== 'trending') return false;
      if (activeFilter !== FILTER_ALL && activeFilter !== FILTER_TRENDING && app.category !== activeFilter)
        return false;
      if (selectedTags.length && !selectedTags.every((tag) => app.tags.includes(tag))) return false;
      return true;
    });

    if (q) {
      return next
        .map((app) => ({ app, score: calculateSearchScore(app, q) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ app }) => app);
    }

    const sorted = [...next];
    if (sortBy === 'new') {
      sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortBy === 'popular') {
      sorted.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [apps, activeFilter, search, selectedTags, sortBy]);

  const filterLabelMap: Record<string, string> = {
    [FILTER_ALL]: tBeta('filters.all', 'All'),
    [FILTER_TRENDING]: tBeta('filters.trending', 'Trending'),
  };
  const listingLabels: ListingLabels = {
    free: tBeta('listing.badge.free', 'FREE'),
    creator: tBeta('listing.label.creator', 'Creator'),
    play: tBeta('listing.actions.play', 'Play'),
    details: tBeta('listing.actions.fullDetails', 'Full details'),
    trending: tBeta('listing.tag.trending', 'Trending'),
  };

  const searchPlaceholder = tBeta(
    'search.placeholder',
    'Search apps, creators, or prompts...',
  );
  const heroBadgeText = tBeta(
    'hero.badge',
    'Discover Amazing Mini-Apps & Games',
  );
  const randomPickLabel = tBeta('hero.random.label', 'Random Pick');
  const randomPickDetailsLabel = tBeta('hero.random.details', 'View details');
  const heroSubmitLabel = tBeta('hero.actions.submit', 'Submit App');
  const curatedLabel = tBeta('hero.badges.curated', 'Curated');
  const featuredLabel = tBeta('promo.featuredLabel', 'Featured');
  const learnMoreLabel = tBeta('promo.learnMore', 'Learn more');
  const gridLabel = tBeta('view.gridLabel', 'Grid');
  const gridDecreaseAria = tBeta('view.decreaseGrid', 'Show fewer cards per row');
  const gridIncreaseAria = tBeta('view.increaseGrid', 'Show more cards per row');
  const sortLabels: Record<'new' | 'popular' | 'title', string> = {
    new: tBeta('sort.newest', 'Newest'),
    popular: tBeta('sort.popular', 'Most loved'),
    title: tBeta('sort.alpha', 'Alphabetical'),
  };
  const sortSelectLabel = tBeta('sort.label', 'Sort by');
  const liveUsageLabel = tBeta('metrics.liveUsage', 'Live usage');
  const noResultsText = tBeta(
    'empty.noResults',
    'Nema rezultata za taj upit. Pokušaj promijeniti filtere.',
  );
  const hasActiveFilters = selectedTags.length > 0 || search.trim().length > 0 || activeFilter !== FILTER_ALL;
  const noResultsSecondary = hasActiveFilters
    ? tHome('tryAdjust') || tBeta('empty.tryAdjust', 'Pokušaj promijeniti tagove ili pretragu.')
    : tHome('beFirst') || tBeta('empty.beFirst', 'Budi prvi koji će objaviti mini aplikaciju.');
  const noResultsCtaLabel = user
    ? heroSubmitLabel
    : tNav('login') || tHome('signIn') || 'Prijavi se';
  const noResultsCtaHref = user ? '/create' : '/login';
  const tagsHeading = tBeta('filters.tagsHeading', 'Popular tags');
  const clearFiltersLabel = tBeta('filters.clear', 'Reset filters');
  const refreshLabel = tBeta('actions.refresh', 'Refresh');
  const retryLabel = tBeta('actions.retry', 'Try again');
  const listingsErrorLabel = tBeta('errors.listings', 'Unable to refresh the feed. Please try again.');
  const trendingCountLabel = tBeta('sections.trending.count', '{count} apps', {
    count: trendingApps.length,
  });
  const donateLabel = tNav('donate');
  const donateLink = GOLDEN_BOOK.paymentLink;
  const donateEnabled = GOLDEN_BOOK.enabled && Boolean(donateLink);
  const donateActive = donateEnabled && isGoldenBookCampaignActive();
  const donateCountdown = getGoldenBookCountdown();
  const donateCountdownLabel =
    donateActive && donateCountdown && donateCountdown.daysRemaining > 0
      ? (messages['Nav.donateCountdown'] || '{days} days left').replace(
        '{days}',
        String(donateCountdown.daysRemaining),
      )
      : null;
  const handleSubmitClick = useCallback(() => {
    triggerConfetti();
  }, []);
  useEffect(() => {
    const qParam = searchParams.get('q') ?? '';
    setSearch((prev) => (prev === qParam ? prev : qParam));

    const sortParam = searchParams.get('sort');
    if (sortParam === 'new' || sortParam === 'popular' || sortParam === 'title') {
      setSortBy((prev) => (prev === sortParam ? prev : sortParam));
    } else {
      setSortBy((prev) => (prev === 'new' ? prev : 'new'));
    }

    const storedView = !initialQuerySynced ? readStoredViewMode() : null;
    const viewParam = searchParams.get('view');
    const viewFromQuery = viewParam === 'list' ? 'list' : viewParam === 'grid' ? 'grid' : null;
    const resolvedView = viewFromQuery ?? (!initialQuerySynced ? storedView : null);
    if (resolvedView) {
      setView((prev) => (prev === resolvedView ? prev : resolvedView));
    }

    const tagsFromParams = searchParams
      .getAll('tag')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const uniqueTags = Array.from(new Set(tagsFromParams));
    setSelectedTags((prev) => (arraysEqual(prev, uniqueTags) ? prev : uniqueTags));

    if (!initialQuerySynced) {
      setInitialQuerySynced(true);
    }
  }, [searchParams, initialQuerySynced]);

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const validFilter =
      filterParam && filters.includes(filterParam) ? filterParam : FILTER_ALL;
    setActiveFilter((prev) => (prev === validFilter ? prev : validFilter));
  }, [searchParams, filters]);

  useEffect(() => {
    const storedColumns = !initialQuerySynced ? readStoredGridColumns() : null;
    const colsParam = searchParams.get('cols');
    let resolvedColumns: number | null = null;
    if (colsParam) {
      const parsed = Number.parseInt(colsParam, 10);
      if (Number.isFinite(parsed)) {
        resolvedColumns = clampGridColumns(parsed);
      }
    } else if (!initialQuerySynced && storedColumns !== null) {
      resolvedColumns = clampGridColumns(storedColumns);
    }
    if (resolvedColumns !== null) {
      setCardsPerRow((prev) => (prev === resolvedColumns ? prev : resolvedColumns));
    }
  }, [searchParams, initialQuerySynced]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, view);
  }, [view]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(GRID_COLUMNS_STORAGE_KEY, String(cardsPerRow));
  }, [cardsPerRow]);
  useEffect(() => {
    if (!apps.length) {
      setRandomIndex(null);
      return;
    }
    setRandomIndex(Math.floor(Math.random() * apps.length));
  }, [apps]);
  useEffect(() => {
    if (!initialQuerySynced || !pathname) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    SYNC_QUERY_KEYS.forEach((key) => nextParams.delete(key));
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      nextParams.set('q', trimmedSearch);
    }
    selectedTags.forEach((tag) => nextParams.append('tag', tag));
    if (sortBy !== 'new') {
      nextParams.set('sort', sortBy);
    }
    if (view !== 'grid') {
      nextParams.set('view', view);
    }
    if (cardsPerRow !== DEFAULT_GRID_COLUMNS) {
      nextParams.set('cols', String(cardsPerRow));
    }
    if (activeFilter !== FILTER_ALL) {
      nextParams.set('filter', activeFilter);
    }
    const nextString = nextParams.toString();
    const currentString = searchParams.toString();
    if (nextString === currentString) return;
    router.replace(`${pathname}${nextString ? `?${nextString}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialQuerySynced,
    pathname,
    search,
    selectedTags,
    sortBy,
    view,
    cardsPerRow,
    activeFilter,
    // NOTE: searchParams intentionally excluded to prevent infinite loop
  ]);
  const randomApp = randomIndex !== null ? apps[randomIndex] : null;
  const profileDisplayName =
    user?.displayName || user?.email?.split('@')[0] || tNav('myProfile') || 'Guest';
  const profilePhoto = (user as any)?.photoURL ?? null;
  const loginLabel = tNav('login');
  const logoutLabel = tNav('logout') || 'Log out';
  const handleLogout = useCallback(() => {
    if (auth) {
      signOut(auth).catch(() => { });
    }
  }, []);
  const profileSection = null; // Removed ProfileCard - not needed with GlobalShell

  const isGridView = view === 'grid';
  const canDecreaseColumns = cardsPerRow > MIN_GRID_COLUMNS;
  const canIncreaseColumns = cardsPerRow < MAX_GRID_COLUMNS;
  const gridSectionClass = isGridView ? columnLayouts[cardsPerRow] ?? columnLayouts[4] : 'space-y-6';
  const earlyAccessRemainingDays = useMemo(() => {
    if (!earlyAccessCampaign?.isActive) return null;
    const duration = earlyAccessCampaign.durationDays ?? earlyAccessCampaign.perUserDurationDays;
    if (!duration || duration <= 0) return null;
    const start =
      typeof earlyAccessCampaign.startsAt === 'number' && earlyAccessCampaign.startsAt > 0
        ? earlyAccessCampaign.startsAt
        : Date.now();
    const end = start + duration * DAY_MS;
    const remaining = end - Date.now();
    return remaining > 0 ? Math.max(0, Math.ceil(remaining / DAY_MS)) : 0;
  }, [
    earlyAccessCampaign?.durationDays,
    earlyAccessCampaign?.perUserDurationDays,
    earlyAccessCampaign?.isActive,
    earlyAccessCampaign?.startsAt,
  ]);
  const showTopBanner = Boolean(earlyAccessCampaign?.isActive);
  const topBannerCtaLabel = messages['Nav.subscribeEarlyAccess'] ?? 'Subscribe for early access';
  const topBannerSubtitle = messages['Nav.earlyAccessSubtitle'] ?? 'Turn AI chats into mini apps.';
  const earlyAccessRibbonLabel = messages['Nav.earlyAccessRibbon'] ?? 'EARLY ACCESS';
  const earlyAccessBadgeText =
    messages['Nav.earlyAccessBadge'] ?? '30 dana potpuno besplatnih usluga!';
  const earlyAccessCountdownLabel = messages['Nav.earlyAccessCountdownLabel'] ?? 'Countdown';
  const earlyAccessCountdownUnit = messages['Nav.earlyAccessCountdownUnit'] ?? 'days';
  const earlyAccessSubscribedMessage =
    messages['Nav.earlyAccessSubscribed'] ?? "You'll get 50% off the first month.";
  const earlyAccessSubscribeError =
    messages['Nav.earlyAccessSubscribeError'] ?? 'Subscription failed.';
  const popupTitle = messages['Home.earlyAccessTitle'] ?? 'Early Access is live!';
  const popupBody =
    messages['Home.earlyAccessBody'] ??
    'Gold + NoAds are active for you during the campaign. Publish an app to make the most of it.';
  const popupPublishLabel = messages['Home.earlyAccessPublish'] ?? 'Publish an app';
  const popupSignInLabel = messages['Home.earlyAccessSignIn'] ?? 'Sign in now';
  const popupDismiss = messages['Home.earlyAccessDismiss'] ?? 'Close';
  const popupPrimaryLabel = user ? popupPublishLabel : popupSignInLabel;
  const popupPrimaryHref = user ? '/create' : '/login';

  const changeGridColumns = (delta: number) => {
    setCardsPerRow((current) => {
      const next = Math.max(MIN_GRID_COLUMNS, Math.min(MAX_GRID_COLUMNS, current + delta));
      return next;
    });
  };
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    setActiveFilter(FILTER_ALL);
  }, []);
  const clearFilters = useCallback(() => {
    setSelectedTags([]);
    setSearch('');
    setSortBy('new');
    setActiveFilter(FILTER_ALL);
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape' && hasActiveFilters) {
        clearFilters();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [clearFilters, hasActiveFilters]);
  const reloadListings = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setIsLoadingListings(true);
        setLoadError(null);
        setLoadErrorDetails(null);
      }
      try {
        const { getListings } = await import('@/lib/loaders');
        const { items: normalized } = await getListings({ locale });
        setRawListings(normalized);
      } catch (err) {
        console.error(err);
        if (!silent) {
          setLoadError(listingsErrorLabel);
          setLoadErrorDetails(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!silent) {
          setIsLoadingListings(false);
        }
      }
    },
    [listingsErrorLabel, locale],
  );
  const handleRefreshClick = useCallback(() => {
    if (isLoadingListings) return;
    reloadListings({});
  }, [isLoadingListings, reloadListings]);
  const handleCardDetails = useCallback((app: BetaApp) => {
    setSelectedApp(app);
  }, []);
  const closeDetails = useCallback(() => setSelectedApp(null), []);
  const handleSubscribe = useCallback(async () => {
    if (!user) {
      sendToLogin(router);
      return;
    }
    setSubscribeStatus('loading');
    setSubscribeMessage(null);
    try {
      await apiPost('/me/early-access/subscribe');
      setSubscribeStatus('success');
      setSubscribeMessage(earlyAccessSubscribedMessage);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : earlyAccessSubscribeError;
      setSubscribeStatus('error');
      setSubscribeMessage(message);
    }
  }, [user, router, earlyAccessSubscribedMessage, earlyAccessSubscribeError]);
  useEffect(() => {
    reloadListings({ silent: true });
  }, [reloadListings]);
  useEffect(() => {
    if (typeof window === 'undefined' || !PUBLIC_API_URL) return;
    let cancelled = false;
    const controller = new AbortController();
    const statsUrl = `${PUBLIC_API_URL}/community/stats`;

    const loadStats = async () => {
      try {
        const response = await fetch(statsUrl, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || cancelled) return;
        const data = await response.json();
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
    const interval = window.setInterval(loadStats, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);
  const dismissEarlyAccessPopup = useCallback(() => {
    if (typeof window !== 'undefined' && popupStorageKey) {
      try {
        window.localStorage.setItem(popupStorageKey, String(Date.now()));
      } catch {
        /* ignore storage write errors */
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
      /* ignore storage read errors */
    }
    setShowEarlyAccessPopup(true);
  }, [earlyAccessCampaign?.isActive, popupStorageKey]);

  const heroAppsLine = trendingApps.slice(0, 3).map((app) => app.name).join(' · ');
  const totalLikes = useMemo(() => apps.reduce((sum, app) => sum + app.likesCount, 0), [apps]);
  const totalPlays = useMemo(() => apps.reduce((sum, app) => sum + app.playsCount, 0), [apps]);
  const activeCreatorsCount = useMemo(() => new Set(apps.map((app) => app.authorName)).size, [apps]);
  const liveAppsCount = communityStats.publishedApps || apps.length || 0;
  const communityMembersCount = communityStats.membersCount || activeCreatorsCount || 0;
  const heroMetrics = [
    {
      id: 'apps',
      value: formatMetric(liveAppsCount, metricNewLabel),
      label: tBeta('metrics.apps', 'Objavljene aplikacije'),
    },
    {
      id: 'members',
      value: formatMetric(communityMembersCount, metricNewLabel),
      label: tBeta('metrics.members', 'Članova zajednice'),
    },
    {
      id: 'runs',
      value: formatMetric(totalPlays, metricNewLabel),
      label: tBeta('metrics.runs', 'Ukupno pokretanja'),
    },
  ];
  const heroCardDescription = tBeta(
    'hero.card.description',
    'Build collections of AI-powered experiences and share them with a link.',
  );
  const heroCardAppsStat = tBeta('hero.card.stats.apps', '{count}+ Mini-Apps', { count: liveAppsCount });
  const heroCardFavoritesStat = tBeta('hero.card.stats.favorites', '{count} favorites', {
    count: formatMetric(totalLikes, metricNewLabel),
  });
  const searchStatsText = tBeta('search.liveStats', '{apps} live apps · {plays} plays', {
    apps: liveAppsCount,
    plays: formatMetric(totalPlays, metricNewLabel),
  });

  return (

    <>
      {/* MAIN CONTENT */}
      <main className="flex-1 space-y-4 lg:min-w-0">
        <div
          className={`sticky top-24 z-10 mb-2 rounded-2xl border backdrop-blur-sm transition-colors duration-300 ${isDark ? 'border-[#27272A] bg-[#09090B]/80' : 'border-slate-200 bg-white/90 shadow-sm'
            }`}
        >
          <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div
                className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${isDark
                  ? 'border-[#27272A] bg-[#18181B] text-zinc-400 focus-within:border-[#A855F7] focus-within:text-zinc-200'
                  : 'border-slate-200 bg-slate-50 text-slate-500 focus-within:border-slate-400 focus-within:bg-white'
                  }`}
              >
                <Search className="h-4 w-4 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={`h-6 w-full bg-transparent text-xs outline-none ${isDark ? 'placeholder:text-zinc-500' : 'placeholder:text-slate-400'
                    }`}
                  placeholder={searchPlaceholder}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium ${isDark
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-600/40'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  }`}
              >
                <span className="text-[10px]">🟢</span>
                <span>{searchStatsText}</span>
              </span>
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isLoadingListings}
                className={`hidden md:inline-flex items-center gap-1 rounded-full border px-2 py-1 font-semibold transition ${isDark ? 'border-[#27272A] text-zinc-300 hover:bg-black/20' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  } ${isLoadingListings ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <RefreshCcw className={`h-3 w-3 ${isLoadingListings ? 'animate-spin' : ''}`} />
                <span>{refreshLabel}</span>
              </button>
              <div className="inline-flex items-center gap-2 md:hidden">
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        </div>

        {loadError && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-red-900/50 bg-red-900/20 text-rose-100' : 'border-red-200 bg-red-50 text-red-900'
              }`}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">{loadError}</p>
                {loadErrorDetails && (
                  <p className="text-xs opacity-80">{loadErrorDetails}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isLoadingListings}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${isDark ? 'border-zinc-500 text-zinc-100 hover:bg-white/5' : 'border-red-300 text-red-900 hover:bg-white'
                  } ${isLoadingListings ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <RefreshCcw className={`h-3 w-3 ${isLoadingListings ? 'animate-spin' : ''}`} />
                <span>{retryLabel}</span>
              </button>
            </div>
          </div>
        )}

        <section
          className={`overflow-hidden rounded-3xl border transition-colors duration-300 ${isDark
            ? 'border-[#27272A] bg-gradient-to-br from-[#020617] via-[#18181B] to-[#4C1D95]'
            : 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-violet-100'
            }`}
        >
          <div className="flex flex-col gap-8 px-6 py-6 lg:flex-row lg:items-start lg:justify-between lg:py-8">
            <div className="flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/10 px-2 py-1 text-xs font-medium text-zinc-200 backdrop-blur">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#A855F7]/80 text-[9px]">
                  <Rocket className="h-3 w-3" />
                </span>
                <span className="uppercase tracking-wide">{heroBadgeText}</span>
              </div>
              <h1 className={`text-3xl font-semibold leading-tight md:text-4xl ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {tHome('headline.one')}{' '}
                <span className="text-emerald-400">{tHome('headline.two')}</span>
              </h1>
              <p className={`mt-3 max-w-2xl text-base ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                {tHome('tagline') || 'Curirani marketplace s tisućama mini aplikacija, igara i utilsa.'}
              </p>
              {/* Promotion Warning Banner */}
              <div className={`mt-4 rounded-xl border px-4 py-3 ${isDark ? 'border-amber-900/50 bg-amber-900/20 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                <div className="flex items-start gap-3">
                  <Bell className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm leading-relaxed">
                    {tHome('promotionWarning') || 'To qualify for the three months if you are among the first 100 users, you must publish one application within 15 days of registration, otherwise you lose that right and we will give that spot to someone else.'}
                  </p>
                </div>
              </div>
              <div className="mt-5 h-1 w-16 rounded-full bg-emerald-500/60" />
            </div>

            <div className="flex flex-col gap-4 lg:ml-12 lg:w-[420px] lg:self-stretch">
              <div className="relative h-48 w-full">
                <div className="absolute inset-0 rounded-[1.75rem] bg-gradient-to-br from-[#A855F7]/40 via-[#22C55E]/30 to-transparent blur-2xl" aria-hidden="true" />
                <div
                  className={`relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border p-3 text-sm shadow-lg transition-colors duration-300 ${isDark ? 'border-[#27272A] bg-[#020617]/90' : 'border-slate-200 bg-white'
                    }`}
                >
                  {randomApp ? (
                    <div className="flex h-full gap-3">
                      <div className="flex flex-1 flex-col justify-between gap-3">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">{randomPickLabel}</p>
                            <span className="text-xs text-slate-500 dark:text-zinc-500">{randomApp.category}</span>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>{curatedLabel}</span>
                        </div>
                        <div>
                          <h3 className={`text-base font-semibold ${isDark ? 'text-zinc-50' : 'text-slate-900'}`}>{randomApp.name}</h3>
                          <p className={`mt-1 line-clamp-2 text-xs ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>{randomApp.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Link
                            prefetch={false}
                            href={playHref(randomApp.id, { run: 1 })}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 font-semibold text-black shadow-sm"
                          >
                            <Play className="h-3 w-3" />
                            <span>{listingLabels.play}</span>
                          </Link>
                          <Link
                            prefetch={false}
                            href={appDetailsHref(randomApp.slug)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${isDark ? 'border-[#27272A] text-zinc-100' : 'border-slate-200 text-slate-700'
                              }`}
                          >
                            {randomPickDetailsLabel}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                      <div className="relative h-full w-32 overflow-hidden rounded-2xl">
                        {randomApp.previewUrl ? (
                          <Image
                            src={randomApp.previewUrl}
                            alt={randomApp.name}
                            fill
                            className="object-cover"
                            sizes="128px"
                            unoptimized
                          />
                        ) : (
                          <div className={`h-full w-full bg-gradient-to-br ${randomApp.gradientClass}`} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#A855F7] to-[#22C55E] text-[11px] font-bold text-white">
                            ✦
                          </span>
                          <div>
                            <p className="text-sm font-semibold">{tHome('trending') || 'Trending now'}</p>
                            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{heroAppsLine}</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>{curatedLabel}</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <p className={isDark ? 'text-zinc-300' : 'text-slate-600'}>
                          {heroCardDescription}
                        </p>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${isDark ? 'bg-[#18181B] text-zinc-300' : 'bg-slate-100 text-slate-700'}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {heroCardAppsStat}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${isDark ? 'bg-[#18181B] text-zinc-300' : 'bg-slate-100 text-slate-700'}`}>
                            <User className="h-3 w-3" />
                            {heroCardFavoritesStat}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>



        <div className="space-y-4">
          <section className="mt-2 flex items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-1 overflow-x-auto pb-1 text-sm">
              {filters.map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 transition-all duration-300 ${isActive
                      ? isDark
                        ? 'border-[#A855F7] bg-[#A855F7]/20 text-zinc-50 shadow-sm'
                        : 'border-[#A855F7] bg-[#A855F7]/10 text-slate-900 shadow-sm'
                      : isDark
                        ? 'border-[#27272A] bg-[#18181B] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800'
                      }`}
                  >
                    {filterLabelMap[filter] ?? filter}
                  </button>
                );
              })}
            </div>
            <div className="hidden items-center gap-2 text-sm md:flex">
              <div className="flex items-center gap-1">
                {heroMetrics.map((metric) => (
                  <span
                    key={metric.id}
                    title={metric.label}
                    aria-label={metric.label}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-200' : 'border-slate-200 bg-white text-slate-700'
                      }`}
                  >
                    <Cat className="h-3 w-3 text-emerald-400" />
                    <span>{metric.value}</span>
                  </span>
                ))}
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-400' : 'border-slate-200 bg-white text-slate-500'
                  }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{liveUsageLabel}</span>
              </span>
              <div
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-300' : 'border-slate-200 bg-white text-slate-600'
                  } ${!isGridView ? 'opacity-60' : ''}`}
              >
                <span className="text-[10px] uppercase tracking-wide">{gridLabel}</span>
                <button
                  type="button"
                  onClick={() => changeGridColumns(-1)}
                  disabled={!canDecreaseColumns || !isGridView}
                  className="rounded-full border border-transparent p-1 transition hover:border-emerald-500 hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={gridDecreaseAria}
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span>x{cardsPerRow}</span>
                <button
                  type="button"
                  onClick={() => changeGridColumns(1)}
                  disabled={!canIncreaseColumns || !isGridView}
                  className="rounded-full border border-transparent p-1 transition hover:border-emerald-500 hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={gridIncreaseAria}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div
                className={`inline-flex items-center rounded-full border px-1 py-0.5 ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white'
                  }`}
              >
                <button
                  onClick={() => setView('grid')}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all duration-300 ${view === 'grid'
                    ? isDark
                      ? 'bg-zinc-100 text-black'
                      : 'bg-slate-900 text-white'
                    : 'opacity-70'
                    }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all duration-300 ${view === 'list'
                    ? isDark
                      ? 'bg-zinc-100 text-black'
                      : 'bg-slate-900 text-white'
                    : 'opacity-70'
                    }`}
                >
                  <Rows className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm">
                <label htmlFor="beta-sort-select" className="sr-only">
                  {sortSelectLabel}
                </label>
                <select
                  id="beta-sort-select"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as 'new' | 'popular' | 'title')}
                  className={`rounded-full border px-2 py-1 font-semibold focus:outline-none ${isDark ? 'border-[#27272A] bg-zinc-800/70 text-zinc-200 shadow-sm' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  <option value="new">{sortLabels.new}</option>
                  <option value="popular">{sortLabels.popular}</option>
                  <option value="title">{sortLabels.title}</option>
                </select>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`text-xs font-semibold ${isDark ? 'text-rose-200 hover:text-white' : 'text-rose-600 hover:text-rose-700'}`}
                  >
                    {clearFiltersLabel}
                  </button>
                )}
              </div>
            </div>
          </section>

          {visibleTags.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl border px-3 py-3 text-xs md:text-sm">
              <div className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>{tagsHeading}</div>
              <div className="flex flex-wrap gap-2">
                {visibleTags.map(({ key, label }) => {
                  const isSelected = selectedTags.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleTag(key)}
                      aria-pressed={isSelected}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${isSelected
                        ? isDark
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : isDark
                          ? 'border-[#27272A] bg-[#18181B] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800'
                        }`}
                    >
                      #{label}
                    </button>
                  );
                })}
                {hiddenTagCount > 0 && (
                  <span className={`rounded-full border border-dashed px-3 py-1 text-xs ${isDark ? 'border-zinc-700 text-zinc-500' : 'border-slate-200 text-slate-400'}`}>
                    +{hiddenTagCount}
                  </span>
                )}
              </div>
            </section>
          )}

          <section
            className={`rounded-3xl border px-4 py-4 transition-colors ${isDark ? 'border-[#27272A] bg-[#111114]' : 'border-slate-200 bg-white'
              }`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{tHome('trending') || 'Trending now'}</span>
              <span className={isDark ? 'text-zinc-500' : 'text-slate-500'}>{trendingCountLabel}</span>
            </div>
            <div className="relative mt-3 min-h-[220px] overflow-hidden rounded-2xl">
              {trendingSlides.map((slide, slideIdx) => (
                <div
                  key={slideIdx}
                  className={`absolute inset-0 transition-opacity duration-700 ${slideIdx === trendingIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {slide.map((app) => (
                      <TrendingCard key={app.id} app={app} isDark={isDark} labels={listingLabels} />
                    ))}
                  </div>
                </div>
              ))}
              {!trendingSlides.length && (
                <div className="text-sm text-center text-zinc-500">{tBeta('trending.empty', 'No trending apps yet.')}</div>
              )}
            </div>
          </section>

          <section className={gridSectionClass}>
            {filteredApps.map((app) => (
              <BetaAppCard
                key={app.id}
                app={app}
                view={view}
                isDark={isDark}
                labels={listingLabels}
                onDetails={handleCardDetails}
              />
            ))}
            {!filteredApps.length && (
              <div
                className={`rounded-2xl border px-6 py-8 text-center text-sm ${isDark ? 'border-[#27272A] text-zinc-400' : 'border-slate-200 text-slate-600'
                  }`}
              >
                <p className="font-semibold text-base">{noResultsText}</p>
                <p className="mt-2 text-xs opacity-80">{noResultsSecondary}</p>
                <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Link
                    prefetch={false}
                    href={noResultsCtaHref}
                    onClick={noResultsCtaHref === '/create' ? handleSubmitClick : undefined}
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${isDark ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'
                      }`}
                  >
                    {noResultsCtaLabel}
                  </Link>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={`text-xs font-semibold ${isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      {clearFiltersLabel}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>


        </div>
      </main>
      {showEarlyAccessPopup && earlyAccessCampaign?.isActive && (
        <div
          className={`fixed bottom-6 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border p-5 shadow-2xl backdrop-blur ${isDark ? 'border-[#27272A] bg-[#0B0B10]/95 text-zinc-100' : 'border-slate-200 bg-white text-slate-900'
            }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-base font-semibold">{popupTitle}</p>
              <p className={`mt-2 text-sm ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{popupBody}</p>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  prefetch={false}
                  href={popupPrimaryHref}
                  onClick={(event) => {
                    if (popupPrimaryHref === '/create') {
                      handleSubmitClick();
                    }
                    dismissEarlyAccessPopup();
                  }}
                  className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  {popupPrimaryLabel}
                </Link>
                <button
                  type="button"
                  onClick={dismissEarlyAccessPopup}
                  className={`text-sm ${isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {popupDismiss}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissEarlyAccessPopup}
              className={`text-lg ${isDark ? 'text-zinc-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
              aria-label={popupDismiss}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
        </div>
      )}

      <BetaDetailsModal app={selectedApp} onClose={closeDetails} isDark={isDark} labels={listingLabels} />
      <PartnershipModal open={showPartnership} onClose={() => setShowPartnership(false)} />
    </>
  );
}



function TrendingCard({ app, isDark, labels }: { app: BetaApp; isDark: boolean; labels: ListingLabels }) {
  const [authorProfile, setAuthorProfile] = useState<{ name: string; handle?: string; photo?: string } | null>(null);

  useEffect(() => {
    if (app.authorId) {
      const fetchProfile = async () => {
        try {
          const creatorRef = doc(db, 'creators', app.authorId!);
          const creatorSnap = await getDoc(creatorRef);
          if (creatorSnap.exists()) {
            const data = creatorSnap.data();
            setAuthorProfile({
              name: data.displayName || data.handle || app.authorName,
              handle: data.customRepositoryName || data.handle,
              photo: data.photoURL || data.photo || app.authorPhoto
            });
          }
        } catch (e) {
          // Ignore errors
        }
      };
      fetchProfile();
    }
  }, [app.authorId, app.authorName, app.authorPhoto]);

  const displayAuthorName = authorProfile?.name || app.authorName;
  const displayAuthorPhoto = authorProfile?.photo || app.authorPhoto;

  return (
    <div
      className={`flex min-w-[220px] flex-col overflow-hidden rounded-2xl border text-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white'
        }`}
    >
      <div className="relative h-28 w-full overflow-hidden rounded-b-none">
        {app.previewUrl ? (
          <Image
            src={app.previewUrl}
            alt={app.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 320px"
            loading="lazy"
            unoptimized
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br ${app.gradientClass}`} />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
          <span className="rounded-full bg-black/40 px-1 text-[9px] font-semibold">{labels.free}</span>
          <span>{app.name}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3 py-3">
        <p className={`line-clamp-2 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>{app.description}</p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {displayAuthorPhoto ? (
              <Image
                src={displayAuthorPhoto}
                alt={displayAuthorName}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover"
                loading="lazy"
                sizes="24px"
                unoptimized
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#A855F7] to-[#22C55E] text-[10px] font-bold text-white">
                {app.authorInitials}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-xs font-semibold">{displayAuthorName}</span>
              <span className={isDark ? 'text-zinc-500' : 'text-slate-500'}>{labels.creator}</span>
            </div>
          </div>
          <Link
            prefetch={false}
            href={playHref(app.id, { run: 1 })}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-black shadow-sm"
          >
            <Play className="h-3 w-3" />
            <span>{labels.play}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}



function BetaDetailsModal({
  app,
  onClose,
  isDark,
  labels,
}: {
  app: BetaApp | null;
  onClose: () => void;
  isDark: boolean;
  labels: ListingLabels;
}) {
  const { messages } = useI18n();
  useEffect(() => {
    if (!app) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [app, onClose]);

  if (!app) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-10 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`relative w-full max-w-3xl rounded-[32px] border px-6 py-6 shadow-2xl ${isDark ? 'border-[#27272A] bg-[#09090B]' : 'border-slate-200 bg-white'
          }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={messages['BetaHome.modal.close'] ?? 'Close details'}
          className={`absolute right-4 top-4 rounded-full border p-2 transition ${isDark ? 'border-[#27272A] text-zinc-400 hover:text-white' : 'border-slate-200 text-slate-500 hover:text-slate-900'
            }`}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="relative h-56 overflow-hidden rounded-[28px]">
            {app.previewUrl ? (
              <Image
                src={app.previewUrl}
                alt={app.name}
                fill
                loading="lazy"
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 320px"
                unoptimized
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${app.gradientClass}`} />
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                {app.category}
              </p>
              <h3 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{app.name}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>{app.description}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-[#27272A] text-zinc-200' : 'border-slate-200 text-slate-700'}`}>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-rose-400" />
                  <span>{app.likesLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Play className="h-4 w-4 text-emerald-400" />
                  <span>{app.usersLabel}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                prefetch={false}
                href={playHref(app.id, { run: 1 })}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                <Play className="h-4 w-4" />
                <span>{labels.play}</span>
              </Link>
              {/* Use programmatic navigation from inside modal to avoid relative-resolution bugs */}
              <DetailsButton app={app} onClose={onClose} isDark={isDark} labels={labels} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailsButton({ app, onClose, isDark, labels }: { app: BetaApp; onClose: () => void; isDark: boolean; labels: ListingLabels }) {
  const router = useRouter();
  const { user } = useAuth();
  const { messages } = useI18n();

  // Always show the details label here so the button reliably opens the details
  // view. Falling back to the localized "full details" label keeps behaviour
  // consistent and avoids routing creators to an edit URL that may 404.
  const actionLabel = labels.details;

  return (
    <button
      type="button"
      onClick={() => {
        try {
          const href = appDetailsHref(app.slug);
          onClose();
          router.push(href);
        } catch {
          // navigation failed — swallow error in UI
        }
      }}
      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold ${isDark ? 'border-[#27272A] text-zinc-100 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
    >
      {actionLabel}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

function calculateSearchScore(app: BetaApp, needle: string): number {
  const normalizedNeedle = needle.toLowerCase();
  const nameScore = app.name.toLowerCase().includes(normalizedNeedle) ? 3 : 0;
  const descriptionScore = app.description.toLowerCase().includes(normalizedNeedle) ? 2 : 0;
  const tagScore = app.tags.some((tag) => tag.toLowerCase().includes(normalizedNeedle)) ? 1 : 0;
  return nameScore + descriptionScore + tagScore;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function clampGridColumns(value: number): number {
  return Math.max(MIN_GRID_COLUMNS, Math.min(MAX_GRID_COLUMNS, value));
}

function readStoredGridColumns(): number | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(GRID_COLUMNS_STORAGE_KEY);
  if (!stored) return null;
  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) ? clampGridColumns(parsed) : null;
}

function readStoredViewMode(): 'grid' | 'list' | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === 'list' || stored === 'grid' ? stored : null;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
