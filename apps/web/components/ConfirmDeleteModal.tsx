import { useEffect, useRef } from 'react';

export default function ConfirmDeleteModal({
    title,
    message,
    appTitle,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    isDark = false,
}: {
    title: string;
    message: string;
    appTitle: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDark?: boolean;
}) {
    const cancelRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        // Focus the cancel button for safety (prevents accidental deletion)
        cancelRef.current?.focus();
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

            <div
                className={`relative max-w-md w-full mx-4 rounded-2xl shadow-2xl p-6 animate-slideUp ${isDark
                        ? 'bg-gradient-to-br from-[#18181B] to-[#27272A] border border-[#3F3F46]'
                        : 'bg-white'
                    }`}
            >
                {/* Icon */}
                <div className="flex justify-center mb-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? 'bg-red-950/50' : 'bg-red-50'
                        }`}>
                        <svg
                            className="w-8 h-8 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h2 className={`text-2xl font-bold mb-3 text-center ${isDark ? 'text-zinc-100' : 'text-gray-900'
                    }`}>
                    {title}
                </h2>

                {/* Message */}
                <p className={`mb-2 text-center ${isDark ? 'text-zinc-300' : 'text-gray-700'
                    }`}>
                    {message}
                </p>

                {/* App title highlight */}
                <p className={`mb-6 text-center font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'
                    }`}>
                    "{appTitle}"
                </p>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        className={`flex-1 px-5 py-2.5 rounded-xl font-medium transition-all duration-200 ${isDark
                                ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700'
                                : 'bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-300'
                            } focus:outline-none focus:ring-2 focus:ring-emerald-400`}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>

            {/* Animations */}
            <style jsx global>{`
        @keyframes fadeIn { 
          from { opacity: 0; } 
          to { opacity: 1; } 
        }
        @keyframes slideUp { 
          from { opacity: 0; transform: translateY(20px) scale(0.95); } 
          to { opacity: 1; transform: translateY(0) scale(1); } 
        }
        .animate-fadeIn { 
          animation: fadeIn 0.2s ease-out; 
        }
        .animate-slideUp { 
          animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); 
        }
      `}</style>
        </div>
    );
}
