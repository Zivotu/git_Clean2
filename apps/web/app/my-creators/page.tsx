'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';
import Link from 'next/link';
import Image from 'next/image';
import Avatar from '@/components/Avatar';
import { PUBLIC_API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resolvePreviewUrl } from '@/lib/preview';

type FavoriteCreator = {
  id: string;
  handle: string;
  displayName?: string;
  photo?: string;
};

type FavoriteResponse = {
  creators: FavoriteCreator[];
};

type AppLite = {
  id: string;
  slug: string;
  title: string;
  previewUrl?: string;
};

export default function MyCreatorsPage() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [creators, setCreators] = useState<FavoriteCreator[]>([]);
  const [appsByCreator, setAppsByCreator] = useState<Record<string, AppLite[]>>({});
  const { isDark } = useTheme();

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    async function loadSubscribedCreators() {
      try {
        setLoading(true);
        // Load full entitlements from API and filter for creator-all-access
        const full = await apiFetch<{ items: Array<{ id: string; feature: string; data?: any }> }>(
          '/me/entitlements-full',
          { auth: true }
        );
        const ids = Array.from(
          new Set(
            (full.items || [])
              .filter((e) => e && e.feature === 'creator-all-access' && e.data && e.data.creatorId)
              .map((e) => String(e.data.creatorId))
          )
        );
        const list: FavoriteCreator[] = [];
        for (const id of ids) {
          try {
            const res = await fetch(`${PUBLIC_API_URL}/creators/id/${encodeURIComponent(id)}`);
            if (!res.ok) {
              list.push({ id, handle: id });
              continue;
            }
            const js = await res.json();
            const handle = js?.handle || id;
            list.push({ id, handle });
          } catch {
            list.push({ id, handle: id });
          }
        }
        if (!cancelled) setCreators(list);
      } catch (e) {
        console.warn('Failed to load subscribed creators', e);
        if (!cancelled) setCreators([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSubscribedCreators();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function loadApps() {
      const map: Record<string, AppLite[]> = {};
      for (const c of creators) {
        try {
          const r = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(c.handle)}/apps?lang=${encodeURIComponent(locale)}`, { credentials: 'include' });
          if (!r.ok) continue;
          const j = await r.json();
          const items: AppLite[] = (j.items || j.apps || []).map((a: any) => ({
            id: a.id,
            slug: a.slug,
            title: a.title,
            previewUrl: a.previewUrl,
          }));
          map[c.id] = items;
        } catch { }
      }
      if (!cancelled) setAppsByCreator(map);
    }
    if (creators.length) loadApps();
    return () => { cancelled = true; };
  }, [creators, locale]);



  const content = useMemo(() => {
    if (!user) {
      return (
        <div className={`rounded-3xl border p-8 text-center ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white/70'}`}>
          <p className={isDark ? 'text-zinc-400' : 'text-gray-600'}>Prijavite se kako biste vidjeli svoje favorite.</p>
          <Link href="/login" className="mt-4 inline-block px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 font-semibold transition">Prijava</Link>
        </div>
      );
    }
    if (loading) {
      return <p className={isDark ? 'text-zinc-500' : 'text-gray-500'}>Učitavanje…</p>;
    }
    if (creators.length === 0) {
      return (
        <div className={`text-center ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
          <p>Još nemate favorita.</p>
          <p className="mt-2">Posjetite profil kreatora i kliknite &quot;Dodaj u favorite&quot;.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {creators.map((c) => {
          const apps = appsByCreator[c.id] || [];
          return (
            <section key={c.id} className={`rounded-3xl border overflow-hidden transition-all duration-300 ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white shadow-sm'}`}>
              <header className="p-4 flex items-center justify-between gap-3">
                <Link href={`/u/${c.handle}`} className="flex items-center gap-3 group">
                  <Avatar uid={c.id} src={c.photo} name={c.displayName || c.handle} size={44} />
                  <div>
                    <div className={`text-base font-semibold ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{c.displayName || c.handle}</div>
                    <div className={`text-sm group-hover:underline ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>@{c.handle}</div>
                  </div>
                </Link>
                <Link href={`/u/${c.handle}`} className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium">Profil</Link>
              </header>
              <div className="px-4 pb-4">
                {apps.length === 0 ? (
                  <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>Nema javnih aplikacija.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {apps.slice(0, 6).map((a) => {
                      const img = resolvePreviewUrl(a.previewUrl);
                      const hasPreview = Boolean(img);
                      return (
                        <Link key={a.id} href={`/app/${a.slug}`} className="group block">
                          <div className={`relative aspect-video rounded-xl overflow-hidden border transition ${isDark ? 'border-[#27272A]' : 'border-slate-200'}`}>
                            {hasPreview ? (
                              <Image src={img} alt={a.title} fill className="object-cover group-hover:opacity-90" style={{ color: 'transparent' }} />
                            ) : (
                              <div className={`w-full h-full text-[11px] font-medium grid place-items-center ${isDark ? 'bg-[#09090B] text-zinc-600' : 'bg-slate-100 text-slate-500'}`}>
                                Bez grafike
                              </div>
                            )}
                          </div>
                          <div className={`mt-1 text-sm truncate ${isDark ? 'text-zinc-300' : 'text-gray-800'}`} title={a.title}>{a.title}</div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  }, [user, loading, creators, appsByCreator, isDark]);

  return (
    <div className="w-full">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className={`text-3xl md:text-4xl font-black mb-6 ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>Moji Kreatori</h1>
        {content}
      </div>
    </div>
  );
}

