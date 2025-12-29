import Link from 'next/link';
import Image from 'next/image';
import { Rocket, HelpCircle, Clock, LayoutDashboard, User, Play, ArrowRight, Sparkles } from 'lucide-react';
import { playHref, appDetailsHref } from '@/lib/urls';
import { type BetaApp, type ListingLabels } from '@/components/BetaAppCard';
import NeonWorkshopButton from '@/app/components/NeonWorkshopButton';


type HomeHeroProps = {
    isDark: boolean;
    heroBadgeText: string;
    tHome: (key: string) => string;
    tBeta: (key: string, fallback?: string) => string;
    tNav: (key: string) => string;
    randomApp: BetaApp | null;
    randomPickLabel: string;
    curatedLabel: string;
    listingLabels: ListingLabels;
    randomPickDetailsLabel: string;
    heroAppsLine: string;
    heroCardDescription: string;
    heroCardAppsStat: string;
    heroCardFavoritesStat: string;
};

export default function HomeHero({
    isDark,
    heroBadgeText,
    tHome,
    tBeta,
    tNav,
    randomApp,
    randomPickLabel,
    curatedLabel,
    listingLabels,
    randomPickDetailsLabel,
    heroAppsLine,
    heroCardDescription,
    heroCardAppsStat,
    heroCardFavoritesStat,
}: HomeHeroProps) {
    return (
        <section
            className={`overflow-hidden rounded-3xl border transition-colors duration-300 ${isDark
                ? 'border-[#27272A] bg-gradient-to-br from-[#020617] via-[#18181B] to-[#4C1D95]'
                : 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-violet-100'
                }`}
        >
            <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:py-4">
                <div className="flex-1">
                    <div
                        className={`mb-1 inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium backdrop-blur ${isDark
                            ? 'bg-black/10 text-zinc-200'
                            : 'bg-white/50 text-slate-700 shadow-sm border border-slate-200/50'
                            }`}
                    >
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#A855F7]/80 text-[9px]">
                            <Rocket className="h-3 w-3" />
                        </span>
                        <span className="uppercase tracking-wide">{heroBadgeText}</span>
                    </div>
                    <h1
                        className={`text-3xl font-semibold leading-tight md:text-4xl ${isDark ? 'text-white' : 'text-slate-900'
                            }`}
                    >
                        {tHome('headline.one')}{' '}
                        <span className="text-emerald-400">{tHome('headline.two')}</span>
                    </h1>
                    <p
                        className={`mt-1 max-w-2xl text-base ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}
                    >
                        {tHome('tagline') || 'Curirani marketplace s tisućama mini aplikacija, igara i utilsa.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                        <Link
                            href="/create"
                            className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 ${isDark ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-emerald-500 hover:bg-emerald-600'
                                }`}
                        >
                            <Rocket className="h-4 w-4" />
                            <span>{tHome('publish') || 'Objavi Aplikaciju'}</span>
                        </Link>
                        <Link
                            href="/tutorial"
                            className={`inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition-colors ${isDark
                                ? 'border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            <HelpCircle className="h-4 w-4" />
                            <span>{tNav('tutorials') || 'Vodiči'}</span>
                        </Link>
                        {/* <NeonWorkshopButton
                            label={tBeta('Workshop.button', 'PRIJAVI SE NA TRENING')}
                            href="/workshop"
                            isDark={isDark}
                        /> */}
                    </div>

                    {/* 3 Steps Visual */}
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {[
                            {
                                title: tBeta('steps.1.title', '1. Opiši ideju'),
                                desc: tBeta('steps.1.desc', 'Opiši ideju u Google AI Studiju ili ChatGPT-u.'),
                                icon: (
                                    <div className="flex items-center gap-1.5 text-emerald-500">
                                        <Clock className="h-4 w-4" />
                                        <span className="text-sm font-bold">5 min</span>
                                    </div>
                                ),
                            },
                            {
                                title: tBeta('steps.2.title', '2. Kopiraj kod'),
                                desc: tBeta('steps.2.desc', 'Preuzmi generirani kod ili ZIP paket.'),
                                icon: (
                                    <div className="flex items-center gap-1.5 text-emerald-500">
                                        <Clock className="h-4 w-4" />
                                        <span className="text-sm font-bold">1 min</span>
                                    </div>
                                ),
                            },
                            {
                                title: tBeta('steps.3.title', '3. Objavi'),
                                desc: tBeta('steps.3.desc', 'Zalijepi (ili uploadaj) i objavi na Thesari.'),
                                icon: (
                                    <div className="flex items-center gap-1.5 text-emerald-500">
                                        <Clock className="h-4 w-4" />
                                        <span className="text-sm font-bold">2 min</span>
                                    </div>
                                ),
                            },
                        ].map((step, idx) => (
                            <div
                                key={idx}
                                className={`rounded-xl border p-3 ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-slate-100 bg-slate-50/50'
                                    }`}
                            >
                                <div className="mb-2">{step.icon}</div>
                                <div className={`font-semibold ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                                    {step.title}
                                </div>
                                <div className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                                    {step.desc}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-4 lg:ml-12 lg:w-[420px] lg:self-stretch">
                    <div className="relative h-48 w-full">
                        <div
                            className="absolute inset-0 rounded-[1.75rem] bg-gradient-to-br from-[#A855F7]/40 via-[#22C55E]/30 to-transparent blur-2xl"
                            aria-hidden="true"
                        />
                        <div
                            className={`relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border p-3 text-sm shadow-lg transition-colors duration-300 ${isDark ? 'border-[#27272A] bg-[#020617]/90' : 'border-slate-200 bg-white'
                                }`}
                        >
                            {randomApp ? (
                                <div className="flex h-full gap-3">
                                    <div className="flex flex-1 flex-col justify-between gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">
                                                    {randomPickLabel}
                                                </p>
                                                <span className="text-xs text-slate-500 dark:text-zinc-500">
                                                    {randomApp.category}
                                                </span>
                                            </div>
                                            <span
                                                className={`rounded-full px-2 py-1 text-[11px] font-medium ${isDark
                                                    ? 'bg-emerald-500/10 text-emerald-400'
                                                    : 'bg-emerald-50 text-emerald-600'
                                                    }`}
                                            >
                                                {curatedLabel}
                                            </span>
                                        </div>
                                        <div>
                                            <h3
                                                className={`text-base font-semibold ${isDark ? 'text-zinc-50' : 'text-slate-900'
                                                    }`}
                                            >
                                                {randomApp.name}
                                            </h3>
                                            <p
                                                className={`mt-1 line-clamp-2 text-xs ${isDark ? 'text-zinc-400' : 'text-slate-600'
                                                    }`}
                                            >
                                                {randomApp.description}
                                            </p>
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
                                            <div
                                                className={`h-full w-full bg-gradient-to-br ${randomApp.gradientClass}`}
                                            />
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
                                                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                                                    {heroAppsLine}
                                                </p>
                                            </div>
                                        </div>
                                        <span
                                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${isDark
                                                ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-emerald-50 text-emerald-600'
                                                }`}
                                        >
                                            {curatedLabel}
                                        </span>
                                    </div>
                                    <div className="space-y-2 text-xs">
                                        <p className={isDark ? 'text-zinc-300' : 'text-slate-600'}>
                                            {heroCardDescription}
                                        </p>
                                        <div className="flex items-center gap-2 text-[11px]">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${isDark ? 'bg-[#18181B] text-zinc-300' : 'bg-slate-100 text-slate-700'
                                                    }`}
                                            >
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                                {heroCardAppsStat}
                                            </span>
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${isDark ? 'bg-[#18181B] text-zinc-300' : 'bg-slate-100 text-slate-700'
                                                    }`}
                                            >
                                                <User className="h-3 w-3" />
                                                {heroCardFavoritesStat}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Compact Promotion Warning Banner */}
                    <div
                        className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 text-sm leading-tight ${isDark
                            ? 'border-amber-900/50 bg-amber-900/10 text-amber-200/80'
                            : 'border-amber-200 bg-amber-50 text-amber-900/80'
                            }`}
                    >
                        <div
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600'
                                }`}
                        >
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <p>
                            {tHome('promotionWarning') ||
                                'To qualify for the three months if you are among the first 100 users, you must publish one application within 15 days of registration.'}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
