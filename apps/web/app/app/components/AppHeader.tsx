'use client';

import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { useTheme } from '@/components/ThemeProvider';
import { useAppDetails } from '../hooks/useAppDetails';

type AppHeaderProps = {
    details: ReturnType<typeof useAppDetails>;
};

export default function AppHeader({ details }: AppHeaderProps) {
    const { isDark } = useTheme();
    const {
        item,
        authorHandle,
        relativeCreated,
        liked,
        likeCount,
        likeBusy,
        toggleLike,
        playListing,
        copySuccess,
        copyLink,
        canEdit,
        appState,
        visibility,
        user,
        allowed,
        setShowLoginPrompt,
        setShowPayModal,
        tApp,
        showReport,
        setShowReport,
        onToggleState,
    } = details;

    if (!item) return null;

    const isNew = Date.now() - (item.createdAt ?? 0) < 1000 * 60 * 60 * 24 * 7;
    const isHot = (item.likesCount || 0) > 100;

    return (
        <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className={`text-3xl md:text-4xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {item.title}
                        </h1>
                        {isNew && (
                            <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold animate-pulse shadow-lg shadow-emerald-500/30">
                                NEW
                            </span>
                        )}
                        {isHot && (
                            <span className="px-3 py-1 rounded-full bg-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-500/30">
                                🔥 HOT
                            </span>
                        )}
                        {visibility === 'unlisted' && (
                            <span className="px-3 py-1 rounded-full bg-gray-700 text-white text-xs font-bold">
                                UNLISTED
                            </span>
                        )}
                        {appState === 'inactive' && (
                            <span className="px-3 py-1 rounded-full bg-red-600 text-white text-xs font-bold">
                                INACTIVE
                            </span>
                        )}
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-900 text-white'
                            }`}>
                            {typeof item.price === 'number' && item.price > 0
                                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.price) + '/mo'
                                : 'FREE'}
                        </span>
                    </div>

                    <div className={`flex flex-wrap items-center gap-4 text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                        {item.author && (
                            <div className="flex items-center gap-2">
                                {item.author.photo && (
                                    <Link href={authorHandle ? `/u/${authorHandle}` : '#'}>
                                        <Avatar
                                            uid={item.author.uid}
                                            src={item.author.photo}
                                            name={item.author.name}
                                            size={24}
                                        />
                                    </Link>
                                )}
                                <span>
                                    by{' '}
                                    {authorHandle ? (
                                        <Link
                                            href={`/u/${authorHandle}`}
                                            className={`font-medium hover:underline ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}
                                        >
                                            @{authorHandle}
                                        </Link>
                                    ) : (
                                        <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>
                                            {item.author.name || 'Anonymous'}
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}
                        {item.createdAt && (
                            <>
                                <span className="opacity-50">•</span>
                                <time title={new Date(item.createdAt).toLocaleString()}>
                                    {relativeCreated || ''}
                                </time>
                            </>
                        )}
                        {typeof item.playsCount === 'number' && (
                            <>
                                <span className="opacity-50">•</span>
                                <span>Plays: {item.playsCount}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        id="like-button"
                        onClick={toggleLike}
                        disabled={likeBusy}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200 ${liked
                                ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20'
                                : isDark
                                    ? 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            } ${likeBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <svg className="w-5 h-5" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <span className="font-medium">{likeCount}</span>
                    </button>

                    {!user ? (
                        <button
                            onClick={() => setShowLoginPrompt(true)}
                            className="px-6 py-2.5 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all hover:scale-105"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                {tApp('playNow')}
                            </span>
                        </button>
                    ) : item.price && !allowed ? (
                        <button
                            onClick={() => setShowPayModal(true)}
                            className={`px-6 py-2.5 rounded-full font-medium cursor-not-allowed ${isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-200 text-gray-500'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                {tApp('playNow')}
                            </span>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={playListing}
                            className="px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg shadow-emerald-500/30 transform hover:scale-105"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                {tApp('playNow')}
                            </span>
                        </button>
                    )}

                    <button
                        onClick={copyLink}
                        className={`px-4 py-2.5 rounded-full border transition-all duration-200 ${copySuccess
                                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500'
                                : isDark
                                    ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300'
                                    : 'border-gray-300 hover:bg-gray-50 text-gray-700'
                            }`}
                    >
                        {copySuccess ? (
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Copied!
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy Link
                            </span>
                        )}
                    </button>

                    {canEdit && (
                        <>
                            <Link
                                href={`/create?slug=${item.slug}`}
                                className={`px-4 py-2.5 rounded-full border transition-all duration-200 ${isDark
                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                Update Version
                            </Link>
                            <button
                                onClick={onToggleState}
                                className={`px-4 py-2.5 rounded-full border transition-all duration-200 ${isDark
                                        ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {appState === 'active' ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                                onClick={() => setShowReport(true)}
                                className={`px-4 py-2.5 rounded-full border transition-all duration-200 ${isDark
                                        ? 'border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                                        : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                                    }`}
                                title="Report an issue"
                            >
                                Report Issue
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
