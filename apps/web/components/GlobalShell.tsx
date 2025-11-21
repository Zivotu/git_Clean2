'use client';

import React from 'react';
import SidePanel from '@/components/SidePanel';
import Footer from '@/components/Footer';
import SplashScreen from '@/components/layout/SplashScreen';
import { useTheme } from '@/components/ThemeProvider';

export default function GlobalShell({ children }: { children: React.ReactNode }) {
    const { isDark } = useTheme();

    return (
        <div
            className={`min-h-screen w-full transition-colors duration-300 ${isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-[#F8FAFC] text-slate-900'
                }`}
        >
            <SplashScreen />

            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10 lg:px-10">
                <SidePanel
                    className={`sticky top-24 hidden h-[calc(100vh-7rem)] flex-col gap-5 rounded-3xl border p-6 text-sm transition-all duration-300 lg:flex ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white shadow-sm'
                        }`}
                    isDark={isDark}
                />

                <main className="flex-1 space-y-4 lg:min-w-0">
                    {children}
                </main>
            </div>

            <Footer isDark={isDark} />
        </div>
    );
}
