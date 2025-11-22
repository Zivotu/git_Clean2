'use client';

import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { useTheme } from '@/components/ThemeProvider';
import { useAppDetails } from '../hooks/useAppDetails';
import BuildBadges from './BuildBadges';

type AppInfoProps = {
    details: ReturnType<typeof useAppDetails>;
};

export default function AppInfo({ details }: AppInfoProps) {
    const { isDark } = useTheme();
    const { item, tApp, authorHandle } = details;

    if (!item) return null;

    return (
        <div className="space-y-6">
            <div className={`rounded-2xl border shadow-lg p-6 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>{tApp('about')}</h2>
                {item.description ? (
                    <p className={`whitespace-pre-wrap break-words ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                        {item.description}
                    </p>
                ) : (
                    <p className={`italic ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{tApp('noDescription')}</p>
                )}

                {item.longDescription && (
                    <div className={`mt-4 pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                        <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>Detailed Overview</h3>
                        <p className={`whitespace-pre-wrap break-words text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                            {item.longDescription}
                        </p>
                    </div>
                )}

                {typeof item.price === 'number' && item.price > 0 && (
                    <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${isDark
                            ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1z" opacity=".1" /><path d="M12 6a1 1 0 011 1v1.1c1.69.21 3 1.65 3 3.4a1 1 0 11-2 0 1.5 1.5 0 10-1.5-1.5H11a1 1 0 110-2h1V7a1 1 0 011-1zm-2 8a1 1 0 100 2h4a1 1 0 100-2h-4z" /></svg>
                        Price: €{Number(item.price).toFixed(2)}
                    </div>
                )}

                {item.playUrl && <BuildBadges playUrl={item.playUrl} />}
            </div>

            {item.author && (
                <div className={`rounded-2xl border shadow-lg p-6 ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'}`}>
                    <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>Creator</h3>
                    <div className="flex items-center gap-3">
                        {item.author.photo && (
                            <Avatar uid={item.author.uid} src={item.author.photo} name={item.author.name} size={36} />
                        )}
                        <div className="flex flex-col">
                            {authorHandle ? (
                                <Link href={`/u/${authorHandle}`} className={`font-medium hover:underline ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>
                                    @{authorHandle}
                                </Link>
                            ) : (
                                <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-gray-900'}`}>
                                    {item.author.name || 'Anonymous'}
                                </span>
                            )}
                            <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>App Developer</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
