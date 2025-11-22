'use client';

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useAuth, getDisplayName } from '@/lib/auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useI18n } from '@/lib/i18n-provider';
import { useAds } from '@/components/AdsProvider';
import { checkAccess } from '@/lib/access';
import { handleFetchError } from '@/lib/handleFetchError';
import { getCreatorHandle } from '@/lib/creators';
import { useConnectStatus, startStripeOnboarding } from '@/hooks/useConnectStatus';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import {
    MAX_PREVIEW_SIZE_BYTES,
    MAX_SCREENSHOT_SIZE_BYTES,
    PREVIEW_PRESET_PATHS,
    PreviewPresetPath,
    PreviewUploadError,
    ScreenshotUploadError,
    deleteScreenshot,
    uploadPreviewFile,
    uploadPresetPreview,
    uploadScreenshotFile,
} from '@/lib/previewClient';
import { resolvePreviewUrl } from '@/lib/preview';
import { playHref } from '@/lib/urls';
import { getPlayUrl } from '@/lib/play';
import readFileAsDataUrl from '@/lib/readFileAsDataUrl';
import { PUBLIC_API_URL, PUBLIC_APPS_HOST } from '@/lib/config';
import type { AccessMode, RoomsMode } from '@/lib/types';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export type ListingStatus = 'pending_review' | 'approved' | 'rejected' | 'published' | 'draft' | 'pending_review_llm';
export type ListingState = 'active' | 'archived' | 'deleted' | string;

export type Listing = {
    id: string;
    slug: string;
    title: string;
    description?: string;
    longDescription?: string;
    tags?: string[];
    screenshotUrls?: string[];
    visibility: 'public' | 'unlisted';
    accessMode?: AccessMode;
    playUrl: string;
    previewUrl?: string | null;
    createdAt: number;
    author?: { uid?: string; name?: string; photo?: string; handle?: string };
    likesCount?: number;
    likedByMe?: boolean;
    playsCount?: number;
    maxConcurrentPins?: number;
    state?: ListingState;
    pin?: string;
    price?: number;
    status?: ListingStatus;
    moderation?: { status?: string; reasons?: string[] };
    translations?: Record<string, { title?: string; description?: string }>;
    capabilities?: { storage?: { roomsMode?: RoomsMode } };
    customAssets?: CustomAssetRecord[];
    buildId?: string;
    bundlePublicUrl?: string;
};

export type ScreenshotSlotState = {
    uploading: boolean;
    error: string;
};

export type CustomAssetRecord = {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    updatedAt: number;
};

export type CustomAssetDraft = CustomAssetRecord & {
    localId: string;
    isNew?: boolean;
    hasLocalData?: boolean;
};

export const LONG_DESCRIPTION_LIMIT = 4000;
export const SCREENSHOT_FIELD_COUNT = 2;
export const SCREENSHOT_URL_LIMIT = 1024;
export const MIN_LONG_DESCRIPTION = 20;
export const MAX_CUSTOM_ASSET_COUNT = 30;
export const MAX_CUSTOM_ASSET_BYTES = 100 * 1024;
export const ALLOWED_CUSTOM_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];

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

function createLocalId() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAssetName(input: string) {
    const trimmed = (input || '').replace(/[\r\n]/g, '').trim();
    const sanitized = trimmed.replace(/[\\/]+/g, '-').slice(0, 160);
    return sanitized || `custom-${Date.now()}.png`;
}

export function useAppDetails() {
    const slug = useRouteParam('slug', (segments) => {
        if (segments.length > 1) {
            const [root, raw] = segments;
            if (root === 'app' || root === 'apps') {
                try {
                    return decodeURIComponent(raw ?? '');
                } catch {
                    return raw ?? '';
                }
            }
        }
        return undefined;
    });
    const router = useRouter();
    const { user } = useAuth();
    const { isSlotEnabled } = useAds();
    const name = getDisplayName(user);
    const { messages } = useI18n();
    const tApp = useCallback(
        (k: string, params?: Record<string, string | number>, fallback?: string) => {
            const template = (messages[`App.${k}`] as string) ?? fallback ?? k;
            if (!params) return template;
            return Object.entries(params).reduce(
                (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
                template,
            );
        },
        [messages],
    );

    const userId = user?.uid ?? auth?.currentUser?.uid ?? null;
    const normalizedSlug = useMemo(() => (slug ?? '').trim(), [slug]);

    const [item, setItem] = useState<Listing | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [hasFetched, setHasFetched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    const [authorHandle, setAuthorHandle] = useState<string | undefined>(undefined);

    const playListing = useCallback(async () => {
        if (!item) return;
        try {
            const dest = await getPlayUrl(item.id);
            window.open(dest, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Failed to open app', err);
            setToast({ message: 'Failed to open app. Please try again.', type: 'error' });
        }
    }, [item]);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [longDescription, setLongDescription] = useState('');
    const [screenshotUrls, setScreenshotUrls] = useState<string[]>(
        () => Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => ''),
    );
    const [screenshotStates, setScreenshotStates] = useState<ScreenshotSlotState[]>(
        () =>
            Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => ({
                uploading: false,
                error: '',
            })),
    );
    const [screenshotVersions, setScreenshotVersions] = useState<number[]>(
        () => Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => 0),
    );
    const customAssetInputRef = useRef<HTMLInputElement | null>(null);
    const assetFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [customAssetDrafts, setCustomAssetDrafts] = useState<CustomAssetDraft[]>([]);
    const [serverCustomAssets, setServerCustomAssets] = useState<CustomAssetRecord[]>([]);
    const [customAssetLoading, setCustomAssetLoading] = useState(false);
    const [customAssetError, setCustomAssetError] = useState<string | null>(null);
    const [customAssetSaving, setCustomAssetSaving] = useState(false);
    const [customAssetProgress, setCustomAssetProgress] = useState(0);

    const [trEn, setTrEn] = useState({ title: '', description: '' });
    const [trDe, setTrDe] = useState({ title: '', description: '' });
    const [trHr, setTrHr] = useState({ title: '', description: '' });
    const [tags, setTags] = useState<string>('');
    const [price, setPrice] = useState('');
    const [priceMin, setPriceMin] = useState(0.5);
    const [priceMax, setPriceMax] = useState(1000);
    const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
    const [accessMode, setAccessMode] = useState<AccessMode>('public');
    const [pin, setPin] = useState('');
    const [maxPins, setMaxPins] = useState(1);
    const [roomsMode, setRoomsMode] = useState<RoomsMode>('off');
    const [appState, setAppState] = useState<'active' | 'inactive'>('active');
    const [sessions, setSessions] = useState<Array<{ sessionId: string; anonId?: string; ipHash: string; createdAt: number; lastSeenAt: number }>>([]);
    const [refreshingSessions, setRefreshingSessions] = useState(false);
    const [lastSessionsRefresh, setLastSessionsRefresh] = useState<number | null>(null);
    const [rotatingPin, setRotatingPin] = useState(false);

    const [showSoftDialog, setShowSoftDialog] = useState(false);
    const [showHardDialog, setShowHardDialog] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [likeBusy, setLikeBusy] = useState(false);

    const fetchAbortRef = useRef<AbortController | null>(null);
    const previewInputRef = useRef<HTMLInputElement | null>(null);
    const screenshotInputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [imgVersion, setImgVersion] = useState(0);
    const [allowed, setAllowed] = useState(true);
    const overlayMaxChars = 22;
    const maxPreviewMb = useMemo(
        () => Math.round((MAX_PREVIEW_SIZE_BYTES / (1024 * 1024)) * 10) / 10,
        []
    );
    const screenshotMaxMb = useMemo(
        () => Math.round((MAX_SCREENSHOT_SIZE_BYTES / (1024 * 1024)) * 10) / 10,
        []
    );
    const maxCustomAssetKb = useMemo(
        () => Math.round(MAX_CUSTOM_ASSET_BYTES / 1024),
        []
    );
    const [previewChoice, setPreviewChoice] = useState<'preset' | 'custom'>('preset');
    const [selectedPreset, setSelectedPreset] = useState<PreviewPresetPath>(PREVIEW_PRESET_PATHS[0]);
    const [presetOverlay, setPresetOverlay] = useState('');
    const [customPreview, setCustomPreview] = useState<{ file: File; dataUrl: string } | null>(null);
    const [previewError, setPreviewError] = useState('');
    const [previewApplied, setPreviewApplied] = useState(false);
    const [previewDisplayFailed, setPreviewDisplayFailed] = useState(false);
    const relativeCreated = useRelativeTime(item?.createdAt ?? null, timeSince);

    const handlePresetSelect = useCallback((preset: PreviewPresetPath) => {
        setPreviewChoice('preset');
        setSelectedPreset(preset);
        setCustomPreview(null);
        setPreviewApplied(false);
        setPreviewError('');
    }, []);

    const handleCustomPreview = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            previewInputRef.current = e.target;
            if (!file) return;

            setPreviewApplied(false);
            setPreviewError('');

            if (file.size > MAX_PREVIEW_SIZE_BYTES) {
                setPreviewError(`${tApp('previewFileTooLarge')} ${maxPreviewMb}MB`);
                setCustomPreview(null);
                setPreviewChoice('preset');
                if (previewInputRef.current) previewInputRef.current.value = '';
                return;
            }

            try {
                const dataUrl = await readFileAsDataUrl(file);
                setCustomPreview({ file, dataUrl });
                setPreviewChoice('custom');
            } catch {
                setPreviewError(tApp('previewFileReadFailed'));
                setCustomPreview(null);
                setPreviewChoice('preset');
                if (previewInputRef.current) previewInputRef.current.value = '';
            }
        },
        [maxPreviewMb, tApp]
    );

    const resetCustomPreview = useCallback(() => {
        setCustomPreview(null);
        setPreviewChoice('preset');
        setPreviewApplied(false);
        setPreviewError('');
        if (previewInputRef.current) previewInputRef.current.value = '';
    }, []);

    const [showPayModal, setShowPayModal] = useState(false);
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    const [showReport, setShowReport] = useState(false);
    const [reportText, setReportText] = useState('');
    const [reportBusy, setReportBusy] = useState(false);
    const [showContentReport, setShowContentReport] = useState(false);
    const [contentReportText, setContentReportText] = useState('');
    const [contentReportBusy, setContentReportBusy] = useState(false);
    const [viewerHandle, setViewerHandle] = useState<string | undefined>(undefined);
    const viewerUid = useMemo(() => user?.uid || auth?.currentUser?.uid || '', [user]);

    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            let adminClaim = false;
            if (user) {
                try {
                    const tok = await auth?.currentUser?.getIdTokenResult(true);
                    adminClaim =
                        !!tok?.claims?.admin ||
                        tok?.claims?.role === 'admin' ||
                        !!tok?.claims?.isAdmin;
                } catch {
                    adminClaim = false;
                }
            }
            if (!cancelled) setIsAdmin(adminClaim);
        };
        check();
        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        if (item?.id && item.price && item.price > 0) {
            checkAccess(item.id).then(setAllowed).catch(() => setAllowed(false));
        }
    }, [item?.id, item?.price]);

    useEffect(() => {
        let cancelled = false;
        if (!viewerUid) {
            setViewerHandle(undefined);
            return () => {
                cancelled = true;
            };
        }
        getCreatorHandle(viewerUid)
            .then((handle) => {
                if (!cancelled) setViewerHandle(handle);
            })
            .catch(() => {
                if (!cancelled) setViewerHandle(undefined);
            });
        return () => {
            cancelled = true;
        };
    }, [viewerUid]);

    const canEdit = !!user && !!item?.author?.uid && item.author.uid === user.uid;
    const connect = useConnectStatus();
    const canMonetize =
        connect?.payouts_enabled && (connect.requirements_due ?? 0) === 0;
    const canViewUnpublished = canEdit || isAdmin;
    const canReportContent = Boolean(user && viewerUid && !canEdit);
    const isPublished = item?.status === 'published';
    const previewDisplayUrl = useMemo(
        () =>
            previewChoice === 'custom' && customPreview?.dataUrl
                ? customPreview.dataUrl
                : selectedPreset,
        [customPreview?.dataUrl, previewChoice, selectedPreset]
    );
    const previewOverlayText = useMemo(
        () => (previewChoice === 'preset' ? presetOverlay.trim().slice(0, overlayMaxChars) : ''),
        [overlayMaxChars, presetOverlay, previewChoice]
    );
    const presetOverlayLabel = previewChoice === 'preset' ? previewOverlayText : '';

    useEffect(() => {
        setPreviewDisplayFailed(false);
    }, [item?.previewUrl, imgVersion]);

    const applySelectedPreview = useCallback(async () => {
        if (!item || !canEdit || previewBusy) return;
        if (previewChoice === 'custom' && !customPreview?.file) {
            setPreviewError(tApp('previewSelectFileFirst'));
            return;
        }

        setPreviewBusy(true);
        setPreviewApplied(false);
        setPreviewError('');

        try {
            let response: any;
            if (previewChoice === 'custom' && customPreview?.file) {
                response = await uploadPreviewFile(item.slug, customPreview.file);
            } else {
                response = await uploadPresetPreview(item.slug, selectedPreset, {
                    overlayText: previewOverlayText,
                });
            }
            if (response?.previewUrl) {
                setItem((prev) => (prev ? { ...prev, previewUrl: response.previewUrl } : prev));
            }
            setImgVersion((v) => v + 1);
            setPreviewApplied(true);
            setToast({ message: tApp('previewUploadSuccess'), type: 'success' });
        } catch (err: any) {
            let message = tApp('previewUploadFailed');
            if (err instanceof PreviewUploadError) {
                message = err.message || message;
            } else if (err instanceof Error) {
                message = err.message || message;
            }
            setPreviewError(message);
            setToast({ message, type: 'error' });
        } finally {
            setPreviewBusy(false);
        }
    }, [canEdit, customPreview?.file, item, previewBusy, previewChoice, previewOverlayText, selectedPreset, tApp]);

    useEffect(() => {
        if (item?.author?.handle) {
            setAuthorHandle(item.author.handle);
            return;
        }
        let cancelled = false;
        if (item?.author?.uid) {
            getCreatorHandle(item.author.uid).then((h) => {
                if (!cancelled && h) setAuthorHandle(h);
            });
        }
        return () => {
            cancelled = true;
        };
    }, [item?.author?.handle, item?.author?.uid]);

    useEffect(() => {
        if (item) {
            setLiked(!!item.likedByMe);
            setLikeCount(item.likesCount || 0);
        }
    }, [item]);

    useEffect(() => {
        setScreenshotStates(
            Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => ({ uploading: false, error: '' })),
        );
        setScreenshotVersions(Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => 0));
    }, [item?.slug]);

    const hydrateCustomAssetState = useCallback((incoming?: CustomAssetRecord[] | null) => {
        const normalized = Array.isArray(incoming) ? incoming : [];
        setServerCustomAssets(normalized);
        setCustomAssetDrafts(
            normalized.map((asset) => ({
                ...asset,
                localId: asset.id,
                isNew: false,
                hasLocalData: false,
            })),
        );
    }, []);

    const buildHeaders = useCallback(
        async (withJson: boolean): Promise<Record<string, string>> => {
            const headers: Record<string, string> = withJson ? { 'Content-Type': 'application/json' } : {};
            const activeUser = (user as any) ?? auth?.currentUser ?? null;
            if (activeUser?.getIdToken) {
                try {
                    const token = await activeUser.getIdToken();
                    if (token) headers['Authorization'] = `Bearer ${token}`;
                } catch {
                    // ignore
                }
            }
            return headers;
        },
        [user]
    );

    const loadCustomAssets = useCallback(async () => {
        if (!item?.slug || !canEdit) return;
        setCustomAssetLoading(true);
        setCustomAssetError(null);
        try {
            const res = await fetch(
                `${PUBLIC_API_URL}/listing/${encodeURIComponent(item.slug)}/custom-assets`,
                {
                    credentials: 'include',
                    headers: await buildHeaders(false),
                },
            );
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`GET custom assets failed ${res.status}: ${text}`);
            }
            const json = await res.json();
            hydrateCustomAssetState(Array.isArray(json?.assets) ? json.assets : []);
        } catch (err) {
            handleFetchError(err, 'Failed to load custom assets');
            setCustomAssetError(
                tApp(
                    'customAssets.loadFailed',
                    undefined,
                    'Failed to load custom graphics. Please try again.',
                ),
            );
        } finally {
            setCustomAssetLoading(false);
        }
    }, [item?.slug, canEdit, buildHeaders, hydrateCustomAssetState, tApp]);

    useEffect(() => {
        if (!item || !canEdit) return;
        hydrateCustomAssetState(item.customAssets ?? []);
    }, [item, canEdit, hydrateCustomAssetState]);

    useEffect(() => {
        if (!item?.slug || !canEdit) return;
        loadCustomAssets();
    }, [item?.slug, canEdit, loadCustomAssets]);

    useEffect(() => {
        if (!customAssetSaving) return;
        setCustomAssetProgress((prev) => (prev < 10 ? 10 : prev));
        const timer = setInterval(() => {
            setCustomAssetProgress((prev) => {
                if (prev >= 90) return prev;
                const next = prev + 5 + Math.random() * 10;
                return next > 90 ? 90 : next;
            });
        }, 400);
        return () => clearInterval(timer);
    }, [customAssetSaving]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch(`${PUBLIC_API_URL}/config`, { credentials: 'include' });
                if (res.ok) {
                    const json = await res.json();
                    if (typeof json.priceMin === 'number') setPriceMin(json.priceMin);
                    if (typeof json.priceMax === 'number') setPriceMax(json.priceMax);
                }
            } catch {
                // ignore
            }
        };
        fetchConfig();
    }, []);

    const toggleLike = useCallback(
        async () => {
            if (!item || likeBusy) return;
            setLikeBusy(true);
            try {
                const newLike = !liked;
                const res = await fetch(`${PUBLIC_API_URL}/listing/${item.slug}/like`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: await buildHeaders(true),
                    body: JSON.stringify({ uid: user?.uid, like: newLike }),
                });
                if (res.status === 401) {
                    if (auth) await signOut(auth);
                    router.push('/login');
                    return;
                }
                if (res.status === 429) {
                    setToast({ message: 'Polako ðŸ™‚', type: 'info' });
                    return;
                }
                if (!res.ok) throw new Error(`POST ${res.status}`);
                await res.json();
                setLiked(newLike);
                setLikeCount((prev) => {
                    const delta = newLike ? 1 : -1;
                    return Math.max(0, prev + delta);
                });
                setItem((prev) =>
                    prev
                        ? {
                            ...prev,
                            likedByMe: newLike,
                            likesCount: Math.max(0, (prev.likesCount || 0) + (newLike ? 1 : -1)),
                        }
                        : prev
                );
                const el = document.getElementById('like-button');
                if (el) {
                    el.classList.add('animate-bounce');
                    setTimeout(() => el.classList.remove('animate-bounce'), 500);
                }
            } catch (e) {
                handleFetchError(e, 'Failed to toggle like');
                setToast({
                    message: 'Unable to like this app. Please check the API URL and server status.',
                    type: 'error',
                });
            } finally {
                setLikeBusy(false);
            }
        },
        [item, likeBusy, router, buildHeaders, liked, user]
    );

    const normalizeScreenshotInput = useCallback((raw: string) => {
        const trimmed = (raw ?? '').toString().trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed.slice(0, SCREENSHOT_URL_LIMIT);
        }
        if (trimmed.startsWith('//')) {
            return `https:${trimmed}`.slice(0, SCREENSHOT_URL_LIMIT);
        }
        if (trimmed.startsWith('/')) {
            return trimmed.slice(0, SCREENSHOT_URL_LIMIT);
        }
        if (/^[a-z]+:\/\//i.test(trimmed)) {
            return trimmed.slice(0, SCREENSHOT_URL_LIMIT);
        }
        return `https://${trimmed}`.slice(0, SCREENSHOT_URL_LIMIT);
    }, []);

    const normalizeScreenshotState = useCallback(
        (values?: string[] | null) =>
            Array.from({ length: SCREENSHOT_FIELD_COUNT }, (_, index) =>
                normalizeScreenshotInput(values?.[index] ?? ''),
            ),
        [normalizeScreenshotInput],
    );

    useEffect(() => {
        setFetchError(null);

        if (!normalizedSlug) {
            fetchAbortRef.current?.abort();
            fetchAbortRef.current = null;
            setItem(null);
            setLoading(false);
            setHasFetched(true);
            return;
        }

        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        setLoading(true);

        const fetchListing = async () => {
            try {
                const encodedSlug = encodeURIComponent(normalizedSlug);
                const basePath = `/api/listing/${encodedSlug}`;
                const url = userId
                    ? `${basePath}?uid=${encodeURIComponent(userId)}`
                    : basePath;
                const res = await fetch(url, {
                    cache: 'no-store',
                    credentials: 'include',
                    signal: controller.signal,
                    headers: await buildHeaders(false),
                });

                if (controller.signal.aborted) return;

                if (res.status === 401) {
                    const errBody = await res.json().catch(() => null);
                    if (controller.signal.aborted) return;
                    if (errBody?.error === 'pin_required') {
                        router.replace(`/paywall?slug=${encodedSlug}`);
                        return;
                    }
                    throw new Error(`GET failed ${res.status}`);
                }

                if (res.status === 403) {
                    if (!controller.signal.aborted) {
                        router.replace(`/paywall?slug=${encodedSlug}&e=forbidden`);
                    }
                    return;
                }

                if (!res.ok) {
                    throw new Error(`GET failed ${res.status}`);
                }

                const json = await res.json();
                if (controller.signal.aborted) return;

                const it: Listing | undefined = json.item;
                if (it) {
                    setItem(it);
                    setPreviewApplied(Boolean(it.previewUrl));
                    setTitle(it.title ?? '');
                    setDescription(it.description ?? '');
                    setLongDescription(((it as any).longDescription ?? '').slice(0, LONG_DESCRIPTION_LIMIT));
                    const incomingScreens = Array.isArray((it as any).screenshotUrls)
                        ? (it as any).screenshotUrls
                        : [];
                    setScreenshotUrls(normalizeScreenshotState(incomingScreens));
                    try {
                        const tr = (it as any).translations || {};
                        setTrEn({ title: tr?.en?.title || '', description: tr?.en?.description || '' });
                        setTrDe({ title: tr?.de?.title || '', description: tr?.de?.description || '' });
                        setTrHr({ title: tr?.hr?.title || '', description: tr?.hr?.description || '' });
                    } catch { }
                    setTags((it.tags ?? []).join(', '));
                    setPrice(typeof it.price === 'number' ? String(it.price) : '');
                    setVisibility((it.visibility as any) ?? 'public');
                    setAccessMode((it.accessMode as any) ?? 'public');
                    setMaxPins(typeof it.maxConcurrentPins === 'number' ? it.maxConcurrentPins : 1);
                    setAppState((it.state as any) ?? 'active');
                    setPin(it.pin ?? '');
                    setRoomsMode(
                        ((it as any).capabilities?.storage?.roomsMode as RoomsMode | undefined) ?? 'off',
                    );
                } else {
                    setItem(null);
                }
            } catch (e: any) {
                if (controller.signal.aborted) return;
                handleFetchError(e, 'Failed to load app details');
                setItem(null);
                setFetchError(e?.message || 'failed_to_load');
                setToast({
                    message: 'Failed to load app details. Please check the API URL and server status.',
                    type: 'error',
                });
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setHasFetched(true);
                }
            }
        };

        void fetchListing();

        return () => {
            controller.abort();
        };
    }, [normalizedSlug, buildHeaders, userId, router, normalizeScreenshotState]);

    const imgSrc = useMemo(() => {
        const shouldForcePlaceholder = Boolean(item?.status && !isPublished && !canViewUnpublished);
        if (shouldForcePlaceholder) {
            return `${PUBLIC_API_URL}/assets/preview-placeholder.svg`;
        }
        const resolved = resolvePreviewUrl(item?.previewUrl);
        if (resolved?.includes('/uploads/')) {
            const separator = resolved.includes('?') ? '&' : '?';
            return `${resolved}${separator}v=${imgVersion}`;
        }
        return resolved;
    }, [canViewUnpublished, isPublished, item?.status, item?.previewUrl, imgVersion]);

    const handleLongDescriptionChange = useCallback((value: string) => {
        setLongDescription(value.slice(0, LONG_DESCRIPTION_LIMIT));
    }, []);

    const hasUnsavedPreview = useMemo(() => {
        if (!canEdit) return false;
        if (previewChoice === 'custom') return !!customPreview;
        if (previewChoice === 'preset') return !previewApplied;
        return false;
    }, [canEdit, customPreview, previewChoice, previewApplied]);

    const useEditorPreview = hasUnsavedPreview || (!imgSrc && canEdit);
    const activePreviewSrc = useEditorPreview ? previewDisplayUrl : imgSrc;
    const activeOverlayLabel =
        useEditorPreview && previewChoice === 'preset' ? presetOverlayLabel : '';

    const isValidScreenshotUrl = useCallback((value: string) => {
        if (!value) return true;
        return /^https?:\/\//i.test(value) || value.startsWith('/');
    }, []);

    const updateScreenshotSlotState = useCallback(
        (index: number, patch: Partial<ScreenshotSlotState>) => {
            setScreenshotStates((prev) => {
                const next = [...prev];
                next[index] = { ...next[index], ...patch };
                return next;
            });
        },
        [],
    );

    const bumpScreenshotVersion = useCallback((index: number) => {
        setScreenshotVersions((prev) => {
            const next = [...prev];
            next[index] = (next[index] ?? 0) + 1;
            return next;
        });
    }, []);

    const handleScreenshotFileInput = useCallback(
        async (index: number, files: FileList | null) => {
            if (!item || !canEdit) return;
            const file = files?.[0];
            const input = screenshotInputRefs.current[index];
            if (input) {
                input.value = '';
            }
            if (!file) return;

            updateScreenshotSlotState(index, { uploading: true, error: '' });

            try {
                const resp = await uploadScreenshotFile(item.slug, index, file);
                const updatedScreens = Array.isArray(resp?.screenshotUrls) ? resp.screenshotUrls : [];
                setScreenshotUrls(normalizeScreenshotState(updatedScreens));
                bumpScreenshotVersion(index);
                setToast({
                    message: tApp('creator.screenshotsUploadSuccess', undefined, 'Screenshot saved.'),
                    type: 'success',
                });
                updateScreenshotSlotState(index, { uploading: false, error: '' });
            } catch (err: any) {
                let message = tApp(
                    'creator.screenshotsUploadFailed',
                    undefined,
                    'Failed to upload screenshot. Please try again.',
                );
                if (err instanceof ScreenshotUploadError) {
                    if (err.code === 'screenshot_too_large') {
                        message = tApp(
                            'creator.screenshotsTooLarge',
                            { size: screenshotMaxMb },
                            `Screenshot must be ${screenshotMaxMb}MB or smaller.`,
                        );
                    } else if (err.message) {
                        message = err.message;
                    }
                }
                updateScreenshotSlotState(index, { uploading: false, error: message });
                setToast({ message, type: 'error' });
            }
        },
        [
            bumpScreenshotVersion,
            canEdit,
            item,
            normalizeScreenshotState,
            screenshotMaxMb,
            tApp,
            updateScreenshotSlotState,
            setToast,
        ],
    );

    const handleScreenshotRemove = useCallback(
        async (index: number) => {
            if (!item || !canEdit) return;
            const currentValue = screenshotUrls[index];
            if (!currentValue) return;
            updateScreenshotSlotState(index, { uploading: true, error: '' });
            try {
                const resp = await deleteScreenshot(item.slug, index);
                const updatedScreens = Array.isArray(resp?.screenshotUrls) ? resp.screenshotUrls : [];
                setScreenshotUrls(normalizeScreenshotState(updatedScreens));
                bumpScreenshotVersion(index);
                updateScreenshotSlotState(index, { uploading: false, error: '' });
                setToast({
                    message: tApp('creator.screenshotsRemoveSuccess', undefined, 'Screenshot removed.'),
                    type: 'success',
                });
            } catch (err: any) {
                let message = tApp(
                    'creator.screenshotsDeleteFailed',
                    undefined,
                    'Failed to remove screenshot. Please try again.',
                );
                if (err instanceof ScreenshotUploadError && err.message) {
                    message = err.message;
                }
                updateScreenshotSlotState(index, { uploading: false, error: message });
                setToast({ message, type: 'error' });
            }
        },
        [
            bumpScreenshotVersion,
            canEdit,
            item,
            normalizeScreenshotState,
            screenshotUrls,
            tApp,
            updateScreenshotSlotState,
            setToast,
        ],
    );

    const hasCustomAssetChanges = useMemo(() => {
        if (customAssetDrafts.length !== serverCustomAssets.length) return true;
        for (let i = 0; i < customAssetDrafts.length; i += 1) {
            const draft = customAssetDrafts[i];
            const base = serverCustomAssets[i];
            if (!base) return true;
            if (draft.id !== base.id) return true;
            if ((draft.name || '').trim() !== (base.name || '').trim()) return true;
            if (draft.hasLocalData) return true;
        }
        return false;
    }, [customAssetDrafts, serverCustomAssets]);

    const handleCustomAssetInput = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            if (!canEdit) return;
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            if (!files.length) return;
            setCustomAssetError(null);
            const existingNames = new Set(
                customAssetDrafts
                    .map((asset) => asset.name?.trim().toLowerCase())
                    .filter((name): name is string => Boolean(name)),
            );
            const additions: CustomAssetDraft[] = [];
            for (const file of files) {
                if (customAssetDrafts.length + additions.length >= MAX_CUSTOM_ASSET_COUNT) {
                    setCustomAssetError(
                        tApp(
                            'customAssets.limitError',
                            { limit: MAX_CUSTOM_ASSET_COUNT },
                            `You can upload up to ${MAX_CUSTOM_ASSET_COUNT} graphics.`,
                        ),
                    );
                    break;
                }
                const mime = (file.type || '').toLowerCase();
                if (!ALLOWED_CUSTOM_ASSET_TYPES.includes(mime)) {
                    setCustomAssetError(
                        tApp(
                            'customAssets.typeError',
                            undefined,
                            'Only PNG, JPG or GIF files are allowed.',
                        ),
                    );
                    continue;
                }
                if (file.size > MAX_CUSTOM_ASSET_BYTES) {
                    setCustomAssetError(
                        tApp(
                            'customAssets.sizeError',
                            { size: maxCustomAssetKb },
                            `Each file must be ${maxCustomAssetKb}KB or smaller.`,
                        ),
                    );
                    continue;
                }
                const normalizedName = normalizeAssetName(file.name);
                const lower = normalizedName.toLowerCase();
                if (existingNames.has(lower)) {
                    setCustomAssetError(
                        tApp('customAssets.duplicateError', undefined, 'Use unique filenames.'),
                    );
                    continue;
                }
                existingNames.add(lower);
                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    const localId = createLocalId();
                    additions.push({
                        id: `local-${localId}`,
                        localId,
                        name: normalizedName,
                        mimeType: mime,
                        size: file.size,
                        dataUrl,
                        updatedAt: Date.now(),
                        isNew: true,
                        hasLocalData: true,
                    });
                } catch {
                    setCustomAssetError(
                        tApp('customAssets.readError', undefined, 'Failed to read the selected files.'),
                    );
                    break;
                }
            }
            if (additions.length) {
                setCustomAssetDrafts((prev) => [...prev, ...additions]);
            }
        },
        [canEdit, customAssetDrafts, maxCustomAssetKb, tApp],
    );

    const handleCustomAssetRemove = useCallback((localId: string) => {
        setCustomAssetDrafts((prev) => prev.filter((asset) => asset.localId !== localId));
        if (assetFileInputRefs.current[localId]) {
            assetFileInputRefs.current[localId] = null;
        }
    }, []);

    const handleCustomAssetNameChange = useCallback((localId: string, value: string) => {
        setCustomAssetDrafts((prev) =>
            prev.map((asset) => (asset.localId === localId ? { ...asset, name: value } : asset)),
        );
    }, []);

    const handleCustomAssetReplace = useCallback(
        async (localId: string, files: FileList | null) => {
            if (!canEdit) return;
            const file = files?.[0];
            if (assetFileInputRefs.current[localId]) {
                assetFileInputRefs.current[localId]!.value = '';
            }
            if (!file) return;
            setCustomAssetError(null);
            const mime = (file.type || '').toLowerCase();
            if (!ALLOWED_CUSTOM_ASSET_TYPES.includes(mime)) {
                setCustomAssetError(
                    tApp('customAssets.typeError', undefined, 'Only PNG, JPG or GIF files are allowed.'),
                );
                return;
            }
            if (file.size > MAX_CUSTOM_ASSET_BYTES) {
                setCustomAssetError(
                    tApp(
                        'customAssets.sizeError',
                        { size: maxCustomAssetKb },
                        `Each file must be ${maxCustomAssetKb}KB or smaller.`,
                    ),
                );
                return;
            }
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const nextName = normalizeAssetName(file.name);
                setCustomAssetDrafts((prev) => {
                    const hasDuplicate = prev.some(
                        (asset) =>
                            asset.localId !== localId &&
                            asset.name?.trim().toLowerCase() === nextName.toLowerCase(),
                    );
                    if (hasDuplicate) {
                        setCustomAssetError(
                            tApp('customAssets.duplicateError', undefined, 'Use unique filenames.'),
                        );
                        return prev;
                    }
                    return prev.map((asset) => {
                        if (asset.localId !== localId) return asset;
                        return {
                            ...asset,
                            name: nextName,
                            mimeType: mime,
                            size: file.size,
                            dataUrl,
                            updatedAt: Date.now(),
                            hasLocalData: true,
                        };
                    });
                });
            } catch {
                setCustomAssetError(
                    tApp('customAssets.readError', undefined, 'Failed to read the selected files.'),
                );
            }
        },
        [canEdit, maxCustomAssetKb, tApp],
    );

    const resetCustomAssets = useCallback(() => {
        hydrateCustomAssetState(serverCustomAssets);
        setCustomAssetError(null);
    }, [hydrateCustomAssetState, serverCustomAssets]);

    const handleCustomAssetSave = useCallback(async () => {
        if (!item || !canEdit || customAssetSaving || !hasCustomAssetChanges) return;
        setCustomAssetSaving(true);
        setCustomAssetError(null);
        const payload: Array<{ id?: string; name: string; dataUrl?: string }> = [];
        const usedNames = new Set<string>();
        for (const asset of customAssetDrafts) {
            const cleanName = normalizeAssetName(asset.name);
            const lower = cleanName.toLowerCase();
            if (usedNames.has(lower)) {
                setCustomAssetError(
                    tApp('customAssets.duplicateError', undefined, 'Use unique filenames.'),
                );
                setCustomAssetSaving(false);
                return;
            }
            usedNames.add(lower);
            if (asset.hasLocalData || asset.isNew) {
                if (!asset.dataUrl) {
                    setCustomAssetError(
                        tApp('customAssets.readError', undefined, 'Failed to read the selected files.'),
                    );
                    setCustomAssetSaving(false);
                    return;
                }
                payload.push({ name: cleanName, dataUrl: asset.dataUrl });
            } else {
                payload.push({ id: asset.id, name: cleanName });
            }
        }
        try {
            const res = await fetch(`${PUBLIC_API_URL}/listing/${item.slug}/custom-assets`, {
                method: 'PATCH',
                credentials: 'include',
                headers: await buildHeaders(true),
                body: JSON.stringify({ assets: payload }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || `PATCH failed ${res.status}`);
            }
            hydrateCustomAssetState(Array.isArray(json.assets) ? json.assets : []);
            setToast({
                message: tApp(
                    'customAssets.savedToast',
                    undefined,
                    'Graphics saved. Rebuilding your app now.',
                ),
                type: 'success',
            });
            setCustomAssetProgress(100);
            setTimeout(() => setCustomAssetProgress(0), 800);
        } catch (err) {
            handleFetchError(err, 'Failed to save custom graphics');
            const message = tApp(
                'customAssets.saveFailed',
                undefined,
                'Failed to save custom graphics. Please try again.',
            );
            setCustomAssetError(message);
            setToast({ message, type: 'error' });
            setCustomAssetProgress(0);
        } finally {
            setCustomAssetSaving(false);
        }
    }, [
        item,
        canEdit,
        customAssetSaving,
        hasCustomAssetChanges,
        customAssetDrafts,
        buildHeaders,
        hydrateCustomAssetState,
        tApp,
        setToast,
    ]);

    useEffect(() => {
        if (useEditorPreview) {
            setPreviewDisplayFailed(false);
        }
    }, [useEditorPreview]);

    const loadSessions = useCallback(async () => {
        if (!normalizedSlug) return;
        setRefreshingSessions(true);
        try {
            const res = await fetch(`${PUBLIC_API_URL}/app/${normalizedSlug}/pin/sessions`, {
                cache: 'no-store',
                credentials: 'include',
                headers: await buildHeaders(false),
            });
            if (res.ok) {
                const json = await res.json();
                setSessions(Array.isArray(json.sessions) ? json.sessions : []);
            }
        } catch (e) {
            handleFetchError(e, 'Failed to load sessions');
            setToast({
                message: 'Failed to load sessions. Please check the API URL and server status.',
                type: 'error',
            });
        } finally {
            setRefreshingSessions(false);
            setLastSessionsRefresh(Date.now());
        }
    }, [normalizedSlug, buildHeaders]);

    async function revokeSession(sessionId: string) {
        if (!normalizedSlug) return;
        try {
            const res = await fetch(`${PUBLIC_API_URL}/app/${normalizedSlug}/pin/sessions/${sessionId}/revoke`, {
                method: 'POST',
                credentials: 'include',
                headers: await buildHeaders(false),
            });
            if (res.ok) {
                setToast({ message: 'Session revoked', type: 'success' });
                loadSessions();
            } else {
                setToast({ message: 'Failed to revoke session', type: 'error' });
            }
        } catch (e) {
            handleFetchError(e, 'Failed to revoke session');
            setToast({
                message: 'Failed to revoke session. Please check the API URL and server status.',
                type: 'error',
            });
        }
    }

    async function rotatePin() {
        setRotatingPin(true);
        if (!normalizedSlug) return;
        try {
            const res = await fetch(`${PUBLIC_API_URL}/app/${normalizedSlug}/pin/rotate`, {
                method: 'POST',
                credentials: 'include',
                headers: await buildHeaders(false),
            });
            const json = await res.json();
            if (res.ok) {
                setToast({ message: `New PIN: ${json.pin}`, type: 'success' });
                loadSessions();
            } else {
                setToast({ message: json.error || 'Failed to rotate PIN', type: 'error' });
            }
        } catch (e) {
            handleFetchError(e, 'Failed to rotate PIN');
            setToast({
                message: 'Failed to rotate PIN. Please check the API URL and server status.',
                type: 'error',
            });
        } finally {
            setRotatingPin(false);
        }
    }

    useEffect(() => {
        if (!item || (user?.uid !== item.author?.uid && !isAdmin)) return;
        loadSessions();
        const intervalId = setInterval(loadSessions, 30000);
        return () => clearInterval(intervalId);
    }, [item, user?.uid, isAdmin, loadSessions]);

    const onSave = async (
        overrides: Partial<
            Pick<
                Listing,
                | 'title'
                | 'description'
                | 'tags'
                | 'visibility'
                | 'accessMode'
                | 'price'
                | 'longDescription'
                | 'screenshotUrls'
            >
        > & { pin?: string | null; maxConcurrentPins?: number } = {}
    ) => {
        if (!canEdit || !item) return;

        setSaving(true);
        const parsedTags =
            typeof overrides.tags === 'string'
                ? (overrides.tags as unknown as string)
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                : tags.split(',').map((t) => t.trim()).filter(Boolean);

        const norm = (s: string) => s.trim();
        const translations: Record<string, { title?: string; description?: string }> = {};
        if (norm(trEn.title) || norm(trEn.description)) {
            translations.en = { ...(norm(trEn.title) ? { title: norm(trEn.title) } : {}), ...(norm(trEn.description) ? { description: norm(trEn.description) } : {}) };
        }
        if (norm(trDe.title) || norm(trDe.description)) {
            translations.de = { ...(norm(trDe.title) ? { title: norm(trDe.title) } : {}), ...(norm(trDe.description) ? { description: norm(trDe.description) } : {}) };
        }
        if (norm(trHr.title) || norm(trHr.description)) {
            translations.hr = { ...(norm(trHr.title) ? { title: norm(trHr.title) } : {}), ...(norm(trHr.description) ? { description: norm(trHr.description) } : {}) };
        }

        const resolvedLongDescription =
            typeof overrides.longDescription === 'string'
                ? overrides.longDescription
                : longDescription;
        const normalizedLongDescription = resolvedLongDescription.slice(0, LONG_DESCRIPTION_LIMIT);
        const trimmedLongDescription = normalizedLongDescription.trim();
        if (trimmedLongDescription.length < MIN_LONG_DESCRIPTION) {
            setToast({
                message: tApp(
                    'creator.longDescriptionTooShort',
                    { min: MIN_LONG_DESCRIPTION },
                    `Detailed overview should have at least ${MIN_LONG_DESCRIPTION} characters.`,
                ),
                type: 'error',
            });
            setSaving(false);
            return;
        }

        const resolvedScreens = Array.isArray(overrides.screenshotUrls)
            ? overrides.screenshotUrls
            : screenshotUrls;
        const processedScreens = resolvedScreens.map((url) =>
            typeof url === 'string' ? normalizeScreenshotInput(url) : '',
        );
        const hasInvalidScreenshot = processedScreens.some(
            (url) => Boolean(url) && !isValidScreenshotUrl(url),
        );
        if (hasInvalidScreenshot) {
            setToast({
                message: tApp(
                    'creator.screenshotsInvalidToast',
                    undefined,
                    'Provjeri da URL-ovi snimaka započinju s https:// i pokušaj ponovno.',
                ),
                type: 'error',
            });
            setSaving(false);
            return;
        }
        const normalizedScreens = processedScreens
            .filter((url) => Boolean(url) && isValidScreenshotUrl(url))
            .slice(0, SCREENSHOT_FIELD_COUNT);

        const body: any = {
            title,
            description,
            longDescription: trimmedLongDescription,
            screenshotUrls: normalizedScreens,
            tags: parsedTags,
            visibility,
            accessMode,
            maxConcurrentPins: maxPins,
            authorUid: user?.uid,
            capabilities: {
                storage: { roomsMode },
            },
            ...overrides,
            ...(Object.keys(translations).length ? { translations } : {}),
        };
        const parsedPrice =
            typeof overrides.price === 'number' ? overrides.price : Number(price);
        if (!isNaN(parsedPrice)) {
            if (parsedPrice < priceMin || parsedPrice > priceMax) {
                setToast({
                    message: `Price must be between ${priceMin} and ${priceMax}`,
                    type: 'error',
                });
                setSaving(false);
                return;
            }
            body.price = parsedPrice;
        }
        if ('pin' in overrides) body.pin = overrides.pin;

        try {
            const res = await fetch(`${PUBLIC_API_URL}/listing/${item.slug}`, {
                method: 'PATCH',
                headers: await buildHeaders(true),
                credentials: 'include',
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`PATCH failed ${res.status}: ${txt}`);
            }
            const json = await res.json();
            if (json?.ok) {
                setItem(json.item);
                if (typeof json.item?.price === 'number') setPrice(String(json.item.price));
                if (overrides.visibility) setVisibility(overrides.visibility);
                if (overrides.accessMode) setAccessMode(overrides.accessMode);
                if ('pin' in overrides) setPin(json.item?.pin ?? '');
                setLongDescription((json.item?.longDescription ?? '').slice(0, LONG_DESCRIPTION_LIMIT));
                const updatedScreens = Array.isArray(json.item?.screenshotUrls) ? json.item.screenshotUrls : [];
                setScreenshotUrls(normalizeScreenshotState(updatedScreens));
                if (typeof overrides.title === 'string') setTitle(overrides.title);
                if (typeof overrides.description === 'string') setDescription(overrides.description);
                if (Array.isArray(overrides.tags)) setTags(overrides.tags.join(', '));
                if (typeof overrides.maxConcurrentPins === 'number') setMaxPins(overrides.maxConcurrentPins);
                const updatedRoomsMode =
                    (json.item?.capabilities?.storage?.roomsMode as RoomsMode | undefined) ?? roomsMode;
                setRoomsMode(updatedRoomsMode);
                setToast({ message: 'Changes saved successfully!', type: 'success' });
            } else {
                throw new Error(json?.error || 'Failed to save changes');
            }
        } catch (err: any) {
            handleFetchError(err, 'Failed to save changes');
            setToast({
                message: 'Failed to save changes. Please check the API URL and server status.',
                type: 'error',
            });
        } finally {
            setSaving(false);
        }
    };

    const onToggleVisibility = async () => {
        if (!item) return;
        const next = visibility === 'public' ? 'unlisted' : 'public';
        await onSave({ visibility: next });
    };

    const onToggleState = async () => {
        if (!item) return;
        const next = appState === 'active' ? 'inactive' : 'active';
        try {
            const res = await fetch(`${PUBLIC_API_URL}/app/${item.slug}/state`, {
                method: 'PATCH',
                headers: await buildHeaders(true),
                credentials: 'include',
                body: JSON.stringify({ state: next }),
            });
            if (!res.ok) throw new Error(`PATCH failed ${res.status}`);
            const json = await res.json();
            if (json?.ok) {
                setAppState(next);
                setItem((prev) => (prev ? { ...prev, state: next } : prev));
                setToast({
                    message: next === 'inactive' ? 'App deactivated' : 'App activated',
                    type: 'success',
                });
            } else {
                throw new Error(json?.error || 'Failed to toggle state');
            }
        } catch (err: any) {
            handleFetchError(err, 'Failed to toggle state');
            setToast({
                message: 'Failed to toggle state. Please check the API URL and server status.',
                type: 'error',
            });
        }
    };

    const performDelete = async (hard: boolean) => {
        if (!item || !canEdit) return;
        if (deleting) return;

        setDeleting(true);
        try {
            const res = await fetch(`${PUBLIC_API_URL}/listing/${item.slug}?hard=${hard ? 'true' : 'false'}`, {
                method: 'DELETE',
                headers: await buildHeaders(false),
                credentials: 'include',
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`DELETE failed ${res.status}: ${txt}`);
            }
            const json = await res.json();
            if (json?.ok) {
                setToast({ message: 'App deleted successfully', type: 'success' });
                setTimeout(() => router.push('/my?deleted=1'), 1000);
            } else {
                throw new Error(json?.error || 'Failed to delete app');
            }
        } catch (err: any) {
            handleFetchError(err, 'Failed to delete app');
            setToast({
                message: 'Failed to delete app. Please check the API URL and server status.',
                type: 'error',
            });
        } finally {
            setDeleting(false);
            setShowSoftDialog(false);
            setShowHardDialog(false);
        }
    };

    const copyLink = useCallback(() => {
        if (!item) return;
        const url = new URL(playHref(item.id), window.location.origin);
        navigator.clipboard.writeText(url.toString()).then(() => {
            setCopySuccess(true);
            setToast({ message: 'Link copied to clipboard!', type: 'success' });
            setTimeout(() => setCopySuccess(false), 2000);
        });
    }, [item]);

    const submitReport = useCallback(async () => {
        if (!item) return;
        const msg = reportText.trim();
        if (msg.length < 10) {
            setToast({ message: 'Molimo opišite problem (min 10 znakova).', type: 'error' });
            return;
        }
        setReportBusy(true);
        try {
            const res = await fetch(`${PUBLIC_API_URL}/listing/${encodeURIComponent(item.slug)}/report-issue`, {
                method: 'POST',
                headers: await buildHeaders(true),
                credentials: 'include',
                body: JSON.stringify({ reason: msg }),
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`http_${res.status}:${txt}`);
            }
            setToast({ message: 'Hvala! Zaprimili smo prijavu.', type: 'success' });
            setShowReport(false);
            setReportText('');
        } catch (e) {
            handleFetchError(e, 'Slanje prijave nije uspjelo');
            setToast((t) => t ?? { message: 'Neuspješno slanje prijave. Provjerite mrežu/API.', type: 'error' });
        } finally {
            setReportBusy(false);
        }
    }, [item, reportText, buildHeaders]);

    const submitContentReport = useCallback(async () => {
        if (!item || !viewerUid) return;
        const msg = contentReportText.trim();
        if (msg.length < 10) {
            setToast({ message: 'Molimo opišite razlog (min 10 znakova).', type: 'error' });
            return;
        }
        setContentReportBusy(true);
        try {
            const res = await fetch(`${PUBLIC_API_URL}/listing/${encodeURIComponent(item.slug)}/report-content`, {
                method: 'POST',
                headers: await buildHeaders(true),
                credentials: 'include',
                body: JSON.stringify({ description: msg }),
            });
            const json = await res.json().catch(() => null);
            if (res.status === 404) {
                setToast({ message: 'Ova aplikacija više nije dostupna za prijavu.', type: 'error' });
                return;
            }
            if (res.status === 429 || json?.error === 'already_reported') {
                setToast({ message: 'Već ste prijavili ovaj sadržaj. Hvala!', type: 'info' });
                return;
            }
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || `http_${res.status}`);
            }
            setToast({ message: 'Prijava je zaprimljena. Hvala vam!', type: 'success' });
            setContentReportText('');
            setShowContentReport(false);
        } catch (err) {
            handleFetchError(err, 'Neuspješna prijava sadržaja');
            setToast({
                message: 'Nismo uspjeli poslati prijavu. Pokušajte ponovno.',
                type: 'error',
            });
        } finally {
            setContentReportBusy(false);
        }
    }, [item, viewerUid, contentReportText, buildHeaders]);

    useEffect(() => {
        try {
            if (
                !hasFetched ||
                item !== null ||
                !normalizedSlug ||
                !PUBLIC_APPS_HOST ||
                !/^https?:\/\//i.test(String(PUBLIC_APPS_HOST))
            ) {
                return;
            }
            const dest = `${String(PUBLIC_APPS_HOST).replace(/\/+$/, '')}/apps/${encodeURIComponent(normalizedSlug)}`;
            if (typeof window !== 'undefined') {
                window.location.replace(dest);
            }
        } catch (e) {
            // ignore
        }
    }, [hasFetched, item, normalizedSlug]);

    return {
        item,
        loading,
        fetchError,
        hasFetched,
        saving,
        copySuccess,
        toast,
        setToast,
        authorHandle,
        playListing,
        title,
        setTitle,
        description,
        setDescription,
        longDescription,
        setLongDescription,
        handleLongDescriptionChange,
        screenshotUrls,
        screenshotStates,
        screenshotVersions,
        handleScreenshotFileInput,
        handleScreenshotRemove,
        screenshotInputRefs,
        customAssetDrafts,
        customAssetLoading,
        customAssetError,
        customAssetSaving,
        customAssetProgress,
        customAssetInputRef,
        assetFileInputRefs,
        handleCustomAssetInput,
        loadCustomAssets,
        handleCustomAssetRemove,
        handleCustomAssetNameChange,
        handleCustomAssetReplace,
        handleCustomAssetSave,
        resetCustomAssets,
        trEn, setTrEn,
        trDe, setTrDe,
        trHr, setTrHr,
        tags, setTags,
        price, setPrice,
        priceMin, priceMax,
        visibility, setVisibility,
        accessMode, setAccessMode,
        pin, setPin,
        maxPins, setMaxPins,
        roomsMode, setRoomsMode,
        appState, setAppState,
        sessions,
        refreshingSessions,
        lastSessionsRefresh,
        loadSessions,
        revokeSession,
        rotatePin,
        rotatingPin,
        showSoftDialog, setShowSoftDialog,
        showHardDialog, setShowHardDialog,
        deleting,
        performDelete,
        liked,
        likeCount,
        likeBusy,
        toggleLike,
        previewChoice,
        selectedPreset,
        handlePresetSelect,
        customPreview,
        handleCustomPreview,
        resetCustomPreview,
        previewBusy,
        previewError,
        previewApplied,
        previewDisplayFailed,
        setPreviewDisplayFailed,
        setPreviewApplied,
        setPreviewError,
        applySelectedPreview,
        previewInputRef,
        presetOverlay,
        setPresetOverlay,
        activePreviewSrc,
        activeOverlayLabel,
        presetOverlayLabel,
        useEditorPreview,
        overlayMaxChars,
        maxPreviewMb,
        screenshotMaxMb,
        maxCustomAssetKb,
        showPayModal, setShowPayModal,
        showLoginPrompt, setShowLoginPrompt,
        isAdmin,
        showReport, setShowReport,
        reportText, setReportText,
        reportBusy,
        submitReport,
        showContentReport, setShowContentReport,
        contentReportText, setContentReportText,
        contentReportBusy,
        submitContentReport,
        viewerHandle,
        canEdit,
        canMonetize,
        canViewUnpublished,
        canReportContent,
        isPublished,
        relativeCreated,
        allowed,
        onSave,
        onToggleVisibility,
        onToggleState,
        copyLink,
        tApp,
        user,
        router,
        startStripeOnboarding,
    };
}
