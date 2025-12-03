'use client'

import { useState } from 'react'

type FullScreenPromptProps = {
    open: boolean
    title: string
    message: string
    confirmLabel: string
    cancelLabel: string
    rememberLabel: string
    onConfirm: (remember: boolean) => void
    onCancel: (remember: boolean) => void
}

export default function FullScreenPrompt({
    open,
    title,
    message,
    confirmLabel,
    cancelLabel,
    rememberLabel,
    onConfirm,
    onCancel,
}: FullScreenPromptProps) {
    const [remember, setRemember] = useState(false)

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{message}</p>

                <label className="mt-4 flex items-center gap-3 cursor-pointer select-none group">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                            className="peer h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all"
                        />
                    </div>
                    <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{rememberLabel}</span>
                </label>

                <div className="mt-6 flex gap-3">
                    <button
                        onClick={() => onConfirm(remember)}
                        className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 hover:shadow-md active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                        {confirmLabel}
                    </button>
                    <button
                        onClick={() => onCancel(remember)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-200"
                    >
                        {cancelLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
