'use client';
export const dynamic = 'force-dynamic';
import Image from 'next/image';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth, getDisplayName } from '@/lib/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { translateReason } from '@/lib/reviewReasons';
import { useI18n, useT } from '@/lib/i18n-provider';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { resolvePreviewUrl } from '@/lib/preview';
import { useSafeSearchParams } from '@/hooks/useSafeSearchParams';
import {
  useConnectStatus,
  startStripeOnboarding,
} from '@/hooks/useConnectStatus';
import { playHref, appDetailsHref } from '@/lib/urls';
import { getPlayUrl } from '@/lib/play';
import CongratsModal from '@/components/CongratsModal';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { BetaAppCard, type BetaApp, type ListingLabels } from '@/components/BetaAppCard';

import { useTheme } from '@/components/ThemeProvider';

// ————————————————————————————————————————
// Types
// ————————————————————————————————————————
type Listing = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  tags?: string[];
  visibility: 'public' | 'unlisted';
  playUrl: string;
  createdAt?: number;
  author?: { uid?: string; name?: string; photo?: string };
  likesCount?: number;
  previewUrl?: string | null;
  playCount?: number;
  likedByMe?: boolean;
  state?: 'active' | 'inactive';
  status?: 'draft' | 'published' | 'pending-review' | 'rejected';
  moderation?: { reasons?: string[]; status?: string };
};

// ————————————————————————————————————————
// Helpers
// ————————————————————————————————————————
function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function timeSince(ts?: number) {
  if (!ts) return '';
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

function RelativeTime({ ts }: { ts?: number }) {
  const value = useRelativeTime(ts ?? null, timeSince);
  return <>{value || ''}</>;
}

async function buildHeaders(withJson: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = withJson ? { 'Content-Type': 'application/json' } : {};
  try {
    // @ts-ignore
    const token = await auth?.currentUser?.getIdToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { /* ignore */ }
  return headers;
}

// ————————————————————————————————————————
// Toast
// ————————————————————————————————————————
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
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slideInRight">
      <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-lg bg-gradient-to-r', colors[type])}>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}

// ————————————————————————————————————————
// Page
// ————————————————————————————————————————
export default function MyProjectsPage() {
  const { user } = useAuth();
  const name = getDisplayName(user);
  const searchParams = useSafeSearchParams();
  const router = useRouter();
  const { locale } = useI18n();
  const t = useT('MyProjectsPage');
  const lastLocaleRef = useRef<string | null>(null);

  const [items, setItems] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showCongrats, setShowCongrats] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Listing | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [allAccessPrice, setAllAccessPrice] = useState<string>('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [repoPriceUpdatedAt, setRepoPriceUpdatedAt] = useState<number | null>(null);
  const [editingRepoPrice, setEditingRepoPrice] = useState(false);
  const connect = useConnectStatus();
  const canMonetize =
    connect?.payouts_enabled && (connect.requirements_due ?? 0) === 0;

  // UI state: search / filter / sort
  const [query, setQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'unlisted'>('all');
  const [sort, setSort] = useState<'newest' | 'likes' | 'title'>('newest');

  const toggleLike = useCallback(
    async (slug: string) => {
      if (busy[slug]) return;
      setBusy((prev) => ({ ...prev, [slug]: true }));
      try {
        const current = items.find((it) => it.slug === slug);
        const like = !(current?.likedByMe);
        const res = await fetch(`${PUBLIC_API_URL}/listing/${slug}/like`, {
          method: 'POST',
          credentials: 'include',
          headers: await buildHeaders(true),
          body: JSON.stringify({ uid: user?.uid, like }),
        });

        if (res.status === 401) {
          if (auth) await signOut(auth);
          window.location.href = '/login';
          return;
        }
        if (res.status === 429) {
          setToast({ message: t('slowDown'), type: 'info' });
          return;
        }
        if (!res.ok) throw new Error(`POST ${res.status}`);
        await res.json();
        setItems((prev) =>
          prev.map((it) =>
            it.slug === slug
              ? {
                ...it,
                likedByMe: like,
                likesCount: Math.max(0, (it.likesCount || 0) + (like ? 1 : -1)),
              }
              : it
          )
        );

        const el = document.getElementById(`like-${slug}`);
        if (el) {
          el.classList.add('animate-bounce');
          setTimeout(() => el.classList.remove('animate-bounce'), 500);
        }
      } catch (e) {
        console.error('Failed to toggle like', e);
      } finally {
        setBusy((prev) => ({ ...prev, [slug]: false }));
      }
    },
    [busy, items, user, t]
  );

  const deleteItem = useCallback(
    async (item: Listing) => {
      if (busy[item.slug]) return;
      setBusy((prev) => ({ ...prev, [item.slug]: true }));
      try {
        const res = await fetch(`${PUBLIC_API_URL}/listing/${item.slug}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: await buildHeaders(false),
        });
        if (!res.ok) throw new Error(`DELETE ${res.status}`);
        setItems((prev) => prev.filter((it) => it.slug !== item.slug));
        setToast({ message: t('deleteSuccess'), type: 'success' });
        setDeleteCandidate(null);
      } catch (e) {
        console.error('Failed to delete app', e);
        setToast({ message: t('deleteError'), type: 'error' });
      } finally {
        setBusy((prev) => ({ ...prev, [item.slug]: false }));
      }
    },
    [busy, t]
  );

  const handlePlayClick = useCallback(
    async (e: React.MouseEvent, item: Listing & { status?: string }) => {
      e.preventDefault();
      e.stopPropagation();
      if (item.status !== 'published') {
        setToast({ message: t('notPublished'), type: 'info' });
        return;
      }
      const dest = await getPlayUrl(item.id);
      window.open(dest, '_blank', 'noopener,noreferrer');
    },
    [setToast, t]
  );

  // — Load my listings (localized)
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      if (user?.uid) {
        try {
          const res = await fetch(
            `${PUBLIC_API_URL}/listings?owner=${encodeURIComponent(user.uid)}&lang=${encodeURIComponent(locale)}`,
            { cache: 'no-store', credentials: 'include', headers: await buildHeaders(false) }
          );
          if (!res.ok) throw new Error(`GET ${res.status}`);
          const json = await res.json();
          setItems(json.items ?? []);
        } catch (e) {
          console.error('Failed to load my listings', e);
          setItems([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setItems([]);
        setIsLoading(false);
      }
    };
    load();
  }, [user, locale]);

  // Load my handle and repo-level price
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.uid) return;
      try {
        const res = await fetch(`${PUBLIC_API_URL}/creators/id/${encodeURIComponent(user.uid)}`);
        if (cancelled) return;

        if (res.status === 404) {
          console.info('[MyPageClient] Creator profile not found for this user, which is expected for new users. Showing handle setup form.');
          setHandle(null);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to fetch creator profile: ${res.status}`);
        }

        const json = await res.json();
        if (cancelled) return;

        const h = json?.handle as string | undefined;
        if (h) {
          setHandle(h);
          try {
            const r2 = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(h)}`);
            if (cancelled) return;
            if (r2.ok) {
              const j2 = await r2.json();
              if (cancelled) return;
              const p = typeof j2?.allAccessPrice === 'number' ? String(j2.allAccessPrice) : '';
              setAllAccessPrice(p);
              const upd = typeof j2?.allAccessPriceUpdatedAt === 'number' ? j2.allAccessPriceUpdatedAt : null;
              setRepoPriceUpdatedAt(upd);
            }
          } catch (e) {
            if (cancelled) return;
            console.warn('[MyPageClient] Failed to fetch creator details by handle', e);
          }
        } else {
          setHandle(null);
        }
      } catch (e) {
        if (cancelled) return;
        console.error('[MyPageClient] Failed to load creator data', e);
        setHandle(null); // Ensure form is shown on error
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  async function saveRepoPrice(e: React.FormEvent) {
    e.preventDefault();
    if (!handle) return;
    setSavingPrice(true);
    try {
      const headers: any = await buildHeaders(true);
      const body: any = {};
      body.allAccessPrice = allAccessPrice.trim() === '' ? 0 : Number(allAccessPrice);
      const res = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(handle)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('bad_response');
      const json = await res.json().catch(() => null);
      const creator = json?.creator ?? null;
      if (creator) {
        if (typeof creator.allAccessPrice === 'number') setAllAccessPrice(String(creator.allAccessPrice));
        if (typeof creator.allAccessPriceUpdatedAt === 'number') setRepoPriceUpdatedAt(creator.allAccessPriceUpdatedAt);
      }
      setEditingRepoPrice(false);
      setToast({ message: t('repoPrice.success'), type: 'success' });
    } catch {
      setToast({ message: t('repoPrice.error'), type: 'error' });
    } finally {
      setSavingPrice(false);
    }
  }

  const deleted = searchParams.get('deleted') === '1';
  const submitted = searchParams.get('submitted') === '1';

  useEffect(() => {
    if (submitted) {
      // show a centered congrats modal instead of a small toast
      setShowCongrats(true);
    }
  }, [submitted]);

  // Refetch handled via dependency on `locale` above

  // — Derived list (search/filter/sort)
  const filtered = useMemo(() => {
    let list = items.slice();

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(it =>
        it.title.toLowerCase().includes(q) ||
        (it.description?.toLowerCase().includes(q)) ||
        (it.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (visibilityFilter !== 'all') {
      list = list.filter(it => it.visibility === visibilityFilter);
    }
    list.sort((a, b) => {
      switch (sort) {
        case 'likes': {
          const la = a.likesCount ?? 0;
          const lb = b.likesCount ?? 0;
          return lb - la;
        }
        case 'title':
          return a.title.localeCompare(b.title);
        case 'newest':
        default:
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      }
    });
    return list;
  }, [items, query, visibilityFilter, sort]);

  const imgSrc = (it: Listing) => {
    return resolvePreviewUrl(it.previewUrl);
  };

  const copyLink = (it: Listing) => {
    const href = new URL(playHref(it.id, { run: 1 }), window.location.origin).toString();
    navigator.clipboard.writeText(href).then(() => {
      setToast({ message: t('linkCopied'), type: 'success' });
    });
  };

  const { isDark } = useTheme();

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-white via-emerald-50/30 to-white text-gray-900">
        <div className={`p-8 text-center max-w-md rounded-2xl ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-100' : 'bg-white border shadow-md text-gray-900'}`}>
          <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
          <p className="mb-6">{t('signInMessage')}</p>
          <Link href="/login" className="px-6 py-3 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition" title={t('goToLogin')}>{t('goToLogin')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-[#020617] via-[#0B0B10] to-[#0B0B10] text-zinc-100' : 'bg-gradient-to-br from-white via-emerald-50/30 to-white text-gray-900'}`}>
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {isDark ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[#020617] via-[#0B0B10] to-[#0B0B10]" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-900/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-900/20 rounded-full blur-3xl" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-100/40 via-white to-white" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
          </>
        )}
      </div>

      {/* Header */}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {deleted && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm">
            {t('appDeleted')}
          </div>
        )}

        {/* Title + Actions */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className={`text-3xl md:text-4xl font-black ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{t('title')}</h1>
            <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-700'}`}>
              {t('stats', {
                total: items.length,
                public: items.filter(i => i.visibility === 'public').length,
                unlisted: items.filter(i => i.visibility === 'unlisted').length
              })}
            </p>
          </div>
          <div className="flex gap-2">
            {handle && (
              <Link
                href={`/u/${handle}/finances`}
                className={`px-5 py-2.5 rounded-full border font-medium transition shadow-sm ${isDark ? 'border-emerald-700 text-emerald-400 bg-emerald-950/50 hover:bg-emerald-900/50' : 'border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50'}`}
                title={t('finances')}
              >
                {t('finances')}
              </Link>
            )}
            <Link
              href="/create"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-medium hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 shadow-md hover:shadow-lg"
              title={t('createNew')}
            >
              {t('createNew')}
            </Link>
          </div>
        </div>

        {/* Handle setup if missing - DISABLED: handles are now auto-generated during registration */}
        {false && (
          <section className={`mb-6 p-4 rounded-xl border shadow-sm ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-gray-200 bg-white'}`}>
            <h2 className={`text-lg font-semibold mb-1 ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{t('handle.title')}</h2>
            <p className={`text-sm mb-3 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>{t('handle.description')}</p>
            <HandleForm onSuccess={(h) => setHandle(h)} t={t} />
          </section>
        )}

        {/* Repo-level price */}
        {handle && (
          <section className={`mb-6 p-4 rounded-xl border shadow-sm ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-gray-200 bg-white'}`}>
            <h2 className={`text-lg font-semibold mb-2 ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{t('repoPrice.title')}</h2>
            {!canMonetize && (
              <div className={`mb-3 p-3 border rounded ${isDark ? 'border-blue-800 bg-blue-950/50' : 'border-blue-200 bg-blue-50'}`}>
                <p className={`text-sm mb-2 ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>
                  {t('repoPrice.locked')}
                </p>
                <button
                  onClick={() => startStripeOnboarding(user!.uid, handle)}
                  className={`px-3 py-1 rounded ${isDark ? 'bg-blue-700 text-white hover:bg-blue-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {t('repoPrice.setupStripe')}
                </button>
              </div>
            )}
            {!editingRepoPrice && Number(allAccessPrice || 0) > 0 ? (
              <div className="flex items-center justify-between">
                <div className="text-gray-900">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-600 text-white font-semibold">
                    {t('repoPrice.allAccess', { price: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(allAccessPrice)) })}
                  </span>
                  {repoPriceUpdatedAt && (
                    <span className="ml-3 text-sm text-gray-500">{t('repoPrice.lastUpdated', { date: new Date(repoPriceUpdatedAt).toLocaleString() })}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRepoPrice(true)}
                  className="px-4 py-2 rounded border border-gray-300 text-gray-800 hover:bg-white"
                  disabled={!canMonetize}
                >
                  {t('repoPrice.edit')}
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">{t('repoPrice.description')}</p>
                <form onSubmit={saveRepoPrice} className="flex items-end gap-2">
                  <div>
                    <label className="block text-sm text-gray-700">{t('repoPrice.priceLabel')}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={allAccessPrice}
                      onChange={(e) => setAllAccessPrice(e.target.value)}
                      className="border px-3 py-2 rounded w-36"
                      disabled={!canMonetize}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingPrice || !canMonetize}
                    className="px-4 py-2 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingPrice ? t('repoPrice.saving') : t('repoPrice.save')}
                  </button>
                  {Number(allAccessPrice || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditingRepoPrice(false)}
                      className="px-4 py-2 rounded border border-gray-300 text-gray-800 hover:bg-white"
                    >
                      {t('repoPrice.cancel')}
                    </button>
                  )}
                </form>
              </>
            )}
          </section>
        )}

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="col-span-1 md:col-span-1">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-gray-200 bg-white'}`}>
              <svg className={`w-5 h-5 ${isDark ? 'text-zinc-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className={`w-full outline-none bg-transparent text-sm placeholder:text-gray-500 ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'public', 'unlisted'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVisibilityFilter(v)}
                className={cn(
                  'flex-1 py-2.5 px-3 rounded-lg text-sm font-medium border transition-all duration-200',
                  visibilityFilter === v
                    ? `${isDark ? 'bg-emerald-950/50 border-emerald-700 text-emerald-400' : 'bg-white border-emerald-400 text-emerald-700'} shadow-sm`
                    : `${isDark ? 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:border-zinc-600' : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'}`
                )}
              >
                {v === 'all' ? t('filters.all') : v === 'public' ? t('filters.public') : t('filters.unlisted')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-700'}`}>{t('sort.label')}</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm border transition-shadow ${isDark ? 'border-[#27272A] bg-zinc-800/70 text-zinc-100 shadow-sm' : 'border-gray-200 bg-white text-gray-900'}`}
            >
              <option value="newest">{t('sort.newest')}</option>
              <option value="likes">{t('sort.mostLiked')}</option>
              <option value="title">{t('sort.titleAZ')}</option>
            </select>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`rounded-2xl border overflow-hidden animate-pulse ${isDark ? 'bg-[#18181B] border-[#27272A]' : 'bg-white border-gray-200 shadow-md'}`}>
                <div className={`aspect-video ${isDark ? 'bg-zinc-800' : 'bg-gray-200'}`} />
                <div className="p-4">
                  <div className={`${isDark ? 'bg-zinc-700' : 'bg-gray-200'} h-6 rounded w-3/4 mb-2`} />
                  <div className={`${isDark ? 'bg-zinc-700' : 'bg-gray-200'} h-4 rounded w-full mb-2`} />
                  <div className={`${isDark ? 'bg-zinc-700' : 'bg-gray-200'} h-4 rounded w-1/2`} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
            <p className="text-lg mb-4">{t('noProjects')}</p>
            <Link href="/create" className="px-6 py-3 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition" title={t('createFirst')}>{t('createFirst')}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((it) => {
              // Map to BetaApp format
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

              // Deterministic gradient based on ID
              const gradientIndex = it.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradientPalette.length;

              const betaApp: BetaApp = {
                id: it.id,
                slug: it.slug,
                name: it.title,
                description: it.description || '',
                category: 'App', // Default category
                authorName: it.author?.name || 'Anonymous',
                authorInitials: (it.author?.name || 'A').slice(0, 2).toUpperCase(),
                authorPhoto: it.author?.photo,
                authorId: it.author?.uid, // Add this
                playsCount: it.playCount || 0,
                likesCount: it.likesCount || 0,
                usersLabel: (it.playCount || 0).toString(),
                likesLabel: (it.likesCount || 0).toString(),
                price: (it as any).price,
                previewUrl: it.previewUrl || null,
                gradientClass: gradientPalette[gradientIndex],
                tags: it.tags || [],
                createdAt: it.createdAt || Date.now(),
                likedByMe: it.likedByMe,
              };

              const labels: ListingLabels = {
                free: 'FREE',
                creator: 'CREATOR',
                play: 'Play',
                details: 'Details',
                trending: 'Trending',
                edit: t('actions.edit') || 'Edit',
                delete: t('actions.delete') || 'Delete',
              };

              return (
                <BetaAppCard
                  key={it.slug}
                  app={betaApp}
                  isDark={isDark}
                  view="grid"
                  labels={labels}
                  showDetailsButton={false}
                  showDeleteButton={false}
                  onEdit={(app) => {
                    // Navigate to app details page (same as Details button)
                    router.push(appDetailsHref(app.slug));
                  }}
                  onDelete={(app) => {
                    // Open delete confirmation modal
                    setDeleteCandidate(it);
                  }}
                />
              );
            })}
          </div>
        )}

      </main >

      {/* Toast */}
      {
        showCongrats && (
          <CongratsModal
            title={t('congrats.title')}
            message={t('congrats.message')}
            confirmLabel={t('congrats.confirm')}
            onClose={() => {
              setShowCongrats(false);
              // remove the submitted flag from the URL by replacing the route
              router.replace('/my');
            }}
          />
        )
      }

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <ConfirmDeleteModal
          title={t('deleteConfirm.title')}
          message={t('deleteConfirm.message')}
          appTitle={deleteCandidate.title}
          confirmLabel={t('deleteConfirm.confirm')}
          cancelLabel={t('deleteConfirm.cancel')}
          onConfirm={() => deleteItem(deleteCandidate)}
          onCancel={() => setDeleteCandidate(null)}
          isDark={isDark}
        />
      )}

      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
        .animate-slideInRight { animation: slideInRight 0.3s ease-out; }
      `}</style>
    </div >
  );
}

function HandleForm({ onSuccess, t }: { onSuccess: (h: string) => void, t: any }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const h = value.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,}$/.test(h)) {
      setErr(t('handle.errorFormat'));
      return;
    }
    setBusy(true);
    try {
      const headers: any = await buildHeaders(true);
      const res = await fetch(`${PUBLIC_API_URL}/creators/me/handle`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ handle: h }),
      });
      if (res.status === 409) {
        setErr(t('handle.errorTaken'));
        return;
      }
      if (!res.ok) throw new Error('bad_response');
      onSuccess(h);
    } catch {
      setErr(t('handle.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div>
        <label className="block text-sm text-gray-700">{t('handle.label')}</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border px-3 py-2 rounded w-48"
          placeholder={t('handle.placeholder')}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? t('handle.submitting') : t('handle.submit')}
      </button>
      {err && <span className="text-sm text-red-600 ml-2">{err}</span>}
    </form>
  );
}
