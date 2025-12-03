'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GoldCheckoutRedirect() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to the main checkout page with gold tier parameter
        router.replace('/pro/checkout?tier=gold');
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Preusmjeravanje na Gold pretplatu...</p>
            </div>
        </div>
    );
}
