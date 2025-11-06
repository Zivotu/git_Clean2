import { useEffect, useRef } from 'react';

export default function CongratsModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // focus the close button for accessibility
    closeRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative max-w-lg w-full mx-4 bg-white rounded-2xl shadow-lg p-6 text-center">
        <h2 className="text-2xl font-extrabold mb-3">Čestitamo!</h2>
        <p className="text-gray-700 mb-6">{message}</p>

        <div className="flex justify-center">
          <button
            ref={closeRef}
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            U redu
          </button>
        </div>
      </div>
    </div>
  );
}
