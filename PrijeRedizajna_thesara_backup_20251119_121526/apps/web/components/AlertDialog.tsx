'use client';

import { useEffect, useRef } from 'react';

export default function AlertDialog({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const okButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => okButtonRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 animate-fadeIn"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 animate-slideUp">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-3 text-gray-600">{message}</p>
        <div className="mt-6 flex items-center justify-end">
          <button
            ref={okButtonRef}
            onClick={onClose}
            className="px-5 py-2.5 rounded-full bg-gray-900 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

