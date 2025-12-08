import type { Listing as ApiListing } from '@/lib/types';
import { type BetaApp } from '@/components/BetaAppCard';
import { resolvePreviewUrl } from '@/lib/preview';
import { getTagFallbackLabel, normalizeTags } from '@/lib/tags';

export const gradientPalette = [
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

export const columnLayouts: Record<number, string> = {
    2: 'grid grid-cols-1 gap-8 sm:grid-cols-2',
    3: 'grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    5: 'grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
    6: 'grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
};

export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 6;
export const DEFAULT_GRID_COLUMNS = 3;
export const TRENDING_SLIDE_SIZE = 3;
export const FILTER_ALL = 'all';
export const FILTER_TRENDING = 'trending';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SYNC_QUERY_KEYS = ['q', 'sort', 'view', 'filter', 'tag', 'cols'] as const;
export const GRID_COLUMNS_STORAGE_KEY = 'betaHome.gridColumns';
export const VIEW_MODE_STORAGE_KEY = 'betaHome.viewMode';

export function formatMetric(count?: number | null, newLabel = 'New') {
    if (!count || count <= 0) return newLabel;
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}m`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
    return `${count}`;
}

export function pickCategory(
    tags: string[] | null,
    translator: (key: string, fallback: string) => string,
    fallback: string
) {
    if (!tags?.length) return fallback;
    const tag = tags[0];
    const fallbackLabel = getTagFallbackLabel(tag);
    return translator(`tags.${tag}`, fallbackLabel)
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatMessage(template: string, params?: Record<string, string | number>) {
    if (!params) return template;
    return Object.entries(params).reduce(
        (acc, [key, value]) => acc.split(`{${key}}`).join(String(value)),
        template
    );
}

export function makeInitials(name: string) {
    if (!name) return '??';
    return name
        .split(' ')
        .map((part) => part.trim()[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

export function mapListings(
    items: ApiListing[],
    options: {
        defaultDescription: string;
        fallbackCategory: string;
        metricNewLabel: string;
        unknownAuthor: string;
        translator: (key: string, fallback: string) => string;
    }
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
            authorHandle: item.author?.handle || undefined,
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

export function calculateSearchScore(app: BetaApp, needle: string): number {
    const normalizedNeedle = needle.toLowerCase();
    const nameScore = app.name.toLowerCase().includes(normalizedNeedle) ? 3 : 0;
    const descriptionScore = app.description.toLowerCase().includes(normalizedNeedle) ? 2 : 0;
    const tagScore = app.tags.some((tag) => tag.toLowerCase().includes(normalizedNeedle)) ? 1 : 0;
    return nameScore + descriptionScore + tagScore;
}

export function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

export function clampGridColumns(value: number): number {
    return Math.max(MIN_GRID_COLUMNS, Math.min(MAX_GRID_COLUMNS, value));
}

export function readStoredGridColumns(): number | null {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(GRID_COLUMNS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) ? clampGridColumns(parsed) : null;
}

export function readStoredViewMode(): 'grid' | 'list' | null {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === 'list' || stored === 'grid' ? stored : null;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
