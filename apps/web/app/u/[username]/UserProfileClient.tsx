'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import AppCard, { Listing } from '@/components/AppCard'
import { PUBLIC_API_URL } from '@/lib/config'
import {
  Star,
  UserPlus,
  ArrowLeft,
  Loader2,
  LayoutGrid,
  Share2,
  MessageSquare
} from 'lucide-react'

export default function UserProfileClient({ username }: { username: string }) {
  const [user, setUser] = useState<any>(null)
  const [userApps, setUserApps] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingApps, setLoadingApps] = useState(true)

  useEffect(() => {
    const fetchUserAndApps = async () => {
      try {
        // 1. Fetch Creator Profile
        const resProfile = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(username)}`);

        if (!resProfile.ok) {
          console.warn('Creator profile not found via API');
          setLoading(false);
          setLoadingApps(false);
          return;
        }

        const userData = await resProfile.json();
        setUser(userData);
        setLoading(false);

        // 2. Fetch Creator Apps
        const resApps = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(username)}/apps`);
        if (resApps.ok) {
          const jsonApps = await resApps.json();
          // The API returns { items: [], count: 0 }
          setUserApps(jsonApps.items || []);
        } else {
          console.warn('Failed to fetch apps');
        }

      } catch (err) {
        console.error('Error fetching user or apps:', err)
      } finally {
        setLoading(false)
        setLoadingApps(false)
      }
    }
    fetchUserAndApps()
  }, [username])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-slate-100 dark:bg-zinc-800 p-4 rounded-full mb-4">
          <LayoutGrid className="h-8 w-8 text-slate-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">User not found</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">We couldn&apos;t find a profile for @{username}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>
    )
  }

  const handleToggleFavorite = () => {
    console.log(`Toggle favorite for creator: ${user.displayName || username}`);
    // Future: Implement Firestore logic to add/remove creator from favorites
  };

  const handleSubscribeToCreator = () => {
    console.log(`Subscribe to creator: ${user.displayName || username}`);
    // Future: Implement Firestore logic to subscribe to creator's repository
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-zinc-950/50">
      {/* Header Banner */}
      <div className="h-48 md:h-64 bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-900 dark:to-teal-900 relative">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative pb-12">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 md:items-start">
            {/* Avatar */}
            <div className="shrink-0 flex justify-center md:justify-start">
              <div className="relative h-32 w-32 rounded-full ring-4 ring-white dark:ring-zinc-900 bg-slate-100 dark:bg-zinc-800 overflow-hidden shadow-lg">
                {user.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName || username}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-4xl font-bold text-slate-300 dark:text-zinc-600">
                    {(user.displayName || username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {user.displayName || username}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium">@{user.handle || username}</p>
              </div>

              {user.bio && (
                <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto md:mx-0 leading-relaxed">
                  {user.bio}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                <button
                  onClick={handleToggleFavorite}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border border-amber-200 dark:border-amber-800/50"
                >
                  <Star className="h-4 w-4" />
                  Add to Favorites
                </button>
                <button
                  onClick={handleSubscribeToCreator}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20"
                >
                  <UserPlus className="h-4 w-4" />
                  Subscribe
                </button>
                <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                  <Share2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Apps Grid */}
        <div className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-emerald-500" />
              Applications
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                {userApps.length}
              </span>
            </h2>
          </div>

          {loadingApps ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-slate-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : userApps.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userApps.map((app) => (
                <AppCard
                  key={app.id}
                  item={app}
                  viewMode="grid"
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 border-dashed">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 mb-4">
                <LayoutGrid className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">No applications yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1">This creator hasn&apos;t published any public applications.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
