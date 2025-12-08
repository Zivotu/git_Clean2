import { RefreshCcw } from 'lucide-react';

type FeedbackBannerProps = {
    isDark: boolean;
    loadError: string | null;
    loadErrorDetails: string | null;
    handleRefreshClick: () => void;
    isLoadingListings: boolean;
    retryLabel: string;
};

export default function FeedbackBanner({
    isDark,
    loadError,
    loadErrorDetails,
    handleRefreshClick,
    isLoadingListings,
    retryLabel,
}: FeedbackBannerProps) {
    if (!loadError) return null;

    return (
        <div
            className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-red-900/50 bg-red-900/20 text-rose-100' : 'border-red-200 bg-red-50 text-red-900'
                }`}
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="font-semibold">{loadError}</p>
                    {loadErrorDetails && <p className="text-xs opacity-80">{loadErrorDetails}</p>}
                </div>
                <button
                    type="button"
                    onClick={handleRefreshClick}
                    disabled={isLoadingListings}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${isDark ? 'border-zinc-500 text-zinc-100 hover:bg-white/5' : 'border-red-300 text-red-900 hover:bg-white'
                        } ${isLoadingListings ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                    <RefreshCcw className={`h-3 w-3 ${isLoadingListings ? 'animate-spin' : ''}`} />
                    <span>{retryLabel}</span>
                </button>
            </div>
        </div>
    );
}
