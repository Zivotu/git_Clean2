import { useRef } from 'react';
import { Search, RefreshCcw } from 'lucide-react';
import LocaleSwitcher from '@/components/LocaleSwitcher';

type HomeStickyHeaderProps = {
    isDark: boolean;
    search: string;
    setSearch: (value: string) => void;
    searchInputRef: React.RefObject<HTMLInputElement | null>;
    searchPlaceholder: string;
    searchStatsText: string;
    handleRefreshClick: () => void;
    isLoadingListings: boolean;
    refreshLabel: string;
};

export default function HomeStickyHeader({
    isDark,
    search,
    setSearch,
    searchInputRef,
    searchPlaceholder,
    searchStatsText,
    handleRefreshClick,
    isLoadingListings,
    refreshLabel,
}: HomeStickyHeaderProps) {
    return (
        <div
            className={`sticky top-20 z-10 mb-1 rounded-2xl border backdrop-blur-sm transition-colors duration-300 ${isDark ? 'border-[#27272A] bg-[#09090B]/80' : 'border-slate-200 bg-white/90 shadow-sm'
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
    );
}
