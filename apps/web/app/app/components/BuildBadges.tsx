'use client';

import { useEffect, useState } from 'react';
import { PUBLIC_API_URL } from '@/lib/config';

export default function BuildBadges({ playUrl }: { playUrl: string }) {
    const [policy, setPolicy] = useState<string | null>(null);
    const [domains, setDomains] = useState<string[]>([]);

    useEffect(() => {
        const m = /\/play\/([^/]+)\//.exec(playUrl);
        const appId = m?.[1];
        if (!appId) return;
        const safeAppId = encodeURIComponent(appId);
        let cancelled = false;
        (async () => {
            try {
                const ls = await fetch(`${PUBLIC_API_URL}/listing/${safeAppId}`, { credentials: 'include', cache: 'no-store' });
                const lj = ls.ok ? await ls.json() : null;
                const buildId = lj?.item?.buildId;
                if (!buildId) return;
                const safeId = encodeURIComponent(buildId);
                const st = await fetch(`${PUBLIC_API_URL}/build/${safeId}/status`, { credentials: 'include', cache: 'no-store' });
                const js = st.ok ? await st.json() : null;
                if (cancelled) return;
                const pol = js?.artifacts?.networkPolicy || null;
                setPolicy(pol);
                try {
                    const man = await fetch(`${PUBLIC_API_URL}/builds/${safeId}/build/manifest_v1.json`, { credentials: 'include', cache: 'no-store' });
                    if (man.ok) {
                        const mj = await man.json();
                        if (Array.isArray(mj?.networkDomains)) setDomains(mj.networkDomains);
                    }
                } catch { }
            } catch { }
        })();
        return () => { cancelled = true; };
    }, [playUrl]);

    if (!policy) return null;
    const pill = (text: string, tone: 'gray' | 'green' | 'yellow' | 'red' = 'gray', title?: string) => (
        <span
            title={title || text}
            className={
                `inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ` +
                (tone === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    tone === 'yellow' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        tone === 'red' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-gray-50 text-gray-700 border-gray-200')
            }
        >{text}</span>
    );
    const polUp = String(policy).toUpperCase();
    return (
        <div className="mt-3 flex flex-wrap items-center gap-2">
            {polUp === 'NO_NET' && pill('No Net', 'green', 'bez mrežnih poziva')}
            {polUp === 'MEDIA_ONLY' && pill('Media Only', 'yellow', 'samo slike/video/CDN')}
            {polUp === 'OPEN_NET' && pill('Open Net', 'red', (domains.length ? `domene: ${domains.join(', ')}` : 'široki pristup mreži'))}
        </div>
    );
}
