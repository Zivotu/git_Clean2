'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function classNames(...classes: Array<string | false | undefined>) {
    return classes.filter(Boolean).join(' ');
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmTone = 'danger',
    requireText,
    onConfirm,
    onClose,
}: {
    open: boolean;
    title: string;
    message: string | React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmTone?: 'danger' | 'default';
    requireText?: string;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const [text, setText] = useState('');
    const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (open) {
            setText('');
            setTimeout(() => cancelBtnRef.current?.focus(), 0);
        }
    }, [open]);

    if (!open) return null;

    const confirmDisabled = requireText ? text.trim() !== requireText : false;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn"
        >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 animate-slideUp">
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                <div className="mt-3 text-gray-600">{message}</div>

                {requireText && (
                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-600 mb-2">
                            For safety, type <span className="font-mono px-2 py-1 bg-red-50 text-red-700 rounded">{requireText}</span> to confirm:
                        </label>
                        <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="w-full border-2 rounded-lg px-3 py-2 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all"
                            placeholder={requireText}
                            autoComplete="off"
                        />
                    </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        ref={cancelBtnRef}
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-full border border-gray-300 hover:bg-gray-50 transition-all duration-200 font-medium"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={confirmDisabled}
                        className={classNames(
                            'px-5 py-2.5 rounded-full text-white font-medium transition-all duration-200',
                            confirmDisabled
                                ? 'bg-gray-400 cursor-not-allowed'
                                : confirmTone === 'danger'
                                    ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-md hover:shadow-lg'
                                    : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-md hover:shadow-lg'
                        )}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function Toast({ message, type = 'success', onClose }: {
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
}) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const colors = {
        success: 'from-emerald-500 to-green-600',
        error: 'from-red-500 to-red-600',
        info: 'from-blue-500 to-blue-600',
    };

    return (
        <div className="fixed bottom-4 right-4 z-[1000] animate-slideInRight">
            <div className={classNames(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-lg',
                `bg-gradient-to-r ${colors[type]}`
            )}>
                {type === 'success' && (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                )}
                {type === 'error' && (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                )}
                <span className="font-medium">{message}</span>
            </div>
        </div>
    );
}

export function LoginPromptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const router = useRouter();
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 text-center animate-slideUp">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Login Required</h2>
                <p className="text-gray-600 mb-6">Please sign in to continue.</p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => router.push('/login')}
                        className="w-full py-2.5 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all"
                    >
                        Sign In
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 rounded-full border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export function PayModal({ open, item, onClose }: { open: boolean; item: any; onClose: () => void }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 animate-slideUp">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Purchase Required</h2>
                <p className="text-gray-600 mb-6">
                    This app requires a one-time purchase or subscription to play.
                </p>
                <div className="bg-gray-50 p-4 rounded-xl mb-6 flex items-center justify-between">
                    <span className="font-medium text-gray-900">{item.title}</span>
                    <span className="font-bold text-emerald-600">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.price)}
                    </span>
                </div>
                <div className="flex flex-col gap-3">
                    <Link
                        href={`/checkout/${item.id}`}
                        className="w-full py-3 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all text-center shadow-lg shadow-emerald-600/20"
                    >
                        Proceed to Checkout
                    </Link>
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 rounded-full border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ReportModal({
    open,
    title,
    description,
    value,
    onChange,
    onSubmit,
    onClose,
    busy,
    placeholder,
}: {
    open: boolean;
    title: string;
    description: string;
    value: string;
    onChange: (val: string) => void;
    onSubmit: () => void;
    onClose: () => void;
    busy: boolean;
    placeholder: string;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 animate-slideUp">
                <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
                <p className="text-sm text-gray-600 mb-4">{description}</p>
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full border-2 rounded-lg px-3 py-2 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-none mb-4"
                    rows={4}
                    placeholder={placeholder}
                    disabled={busy}
                />
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="px-5 py-2.5 rounded-full border border-gray-300 hover:bg-gray-50 transition-all duration-200 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSubmit}
                        disabled={busy || !value.trim()}
                        className="px-5 py-2.5 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? 'Sending...' : 'Submit Report'}
                    </button>
                </div>
            </div>
        </div>
    );
}
