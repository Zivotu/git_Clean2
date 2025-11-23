'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
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
  message: string | ReactNode;
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
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200 dark:border-zinc-800 p-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          {confirmTone === 'danger' && (
            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-full text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{message}</div>

            {requireText && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                  For safety, type <span className="font-mono px-2 py-0.5 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 rounded border border-rose-200 dark:border-rose-900/30">{requireText}</span> to confirm:
                </label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all outline-none"
                  placeholder={requireText}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            ref={cancelBtnRef}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={cn(
              'px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-sm',
              confirmDisabled
                ? 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed'
                : confirmTone === 'danger'
                  ? 'bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

