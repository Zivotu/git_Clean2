import { NextResponse } from 'next/server';
import { getApiBase } from '@/lib/apiBase';
import type { AppRecord } from '@/lib/types';
import { headers } from 'next/headers';

async function getApp(appId: string): Promise<AppRecord | null> {
    try {
        let apiBase = getApiBase();

        // Ensure absolute URL if relative
        if (apiBase.startsWith('/')) {
            const headerList = await headers();
            const host = headerList.get('host') || 'localhost:3000';
            const protocol = headerList.get('x-forwarded-proto') || 'http';
            apiBase = `${protocol}://${host}${apiBase}`;
        }

        const res = await fetch(`${apiBase}/app-meta/${appId}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return res.json();
    } catch (error) {
        console.error('Error fetching app manifest data:', error);
        return null;
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ appId: string }> }
) {
    const { appId } = await params;
    const app = await getApp(appId);

    if (!app) {
        return new NextResponse(JSON.stringify({ error: 'App not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const title = app.title || app.name || 'Thesara App';
    const description = app.description || 'Play this app on Thesara';
    // Use previewUrl if available, otherwise fallback to site favicon
    const icon = app.previewUrl || '/favicon.png';

    const manifest = {
        name: title,
        short_name: title.length > 12 ? title.substring(0, 12) + '...' : title,
        description: description,
        start_url: `/play/${appId}?source=pwa`,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#7c3aed',
        icons: [
            {
                src: icon,
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: '/favicon.png',
                sizes: '512x512',
                type: 'image/png'
            }
        ]
    };

    return NextResponse.json(manifest);
}
