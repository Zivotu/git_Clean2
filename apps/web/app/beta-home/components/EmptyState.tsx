import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';

type EmptyStateProps = {
    isDark: boolean;
    noResultsText: string;
    noResultsSecondary: string;
    hasActiveFilters: boolean;
    clearFiltersLabel: string;
    clearFilters: () => void;
    noResultsCtaHref: string;
    handleSubmitClick: () => void;
    noResultsCtaLabel: string;
};

export default function EmptyState({
    isDark,
    noResultsText,
    noResultsSecondary,
    hasActiveFilters,
    clearFiltersLabel,
    clearFilters,
    noResultsCtaHref,
    handleSubmitClick,
    noResultsCtaLabel,
}: EmptyStateProps) {
    return (
        <div
            className={`col-span-full flex flex-col items-center justify-center rounded-2xl border bg-opacity-50 px-6 py-12 text-center text-sm ${isDark ? 'border-[#27272A] bg-[#09090B]' : 'border-slate-200 bg-white'
                }`}
        >
            <div className="relative mb-6 h-40 w-40 opacity-90">
                <Image
                    src="/Robo_ups_t.png"
                    alt="No results found"
                    fill
                    className="object-contain"
                    unoptimized
                />
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>
                {noResultsText}
            </h3>
            <p className={`mt-2 max-w-sm text-sm ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                {noResultsSecondary}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={clearFilters}
                        className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all hover:scale-105 ${isDark ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                        <X className="h-4 w-4" />
                        {clearFiltersLabel}
                    </button>
                )}
                <Link
                    prefetch={false}
                    href={noResultsCtaHref}
                    onClick={noResultsCtaHref === '/create' ? handleSubmitClick : undefined}
                    className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:scale-105 hover:shadow-emerald-500/25 ${isDark ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        }`}
                >
                    <span>{noResultsCtaLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}
