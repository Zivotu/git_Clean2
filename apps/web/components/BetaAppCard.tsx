'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Play, Heart, ArrowRight } from 'lucide-react';
import { playHref, appDetailsHref } from '@/lib/urls';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';

export type BetaApp = {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    authorId?: string; // Added for fetching fresh profile
    authorName: string;
    authorInitials: string;
    authorPhoto?: string | null;
    authorHandle?: string; // Added this line
    playsCount: number;
    likesCount: number;
    usersLabel: string;
    likesLabel: string;
    price?: number | null;
    tag?: 'trending';
    previewUrl?: string | null;
    gradientClass: string;
    tags: string[];
    createdAt: number;
    likedByMe?: boolean;
};

export type ListingLabels = {
    free: string;
    creator: string;
    play: string;
    details: string;
    trending: string;
    edit?: string;
    delete?: string;
};

export function BetaAppCard({
    app,
    isDark,
    view,
    labels,
    onDetails,
    onEdit,
    onDelete,
    showDetailsButton = true,
    showDeleteButton = true,
}: {
    app: BetaApp;
    isDark: boolean;
    view: 'grid' | 'list';
    labels: ListingLabels;
    onDetails?: (app: BetaApp) => void;
    onEdit?: (app: BetaApp) => void;
    onDelete?: (app: BetaApp) => void;
    showDetailsButton?: boolean;
    showDeleteButton?: boolean;
}) {
    const [authorProfile, setAuthorProfile] = useState<{ name: string; handle?: string; photo?: string } | null>(null);
    const [liked, setLiked] = useState(!!app.likedByMe);
    const [likesCount, setLikesCount] = useState(app.likesCount);
    const [showExplosion, setShowExplosion] = useState(false);

    useEffect(() => {
        setLiked(!!app.likedByMe);
        setLikesCount(app.likesCount);
    }, [app.likedByMe, app.likesCount]);

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

    const handleLike = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const newLiked = !liked;
        setLiked(newLiked);
        setLikesCount(prev => newLiked ? prev + 1 : prev - 1);

        if (newLiked) {
            setShowExplosion(true);
            setTimeout(() => setShowExplosion(false), 1000);
        }

        try {
            await fetch(`/api/listing/${app.slug}/like`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ like: newLiked })
            });
        } catch (err) {
            // Revert on error
            setLiked(!newLiked);
            setLikesCount(prev => !newLiked ? prev + 1 : prev - 1);
        }
    };

    const displayAuthorName = authorProfile?.name || app.authorName;
    const displayAuthorHandle = authorProfile?.handle || app.authorHandle;
    const displayAuthorPhoto = authorProfile?.photo || app.authorPhoto;

    const isList = view === 'list';
    const wrapperBase = 'group rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl';
    const playButtonClass = isDark
        ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 focus-visible:outline-emerald-500'
        : 'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-emerald-600';
    const playButton = (
        <Link
            prefetch={false}
            href={playHref(app.id, { run: 1 })}
            className={`inline-flex items-center rounded-full px-3 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${playButtonClass}`}
            aria-label={labels.play}
        >
            <Play className="h-5 w-5" />
        </Link>
    );
    const detailsButton = showDetailsButton
        ? onDetails ? (
            <button
                type="button"
                onClick={() => onDetails(app)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${isDark ? 'border-[#2F2F33] text-zinc-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                title={labels.details}
            >
                <ArrowRight className="h-3 w-3" />
                <span className="text-xs uppercase tracking-wide">{labels.details}</span>
            </button>
        ) : (
            <Link
                prefetch={false}
                href={appDetailsHref(app.slug)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${isDark ? 'border-[#2F2F33] text-zinc-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                title={labels.details}
            >
                <ArrowRight className="h-3 w-3" />
                <span className="text-xs uppercase tracking-wide">{labels.details}</span>
            </Link>
        )
        : null;
    return (
        <div
            className={`${wrapperBase} ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white shadow-sm'
                } ${isList ? 'flex items-stretch gap-6' : 'flex flex-col gap-5'}`}
        >
            <div
                className={`relative overflow-hidden rounded-[28px] ${isList ? 'h-48 w-72 flex-shrink-0' : 'h-64 w-full'
                    }`}
            >
                {app.previewUrl ? (
                    <Image
                        src={app.previewUrl}
                        alt={app.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 460px"
                        loading="lazy"
                        unoptimized
                    />
                ) : (
                    <div className={`h-full w-full bg-gradient-to-br ${app.gradientClass}`} />
                )}
                <div className="absolute inset-0 flex items-start justify-between p-4 text-[11px] text-white">
                    <div className="flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 font-medium backdrop-blur-sm">
                            <span className="rounded-full bg-black/60 px-2 text-[10px] font-semibold">{labels.free}</span>
                            <span className="text-xs uppercase tracking-wide">{app.category}</span>
                        </span>
                        {app.tag && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/80 px-3 py-1 text-[10px] font-semibold text-black">
                                {app.tag === 'trending' ? labels.trending : app.tag}
                            </span>
                        )}
                    </div>
                    {app.price && app.price > 0 && (
                        <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-semibold">€{app.price.toFixed(2)}</span>
                    )}
                </div>
                <Link
                    prefetch={false}
                    href={playHref(app.id, { run: 1 })}
                    className="absolute inset-x-6 bottom-6 flex items-center justify-center gap-2 rounded-2xl bg-black/70 px-5 py-3 text-sm font-semibold text-white opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                >
                    <Play className="h-4 w-4" />
                    <span>{labels.play}</span>
                </Link>
            </div>
            <div className="flex flex-1 flex-col justify-between gap-5">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-zinc-50' : 'text-slate-900'}`}>{app.name}</h3>
                        <p className={`mt-2 line-clamp-3 text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{app.description}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {app.tags.map((tag) => (
                                <span key={tag} className={`rounded-full px-3 py-1 text-xs font-semibold ${isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-slate-100 text-slate-600'}`}>
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mt-2 flex flex-col gap-4 text-base md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        {app.authorHandle ? (
                            <Link
                                href={`/u/${displayAuthorHandle}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-3 hover:underline"
                            >
                                {displayAuthorPhoto ? (
                                    <Image
                                        src={displayAuthorPhoto}
                                        alt={displayAuthorName}
                                        width={40}
                                        height={40}
                                        className="h-10 w-10 rounded-full object-cover"
                                        loading="lazy"
                                        sizes="40px"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#A855F7] to-[#22C55E] text-[12px] font-bold text-white">
                                        {app.authorInitials}
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className={`text-sm font-semibold ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>{displayAuthorName}</span>
                                    <span className={`text-xs tracking-wide ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>{displayAuthorHandle ? `@${displayAuthorHandle}` : labels.creator}</span>
                                </div>
                            </Link>
                        ) : (
                            <>
                                {displayAuthorPhoto ? (
                                    <Image
                                        src={displayAuthorPhoto}
                                        alt={displayAuthorName}
                                        width={40}
                                        height={40}
                                        className="h-10 w-10 rounded-full object-cover"
                                        loading="lazy"
                                        sizes="40px"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#A855F7] to-[#22C55E] text-[12px] font-bold text-white">
                                        {app.authorInitials}
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className={`text-sm font-semibold ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>{displayAuthorName}</span>
                                    <span className={`text-xs tracking-wide ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>{displayAuthorHandle ? `@${displayAuthorHandle}` : labels.creator}</span>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-4 md:justify-end">
                        <div className="flex items-center gap-4 text-sm font-semibold">
                            <button
                                onClick={handleLike}
                                className="relative inline-flex items-center gap-2 text-base transition-transform active:scale-95"
                            >
                                <Heart
                                    className={`h-5 w-5 transition-colors ${liked ? 'fill-rose-500 text-rose-500' : 'text-rose-400'}`}
                                />
                                <span className={`${liked ? 'text-rose-500' : 'text-rose-400'}`}>
                                    {likesCount === app.likesCount ? app.likesLabel : likesCount}
                                </span>
                                <AnimatePresence>
                                    {showExplosion && (
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                            {[...Array(8)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                                                    animate={{
                                                        opacity: 0,
                                                        scale: 1.5,
                                                        x: Math.cos(i * 45 * (Math.PI / 180)) * 40,
                                                        y: Math.sin(i * 45 * (Math.PI / 180)) * 40
                                                    }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                                >
                                                    <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </AnimatePresence>
                            </button>
                            <span className="inline-flex items-center gap-2 text-emerald-400 text-base">
                                <Play className="h-5 w-5" />
                                {app.usersLabel}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 min-[420px]:flex-nowrap">
                            {detailsButton}
                            {playButton}
                            {onEdit && (
                                <button
                                    type="button"
                                    onClick={() => onEdit(app)}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${isDark ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-950/50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    {labels.edit || 'Edit'}
                                </button>
                            )}
                            {showDeleteButton && onDelete && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(app)}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${isDark ? 'border-red-900 text-red-400 hover:bg-red-950/50' : 'border-red-300 text-red-700 hover:bg-red-50'
                                        }`}
                                >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    {labels.delete || 'Delete'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
