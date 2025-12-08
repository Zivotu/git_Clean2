import Link from 'next/link';

type EarlyAccessPopupProps = {
    isDark: boolean;
    popupTitle: string;
    popupBody: string;
    popupPrimaryHref: string;
    popupPrimaryLabel: string;
    popupDismiss: string;
    handleSubmitClick: () => void;
    dismissEarlyAccessPopup: () => void;
};

export default function EarlyAccessPopup({
    isDark,
    popupTitle,
    popupBody,
    popupPrimaryHref,
    popupPrimaryLabel,
    popupDismiss,
    handleSubmitClick,
    dismissEarlyAccessPopup,
}: EarlyAccessPopupProps) {
    return (
        <div
            className={`fixed bottom-6 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border p-5 shadow-2xl backdrop-blur ${isDark
                ? 'border-[#27272A] bg-[#0B0B10]/95 text-zinc-100'
                : 'border-slate-200 bg-white text-slate-900'
                }`}
        >
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <p className="text-base font-semibold">{popupTitle}</p>
                    <p className={`mt-2 text-sm ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        {popupBody}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                        <Link
                            prefetch={false}
                            href={popupPrimaryHref}
                            onClick={() => {
                                if (popupPrimaryHref === '/create') {
                                    handleSubmitClick();
                                }
                                dismissEarlyAccessPopup();
                            }}
                            className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                        >
                            {popupPrimaryLabel}
                        </Link>
                        <button
                            type="button"
                            onClick={dismissEarlyAccessPopup}
                            className={`text-sm ${isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            {popupDismiss}
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={dismissEarlyAccessPopup}
                    className={`text-lg ${isDark ? 'text-zinc-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
                    aria-label={popupDismiss}
                >
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
        </div>
    );
}
