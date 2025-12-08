import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Play, ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-provider';
import { playHref, appDetailsHref } from '@/lib/urls';
import { type BetaApp, type ListingLabels } from '@/components/BetaAppCard';

type BetaDetailsModalProps = {
    app: BetaApp | null;
    onClose: () => void;
    isDark: boolean;
    labels: ListingLabels;
};

export default function BetaDetailsModal({
    app,
    onClose,
    isDark,
    labels,
}: BetaDetailsModalProps) {
    const { messages } = useI18n();
    useEffect(() => {
        if (!app) return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => {
            window.removeEventListener('keydown', handleKey);
        };
    }, [app, onClose]);

    if (!app) return null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-10 backdrop-blur"
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className={`relative w-full max-w-3xl rounded-[32px] border px-6 py-6 shadow-2xl ${isDark ? 'border-[#27272A] bg-[#09090B]' : 'border-slate-200 bg-white'
                    }`}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={(messages['BetaHome.modal.close'] as string) ?? 'Close details'}
                    className={`absolute right-4 top-4 rounded-full border p-2 transition ${isDark
                            ? 'border-[#27272A] text-zinc-400 hover:text-white'
                            : 'border-slate-200 text-slate-500 hover:text-slate-900'
                        }`}
                >
                    <X className="h-4 w-4" />
                </button>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="relative h-56 overflow-hidden rounded-[28px]">
                        {app.previewUrl ? (
                            <Image
                                src={app.previewUrl}
                                alt={app.name}
                                fill
                                loading="lazy"
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 320px"
                                unoptimized
                            />
                        ) : (
                            <div className={`absolute inset-0 bg-gradient-to-br ${app.gradientClass}`} />
                        )}
                    </div>
                    <div className="flex flex-col gap-4">
                        <div>
                            <p
                                className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-zinc-400' : 'text-slate-500'
                                    }`}
                            >
                                {app.category}
                            </p>
                            <h3 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {app.name}
                            </h3>
                            <p
                                className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'
                                    }`}
                            >
                                {app.description}
                            </p>
                        </div>
                        <div
                            className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-[#27272A] text-zinc-200' : 'border-slate-200 text-slate-700'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <Heart className="h-4 w-4 text-rose-400" />
                                    <span>{app.likesLabel}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Play className="h-4 w-4 text-emerald-400" />
                                    <span>{app.usersLabel}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                prefetch={false}
                                href={playHref(app.id, { run: 1 })}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                            >
                                <Play className="h-4 w-4" />
                                <span>{labels.play}</span>
                            </Link>
                            {/* Use programmatic navigation from inside modal to avoid relative-resolution bugs */}
                            <DetailsButton app={app} onClose={onClose} isDark={isDark} labels={labels} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailsButton({
    app,
    onClose,
    isDark,
    labels,
}: {
    app: BetaApp;
    onClose: () => void;
    isDark: boolean;
    labels: ListingLabels;
}) {
    const router = useRouter();

    // Always show the details label here so the button reliably opens the details
    // view. Falling back to the localized "full details" label keeps behaviour
    // consistent and avoids routing creators to an edit URL that may 404.
    const actionLabel = labels.details;

    return (
        <button
            type="button"
            onClick={() => {
                try {
                    const href = appDetailsHref(app.slug);
                    onClose();
                    router.push(href);
                } catch {
                    // navigation failed — swallow error in UI
                }
            }}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold ${isDark
                    ? 'border-[#27272A] text-zinc-100 hover:bg-white/5'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
        >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
        </button>
    );
}
