'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Listing as ApiListing } from '@/lib/types';
import { sendToLogin } from '@/lib/loginRedirect';
import { useI18n } from '@/lib/i18n-provider';
import { useAuth } from '@/lib/auth';
import { apiPost } from '@/lib/api';
import { useEarlyAccessCampaign } from '@/hooks/useEarlyAccessCampaign';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import { PUBLIC_API_URL } from '@/lib/config';
import { triggerConfetti } from '@/components/Confetti';
import PartnershipModal from '@/components/PartnershipModal';
import { type BetaApp, type ListingLabels } from '@/components/BetaAppCard';
import { useTheme } from '@/components/ThemeProvider';
import { useDebounce } from '@/hooks/useDebounce';

import HomeStickyHeader from './components/HomeStickyHeader';
import FeedbackBanner from './components/FeedbackBanner';
import HomeHero from './components/HomeHero';
import HomeFilterBar from './components/HomeFilterBar';
import TrendingSection from './components/TrendingSection';
import AppGrid from './components/AppGrid';
import EarlyAccessPopup from './components/EarlyAccessPopup';
import BetaDetailsModal from './components/BetaDetailsModal';
import EmptyState from './components/EmptyState'; // Imported for types mainly, but used in AppGrid props logic

import * as Utils from './utils';

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
    [earlyAccessCampaign?.id]
  );

  // Memoized translation helpers
  const tHome = useCallback((key: string) => (messages[`Home.${key}`] as string) || '', [messages]);
  const tNav = useCallback((key: string) => (messages[`Nav.${key}`] as string) || key, [messages]);
  const tBeta = useCallback(
    (key: string, fallback = '', params?: Record<string, string | number>) =>
      Utils.formatMessage((messages[`BetaHome.${key}`] as string) ?? fallback, params),
    [messages]
  );

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
    [defaultDescription, fallbackCategory, metricNewLabel, unknownAuthor, tBeta]
  );
  const apps = useMemo(() => Utils.mapListings(rawListings, mappingOptions), [rawListings, mappingOptions]);

  useEffect(() => {
    setRawListings(initialItems);
    setCommunityStats((prev) => ({
      ...prev,
      publishedApps: initialItems.length || prev.publishedApps,
    }));
  }, [initialItems]);

  const { isDark } = useTheme();
  const [activeFilter, setActiveFilter] = useState<string>(Utils.FILTER_ALL);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [cardsPerRow, setCardsPerRow] = useState(Utils.DEFAULT_GRID_COLUMNS);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'new' | 'popular' | 'title'>('new');
  const [initialQuerySynced, setInitialQuerySynced] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(24);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filters = useMemo(() => {
    const categories = Array.from(new Set(apps.map((app) => app.category))).slice(0, 5);
    return [Utils.FILTER_ALL, Utils.FILTER_TRENDING, ...categories];
  }, [apps]);

  // Predefined tag keys
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
      return { key: canonicalKey, label: tBeta(key, canonicalKey) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, messages, _predefinedTagKeysHash, tBeta]
  );
  const hiddenTagCount = 0;

  const trendingApps = useMemo(() => {
    const tagged = apps.filter((app) => app.tag === 'trending');
    if (tagged.length >= 4) return tagged;
    return [...tagged, ...apps.filter((app) => !app.tag)].slice(0, 4);
  }, [apps]);

  const trendingSlides = useMemo(() => {
    if (!trendingApps.length) return [];
    return Utils.chunkArray(trendingApps, Utils.TRENDING_SLIDE_SIZE);
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
    const q = debouncedSearch.trim().toLowerCase();
    let next = apps.filter((app) => {
      if (activeFilter === Utils.FILTER_TRENDING && app.tag !== 'trending') return false;
      if (activeFilter !== Utils.FILTER_ALL && activeFilter !== Utils.FILTER_TRENDING && app.category !== activeFilter)
        return false;
      if (selectedTags.length && !selectedTags.every((tag) => app.tags.includes(tag))) return false;
      return true;
    });

    if (q) {
      return next
        .map((app) => ({ app, score: Utils.calculateSearchScore(app, q) }))
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
  }, [apps, activeFilter, debouncedSearch, selectedTags, sortBy]);

  useEffect(() => {
    setVisibleCount(24);
  }, [filteredApps]);

  const visibleApps = filteredApps.slice(0, visibleCount);
  const hasMore = visibleCount < filteredApps.length;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => prev + 24);
        }
      },
      { rootMargin: '400px' }
    );
    const target = loadMoreRef.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasMore, visibleApps.length]);

  const filterLabelMap: Record<string, string> = {
    [Utils.FILTER_ALL]: tBeta('filters.all', 'All'),
    [Utils.FILTER_TRENDING]: tBeta('filters.trending', 'Trending'),
  };

  const listingLabels: ListingLabels = {
    free: tBeta('listing.badge.free', 'FREE'),
    creator: tBeta('listing.label.creator', 'Creator'),
    play: tBeta('listing.actions.play', 'Play'),
    details: tBeta('listing.actions.fullDetails', 'Full details'),
    trending: tBeta('listing.tag.trending', 'Trending'),
  };

  const searchPlaceholder = tBeta('search.placeholder', 'Search apps, creators, or prompts...');
  const heroBadgeText = tBeta('hero.badge', 'Discover Amazing Mini-Apps & Games');
  const randomPickLabel = tBeta('hero.random.label', 'Random Pick');
  const randomPickDetailsLabel = tBeta('hero.random.details', 'View details');
  const heroSubmitLabel = tBeta('hero.actions.submit', 'Submit App');
  const curatedLabel = tBeta('hero.badges.curated', 'Curated');
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
  const noResultsText = tBeta('empty.noResults', 'Nema rezultata za taj upit. Pokušaj promijeniti filtere.');
  const hasActiveFilters = selectedTags.length > 0 || search.trim().length > 0 || activeFilter !== Utils.FILTER_ALL;
  const noResultsSecondary = hasActiveFilters
    ? tHome('tryAdjust') || tBeta('empty.tryAdjust', 'Pokušaj promijeniti tagove ili pretragu.')
    : tHome('beFirst') || tBeta('empty.beFirst', 'Budi prvi koji će objaviti mini aplikaciju.');
  const noResultsCtaLabel = user
    ? heroSubmitLabel
    : tNav('login') || tHome('signIn') || 'Prijavi se';
  const noResultsCtaHref = user ? '/create' : '/login';
  const clearFiltersLabel = tBeta('filters.clear', 'Reset filters');
  const refreshLabel = tBeta('actions.refresh', 'Refresh');
  const retryLabel = tBeta('actions.retry', 'Try again');
  const listingsErrorLabel = tBeta('errors.listings', 'Unable to refresh the feed. Please try again.');
  const trendingCountLabel = tBeta('sections.trending.count', '{count} apps', { count: trendingApps.length });

  const handleSubmitClick = useCallback(() => {
    triggerConfetti();
  }, []);

  // URL Sync Effects
  useEffect(() => {
    const qParam = searchParams.get('q') ?? '';
    setSearch((prev) => (prev === qParam ? prev : qParam));

    const sortParam = searchParams.get('sort');
    if (sortParam === 'new' || sortParam === 'popular' || sortParam === 'title') {
      setSortBy((prev) => (prev === sortParam ? prev : sortParam));
    } else {
      setSortBy((prev) => (prev === 'new' ? prev : 'new'));
    }

    const storedView = !initialQuerySynced ? Utils.readStoredViewMode() : null;
    const viewParam = searchParams.get('view');
    const viewFromQuery = viewParam === 'list' ? 'list' : viewParam === 'grid' ? 'grid' : null;
    const resolvedView = viewFromQuery ?? (!initialQuerySynced ? storedView : null);
    if (resolvedView) {
      setView((prev) => (prev === resolvedView ? prev : resolvedView));
    }

    const tagsFromParams = searchParams.getAll('tag').map((tag) => tag.trim()).filter(Boolean);
    const uniqueTags = Array.from(new Set(tagsFromParams));
    setSelectedTags((prev) => (Utils.arraysEqual(prev, uniqueTags) ? prev : uniqueTags));

    if (!initialQuerySynced) {
      setInitialQuerySynced(true);
    }
  }, [searchParams, initialQuerySynced]);

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const validFilter = filterParam && filters.includes(filterParam) ? filterParam : Utils.FILTER_ALL;
    setActiveFilter((prev) => (prev === validFilter ? prev : validFilter));
  }, [searchParams, filters]);

  useEffect(() => {
    const storedColumns = !initialQuerySynced ? Utils.readStoredGridColumns() : null;
    const colsParam = searchParams.get('cols');
    let resolvedColumns: number | null = null;
    if (colsParam) {
      const parsed = Number.parseInt(colsParam, 10);
      if (Number.isFinite(parsed)) {
        resolvedColumns = Utils.clampGridColumns(parsed);
      }
    } else if (!initialQuerySynced && storedColumns !== null) {
      resolvedColumns = Utils.clampGridColumns(storedColumns);
    }
    if (resolvedColumns !== null) {
      setCardsPerRow((prev) => (prev === resolvedColumns ? prev : resolvedColumns));
    }
  }, [searchParams, initialQuerySynced]);

  // Local Storage Effects
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(Utils.VIEW_MODE_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(Utils.GRID_COLUMNS_STORAGE_KEY, String(cardsPerRow));
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
    Utils.SYNC_QUERY_KEYS.forEach((key) => nextParams.delete(key));
    const trimmedSearch = debouncedSearch.trim();
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
    if (cardsPerRow !== Utils.DEFAULT_GRID_COLUMNS) {
      nextParams.set('cols', String(cardsPerRow));
    }
    if (activeFilter !== Utils.FILTER_ALL) {
      nextParams.set('filter', activeFilter);
    }
    const nextString = nextParams.toString();
    const currentString = searchParams.toString();
    if (nextString === currentString) return;
    router.replace(`${pathname}${nextString ? `?${nextString}` : ''}`, { scroll: false });
  }, [
    initialQuerySynced,
    pathname,
    debouncedSearch,
    selectedTags,
    sortBy,
    view,
    cardsPerRow,
    activeFilter,
    // NOTE: searchParams intentionally excluded
  ]);

  const randomApp = randomIndex !== null ? apps[randomIndex] : null;

  const isGridView = view === 'grid';
  const canDecreaseColumns = cardsPerRow > Utils.MIN_GRID_COLUMNS;
  const canIncreaseColumns = cardsPerRow < Utils.MAX_GRID_COLUMNS;
  const gridSectionClass = isGridView ? Utils.columnLayouts[cardsPerRow] ?? Utils.columnLayouts[4] : 'space-y-6';

  // Early Access & Popup Labels
  const popupTitle = messages['Home.earlyAccessTitle'] ?? 'Early Access is live!';
  const popupBody = messages['Home.earlyAccessBody'] ?? 'Gold + NoAds are active for you during the campaign. Publish an app to make the most of it.';
  const popupPublishLabel = messages['Home.earlyAccessPublish'] ?? 'Publish an app';
  const popupSignInLabel = messages['Home.earlyAccessSignIn'] ?? 'Sign in now';
  const popupDismiss = messages['Home.earlyAccessDismiss'] ?? 'Close';
  const popupPrimaryLabel = user ? popupPublishLabel : popupSignInLabel;
  const popupPrimaryHref = user ? '/create' : '/login';

  const changeGridColumns = (delta: number) => {
    setCardsPerRow((current) => {
      const next = Math.max(Utils.MIN_GRID_COLUMNS, Math.min(Utils.MAX_GRID_COLUMNS, current + delta));
      return next;
    });
  };

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    setActiveFilter(Utils.FILTER_ALL);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedTags([]);
    setSearch('');
    setSortBy('new');
    setActiveFilter(Utils.FILTER_ALL);
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
    [listingsErrorLabel, locale]
  );

  const handleRefreshClick = useCallback(() => {
    if (isLoadingListings) return;
    reloadListings({});
  }, [isLoadingListings, reloadListings]);

  const handleCardDetails = useCallback((app: BetaApp) => {
    setSelectedApp(app);
  }, []);

  const closeDetails = useCallback(() => setSelectedApp(null), []);

  // Reload listings on mount and when user authentication state changes (for likedByMe status)
  useEffect(() => {
    reloadListings({ silent: true });
  }, [reloadListings, user?.uid]);

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
          publishedApps: typeof data?.publishedApps === 'number' ? data.publishedApps : prev.publishedApps,
          membersCount: typeof data?.membersCount === 'number' ? data.membersCount : prev.membersCount,
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
      value: Utils.formatMetric(liveAppsCount, metricNewLabel),
      label: tBeta('metrics.apps', 'Objavljene aplikacije'),
    },
    {
      id: 'members',
      value: Utils.formatMetric(communityMembersCount, metricNewLabel),
      label: tBeta('metrics.members', 'Članova zajednice'),
    },
    {
      id: 'runs',
      value: Utils.formatMetric(totalPlays, metricNewLabel),
      label: tBeta('metrics.runs', 'Ukupno pokretanja'),
    },
  ];
  const heroCardDescription = tBeta(
    'hero.card.description',
    'Build collections of AI-powered experiences and share them with a link.',
  );
  const heroCardAppsStat = tBeta('hero.card.stats.apps', '{count}+ Mini-Apps', { count: liveAppsCount });
  const heroCardFavoritesStat = tBeta('hero.card.stats.favorites', '{count} favorites', {
    count: Utils.formatMetric(totalLikes, metricNewLabel),
  });
  const searchStatsText = tBeta('search.liveStats', '{apps} live apps · {plays} plays', {
    apps: liveAppsCount,
    plays: Utils.formatMetric(totalPlays, metricNewLabel),
  });

  return (
    <>
      <main className="flex-1 space-y-2 lg:min-w-0">
        <HomeStickyHeader
          isDark={isDark}
          search={search}
          setSearch={setSearch}
          searchInputRef={searchInputRef}
          searchPlaceholder={searchPlaceholder}
          searchStatsText={searchStatsText}
          handleRefreshClick={handleRefreshClick}
          isLoadingListings={isLoadingListings}
          refreshLabel={refreshLabel}
        />

        <FeedbackBanner
          isDark={isDark}
          loadError={loadError}
          loadErrorDetails={loadErrorDetails}
          handleRefreshClick={handleRefreshClick}
          isLoadingListings={isLoadingListings}
          retryLabel={retryLabel}
        />

        <HomeHero
          isDark={isDark}
          heroBadgeText={heroBadgeText}
          tHome={tHome}
          tBeta={tBeta}
          tNav={tNav}
          randomApp={randomApp}
          randomPickLabel={randomPickLabel}
          curatedLabel={curatedLabel}
          listingLabels={listingLabels}
          randomPickDetailsLabel={randomPickDetailsLabel}
          heroAppsLine={heroAppsLine}
          heroCardDescription={heroCardDescription}
          heroCardAppsStat={heroCardAppsStat}
          heroCardFavoritesStat={heroCardFavoritesStat}
        />

        <HomeFilterBar
          isDark={isDark}
          filters={filters}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          filterLabelMap={filterLabelMap}
          heroMetrics={heroMetrics}
          liveUsageLabel={liveUsageLabel}
          gridLabel={gridLabel}
          changeGridColumns={changeGridColumns}
          canDecreaseColumns={canDecreaseColumns}
          canIncreaseColumns={canIncreaseColumns}
          isGridView={isGridView}
          cardsPerRow={cardsPerRow}
          view={view}
          setView={setView}
          gridDecreaseAria={gridDecreaseAria}
          gridIncreaseAria={gridIncreaseAria}
          sortSelectLabel={sortSelectLabel}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortLabels={sortLabels}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          clearFiltersLabel={clearFiltersLabel}
          visibleTags={visibleTags}
          selectedTags={selectedTags}
          toggleTag={toggleTag}
          hiddenTagCount={hiddenTagCount}
          search={search}
          setSearch={setSearch}
        />

        <TrendingSection
          isDark={isDark}
          trendingCountLabel={trendingCountLabel}
          trendingSlides={trendingSlides}
          trendingIndex={trendingIndex}
          listingLabels={listingLabels}
          tHome={tHome}
          tBeta={tBeta}
        />

        <AppGrid
          gridSectionClass={gridSectionClass}
          visibleApps={visibleApps}
          hasMore={hasMore}
          loadMoreRef={loadMoreRef}
          view={view}
          isDark={isDark}
          listingLabels={listingLabels}
          handleCardDetails={handleCardDetails}
          filteredAppsLength={filteredApps.length}
          emptyStateProps={{
            isDark,
            noResultsText,
            noResultsSecondary,
            hasActiveFilters,
            clearFiltersLabel,
            clearFilters,
            noResultsCtaHref,
            handleSubmitClick,
            noResultsCtaLabel,
          }}
        />
      </main>

      {/* {showEarlyAccessPopup && earlyAccessCampaign?.isActive && (
        <EarlyAccessPopup
          isDark={isDark}
          popupTitle={popupTitle}
          popupBody={popupBody}
          popupPrimaryHref={popupPrimaryHref}
          popupPrimaryLabel={popupPrimaryLabel}
          popupDismiss={popupDismiss}
          handleSubmitClick={handleSubmitClick}
          dismissEarlyAccessPopup={dismissEarlyAccessPopup}
        />
      )} */}

      <BetaDetailsModal app={selectedApp} onClose={closeDetails} isDark={isDark} labels={listingLabels} />
      <PartnershipModal open={showPartnership} onClose={() => setShowPartnership(false)} />
    </>
  );
}
