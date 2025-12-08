import { BetaAppCard, type BetaApp, type ListingLabels } from '@/components/BetaAppCard';
import EmptyState from './EmptyState';

type AppGridProps = {
    gridSectionClass: string;
    visibleApps: BetaApp[];
    hasMore: boolean;
    loadMoreRef: React.RefObject<HTMLDivElement | null>;
    view: 'grid' | 'list';
    isDark: boolean;
    listingLabels: ListingLabels;
    handleCardDetails: (app: BetaApp) => void;
    filteredAppsLength: number;
    emptyStateProps: React.ComponentProps<typeof EmptyState>;
};

export default function AppGrid({
    gridSectionClass,
    visibleApps,
    hasMore,
    loadMoreRef,
    view,
    isDark,
    listingLabels,
    handleCardDetails,
    filteredAppsLength,
    emptyStateProps,
}: AppGridProps) {
    return (
        <section className={gridSectionClass}>
            {visibleApps.map((app) => (
                <BetaAppCard
                    key={app.id}
                    app={app}
                    view={view}
                    isDark={isDark}
                    labels={listingLabels}
                    onDetails={handleCardDetails}
                />
            ))}
            {hasMore && (
                <div
                    ref={loadMoreRef}
                    className="col-span-full flex h-20 w-full items-center justify-center opacity-50"
                >
                    <span
                        className={`h-2 w-2 rounded-full ${isDark ? 'bg-zinc-600' : 'bg-slate-300'
                            } animate-bounce`}
                        style={{ animationDelay: '0ms' }}
                    />
                    <span
                        className={`mx-1 h-2 w-2 rounded-full ${isDark ? 'bg-zinc-600' : 'bg-slate-300'
                            } animate-bounce`}
                        style={{ animationDelay: '150ms' }}
                    />
                    <span
                        className={`h-2 w-2 rounded-full ${isDark ? 'bg-zinc-600' : 'bg-slate-300'
                            } animate-bounce`}
                        style={{ animationDelay: '300ms' }}
                    />
                </div>
            )}
            {!filteredAppsLength && <EmptyState {...emptyStateProps} />}
        </section>
    );
}
