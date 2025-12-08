import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playHref } from '@/lib/urls';
import { type BetaApp, type ListingLabels } from '@/components/BetaAppCard';

type TrendingSectionProps = {
    isDark: boolean;
    trendingCountLabel: string;
    trendingSlides: BetaApp[][];
    trendingIndex: number;
    listingLabels: ListingLabels;
    tHome: (key: string) => string;
    tBeta: (key: string, fallback: string) => string;
};

export default function TrendingSection({
    isDark,
    trendingCountLabel,
    trendingSlides,
    trendingIndex,
    listingLabels,
    tHome,
    tBeta,
}: TrendingSectionProps) {
    return (
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
                        className={`absolute inset-0 transition-opacity duration-700 ${slideIdx === trendingIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                    >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {slide.map((app) => (
                                <TrendingCard key={app.id} app={app} isDark={isDark} labels={listingLabels} />
                            ))}
                        </div>
                    </div>
                ))}
                {!trendingSlides.length && (
                    <div className="text-sm text-center text-zinc-500">
                        {tBeta('trending.empty', 'No trending apps yet.')}
                    </div>
                )}
            </div>
        </section>
    );
}

function TrendingCard({
    app,
    isDark,
    labels,
}: {
    app: BetaApp;
    isDark: boolean;
    labels: ListingLabels;
}) {
    const [authorProfile, setAuthorProfile] = useState<{
        name: string;
        handle?: string;
        photo?: string;
    } | null>(null);

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
                            photo: data.photoURL || data.photo || app.authorPhoto,
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
                    <span className="rounded-full bg-black/40 px-1 text-[9px] font-semibold">
                        {labels.free}
                    </span>
                    <span>{app.name}</span>
                </div>
            </div>
            <div className="flex flex-1 flex-col gap-1 px-3 py-3">
                <p className={`line-clamp-2 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    {app.description}
                </p>
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
