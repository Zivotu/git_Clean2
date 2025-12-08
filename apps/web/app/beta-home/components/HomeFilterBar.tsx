import { Cat, Minus, Plus, LayoutGrid, Rows, X } from 'lucide-react';

type HomeFilterBarProps = {
    isDark: boolean;
    filters: string[];
    activeFilter: string;
    setActiveFilter: (filter: string) => void;
    filterLabelMap: Record<string, string>;
    heroMetrics: { id: string; value: string; label: string }[];
    liveUsageLabel: string;
    gridLabel: string;
    changeGridColumns: (delta: number) => void;
    canDecreaseColumns: boolean;
    canIncreaseColumns: boolean;
    isGridView: boolean;
    cardsPerRow: number;
    view: 'grid' | 'list';
    setView: (view: 'grid' | 'list') => void;
    gridDecreaseAria: string;
    gridIncreaseAria: string;
    sortSelectLabel: string;
    sortBy: 'new' | 'popular' | 'title';
    setSortBy: (sort: 'new' | 'popular' | 'title') => void;
    sortLabels: Record<'new' | 'popular' | 'title', string>;
    hasActiveFilters: boolean;
    clearFilters: () => void;
    clearFiltersLabel: string;
    visibleTags: { key: string; label: string }[];
    selectedTags: string[];
    toggleTag: (tag: string) => void;
    hiddenTagCount: number;
    search: string;
    setSearch: (value: string) => void;
};

export default function HomeFilterBar({
    isDark,
    filters,
    activeFilter,
    setActiveFilter,
    filterLabelMap,
    heroMetrics,
    liveUsageLabel,
    gridLabel,
    changeGridColumns,
    canDecreaseColumns,
    canIncreaseColumns,
    isGridView,
    cardsPerRow,
    view,
    setView,
    gridDecreaseAria,
    gridIncreaseAria,
    sortSelectLabel,
    sortBy,
    setSortBy,
    sortLabels,
    hasActiveFilters,
    clearFilters,
    clearFiltersLabel,
    visibleTags,
    selectedTags,
    toggleTag,
    hiddenTagCount,
    search,
    setSearch,
}: HomeFilterBarProps) {
    return (
        <div className="space-y-4">
            <section className="mt-2 flex items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-1 overflow-x-auto pb-1 text-sm">
                    {filters.map((filter) => {
                        const isActive = activeFilter === filter;
                        return (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`whitespace-nowrap rounded-full border px-3 py-1.5 transition-all duration-300 ${isActive
                                        ? isDark
                                            ? 'border-[#A855F7] bg-[#A855F7]/20 text-zinc-50 shadow-sm'
                                            : 'border-[#A855F7] bg-[#A855F7]/10 text-slate-900 shadow-sm'
                                        : isDark
                                            ? 'border-[#27272A] bg-[#18181B] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100'
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800'
                                    }`}
                            >
                                {filterLabelMap[filter] ?? filter}
                            </button>
                        );
                    })}
                </div>
                <div className="hidden items-center gap-2 text-sm md:flex">
                    <div className="flex items-center gap-1">
                        {heroMetrics.map((metric) => (
                            <span
                                key={metric.id}
                                title={metric.label}
                                aria-label={metric.label}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${isDark
                                        ? 'border-[#27272A] bg-[#18181B] text-zinc-200'
                                        : 'border-slate-200 bg-white text-slate-700'
                                    }`}
                            >
                                <Cat className="h-3 w-3 text-emerald-400" />
                                <span>{metric.value}</span>
                            </span>
                        ))}
                    </div>
                    <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-400' : 'border-slate-200 bg-white text-slate-500'
                            }`}
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>{liveUsageLabel}</span>
                    </span>
                    <div
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${isDark ? 'border-[#27272A] bg-[#18181B] text-zinc-300' : 'border-slate-200 bg-white text-slate-600'
                            } ${!isGridView ? 'opacity-60' : ''}`}
                    >
                        <span className="text-[10px] uppercase tracking-wide">{gridLabel}</span>
                        <button
                            type="button"
                            onClick={() => changeGridColumns(-1)}
                            disabled={!canDecreaseColumns || !isGridView}
                            className="rounded-full border border-transparent p-1 transition hover:border-emerald-500 hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={gridDecreaseAria}
                        >
                            <Minus className="h-3 w-3" />
                        </button>
                        <span>x{cardsPerRow}</span>
                        <button
                            type="button"
                            onClick={() => changeGridColumns(1)}
                            disabled={!canIncreaseColumns || !isGridView}
                            className="rounded-full border border-transparent p-1 transition hover:border-emerald-500 hover:text-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={gridIncreaseAria}
                        >
                            <Plus className="h-3 w-3" />
                        </button>
                    </div>
                    <div
                        className={`inline-flex items-center rounded-full border px-1 py-0.5 ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white'
                            }`}
                    >
                        <button
                            onClick={() => setView('grid')}
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all duration-300 ${view === 'grid' ? (isDark ? 'bg-zinc-100 text-black' : 'bg-slate-900 text-white') : 'opacity-70'
                                }`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => setView('list')}
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all duration-300 ${view === 'list' ? (isDark ? 'bg-zinc-100 text-black' : 'bg-slate-900 text-white') : 'opacity-70'
                                }`}
                        >
                            <Rows className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm">
                        <label htmlFor="beta-sort-select" className="sr-only">
                            {sortSelectLabel}
                        </label>
                        <select
                            id="beta-sort-select"
                            value={sortBy}
                            onChange={(event) => setSortBy(event.target.value as 'new' | 'popular' | 'title')}
                            className={`rounded-full border px-2 py-1 font-semibold focus:outline-none ${isDark ? 'border-[#27272A] bg-zinc-800/70 text-zinc-200 shadow-sm' : 'border-slate-200 bg-white text-slate-600'
                                }`}
                        >
                            <option value="new">{sortLabels.new}</option>
                            <option value="popular">{sortLabels.popular}</option>
                            <option value="title">{sortLabels.title}</option>
                        </select>
                    </div>
                </div>
            </section>

            {/* NEW: Active Filters Row */}
            {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                    <span className={`text-xs font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                        Active filters:
                    </span>

                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition ${isDark
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-red-500/50 hover:text-red-300'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-red-200 hover:text-red-600'
                                }`}
                        >
                            <span>Search: "{search}"</span>
                            <X className="h-3 w-3 opacity-60" />
                        </button>
                    )}

                    {activeFilter !== 'all' && activeFilter !== 'trending' && (
                        <button
                            onClick={() => setActiveFilter('all')}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition ${isDark
                                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:border-red-500/50 hover:text-red-300'
                                    : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-red-200 hover:text-red-600'
                                }`}
                        >
                            <span>Category: {filterLabelMap[activeFilter] ?? activeFilter}</span>
                            <X className="h-3 w-3 opacity-60" />
                        </button>
                    )}

                    {selectedTags.map(tag => {
                        const tagLabel = visibleTags.find(t => t.key === tag)?.label || tag;
                        return (
                            <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition ${isDark
                                        ? 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:border-red-500/50 hover:text-red-300'
                                        : 'border-violet-200 bg-violet-50 text-violet-700 hover:border-red-200 hover:text-red-600'
                                    }`}
                            >
                                <span>#{tagLabel}</span>
                                <X className="h-3 w-3 opacity-60" />
                            </button>
                        );
                    })}

                    <button
                        onClick={clearFilters}
                        className={`ml-auto text-xs font-semibold underline decoration-dashed underline-offset-4 transition hover:decoration-solid ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {clearFiltersLabel}
                    </button>
                </div>
            )}

            {visibleTags.length > 0 && (
                <section className={`flex flex-col gap-2 rounded-2xl border px-3 py-2 text-xs md:text-sm ${isDark ? 'border-[#27272A] bg-[#121215]' : 'border-slate-100 bg-slate-50'
                    }`}>
                    <div className="flex flex-wrap gap-2">
                        {visibleTags.map(({ key, label }) => {
                            const isSelected = selectedTags.includes(key);
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleTag(key)}
                                    aria-pressed={isSelected}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${isSelected
                                            ? isDark
                                                ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                                                : 'border-violet-300 bg-violet-100 text-violet-800'
                                            : isDark
                                                ? 'border-[#27272A] bg-[#18181B] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800'
                                        }`}
                                >
                                    #{label}
                                </button>
                            );
                        })}
                        {hiddenTagCount > 0 && (
                            <span
                                className={`rounded-full border border-dashed px-3 py-1 text-xs ${isDark ? 'border-zinc-700 text-zinc-500' : 'border-slate-200 text-slate-400'
                                    }`}
                            >
                                +{hiddenTagCount}
                            </span>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
