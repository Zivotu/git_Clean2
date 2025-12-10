'use client';

import { useEffect } from 'react';

// Ovo hvata greške koje se dogode u RootLayout-u, što standardni error.tsx ne može.
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Logiraj grešku, a ako je ChunkLoadError, pokušaj reload
        console.error('Global Error:', error);

        // Provjera za ChunkLoadError i slične "missing script" greške
        if (
            error.name === 'ChunkLoadError' ||
            /Loading chunk [\d]+ failed/.test(error.message) ||
            /undefined is not a function/.test(error.message) ||
            error.message.includes('missing')
        ) {
            // Kratka odgoda da ne upadnemo u infinite loop ako je server trajno broken (iako browseri često sami to spriječe)
            setTimeout(() => {
                window.location.reload();
            }, 100);
        }
    }, [error]);

    return (
        <html>
            <body className="bg-white text-gray-900 flex flex-col items-center justify-center min-h-screen p-4 text-center">
                <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
                <p className="mb-4 text-gray-600">
                    A critical error occurred while loading the application.
                </p>
                <button
                    onClick={() => window.location.reload()} // Globalni reset obično znači "probaj učitati cijelu stranicu opet"
                    className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-emerald-700 transition"
                >
                    Reload Page
                </button>
            </body>
        </html>
    );
}
