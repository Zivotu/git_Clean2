'use client';

import { useTheme } from '@/components/ThemeProvider';

type PendingVersionNoticeProps = {
    onRefresh: () => void;
    tApp: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
};

export default function PendingVersionNotice({ onRefresh, tApp }: PendingVersionNoticeProps) {
    const { isDark } = useTheme();

    return (
        <div
            className={`rounded-2xl border shadow-lg p-4 ${isDark
                    ? 'bg-amber-900/20 border-amber-800/50'
                    : 'bg-amber-50 border-amber-200'
                }`}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                    <svg
                        className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>
                <div className="flex-1">
                    <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                        {tApp('AppDetails.pendingVersion.title', undefined, 'Nova verzija čeka odobrenje')}
                    </h3>
                    <p className={`text-xs mb-3 ${isDark ? 'text-amber-200/80' : 'text-amber-800/90'}`}>
                        {tApp(
                            'AppDetails.pendingVersion.message',
                            undefined,
                            'Poslali ste novu verziju koja čeka odobrenje. Nakon što admin odobri, osvježite stranicu da vidite promjene.'
                        )}
                    </p>
                    <button
                        onClick={onRefresh}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDark
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        {tApp('AppDetails.pendingVersion.refreshButton', undefined, 'Osvježi')}
                    </button>
                </div>
            </div>
        </div>
    );
}
