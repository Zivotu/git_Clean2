"use client";

import React from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { Crown } from 'lucide-react';

type ProfileCardProps = {
  user?: any | null;
  displayName: string;
  photo?: string | null;
  isDark?: boolean;
  showCrown?: boolean;
  onLogout?: () => void;
  loginLabel?: string;
  logoutLabel?: string;
  viewProfileLabel?: string;
  className?: string;
  compact?: boolean;
};

export default function ProfileCard({
  user,
  displayName,
  photo,
  isDark, // kept for compatibility but not required
  showCrown = false,
  onLogout = () => { },
  loginLabel = 'Sign in',
  logoutLabel = 'Log out',
  viewProfileLabel = 'View profile',
  className = '',
  compact = false,
}: ProfileCardProps) {
  // Prefer declarative Tailwind `dark:` variants so styling follows the DOM `html.dark` class reliably.
  const containerClasses = `flex items-center gap-2 rounded-2xl border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-lg dark:border-[#27272A] dark:bg-[#18181B] dark:text-zinc-100 dark:hover:border-zinc-500 border-slate-200 bg-white text-slate-900 hover:border-slate-400 ${className}`;
  const subTextClasses = 'text-[11px] dark:text-zinc-500 text-slate-500';
  const logoutBtnClasses = 'rounded-full border px-3 py-1 text-xs font-semibold dark:border-[#27272A] dark:text-zinc-200 dark:hover:bg-white/5 border-slate-200 text-slate-600 hover:bg-slate-50';
  const loginBtnClasses = `rounded-full border px-4 py-2 text-sm font-semibold dark:border-[#27272A] dark:text-zinc-100 dark:hover:bg-black/40 border-slate-200 text-slate-700 hover:bg-slate-50 ${className}`;

  if (user) {
    if (compact) {
      return (
        <Link prefetch={false} href="/profile" className={`relative flex items-center justify-center flex-shrink-0 ${className}`}>
          <Avatar uid={user.uid} src={photo} name={displayName} size={32} className="h-8 w-8 object-cover rounded-full ring-1 ring-slate-200 dark:ring-zinc-700" />
          {showCrown && (
            <div className="absolute -top-1 -right-1 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 rounded-full p-0.5 shadow-sm">
              <Crown className="h-2 w-2 text-amber-900" fill="currentColor" />
            </div>
          )}
        </Link>
      );
    }

    return (
      <div className={containerClasses}>
        <Link prefetch={false} href="/profile" className="flex flex-1 items-center gap-3">
          <div className="relative">
            <Avatar uid={user.uid} src={photo} name={displayName} size={40} className="h-10 w-10 object-cover" />
            {showCrown && (
              <div className="absolute -top-1 -right-1 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 rounded-full p-1 shadow-lg">
                <Crown className="h-3 w-3 text-amber-900" fill="currentColor" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{displayName}</span>
            <span className={subTextClasses}>{viewProfileLabel}</span>
          </div>
        </Link>
        <button type="button" onClick={onLogout} className={logoutBtnClasses}>
          {logoutLabel}
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <Link href="/login" className={`text-xs font-semibold px-3 py-1.5 rounded-full border dark:border-[#27272A] dark:text-zinc-200 dark:hover:bg-white/5 border-slate-200 text-slate-700 hover:bg-slate-50 ${className}`}>
        {loginLabel}
      </Link>
    );
  }

  return (
    <Link href="/login" className={loginBtnClasses}>
      {loginLabel}
    </Link>
  );
}
