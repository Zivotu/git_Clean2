'use client'

import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import AppCard, { Listing } from '@/components/AppCard'
import { PUBLIC_API_URL } from '@/lib/config'

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

  if (loading)
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading profile...</div>

  if (!user)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center">
        <h1 className="text-3xl font-bold mb-2">User not found</h1>
        <p className="text-gray-500 mb-4">No profile for @{username}</p>
        <Link href="/" className="text-blue-600 underline">
          ← Back to home
        </Link>
      </div>
    )

  const handleToggleFavorite = () => {
    console.log(`Toggle favorite for creator: ${user.displayName || username}`);
    // Future: Implement Firestore logic to add/remove creator from favorites
  };

  const handleSubscribeToCreator = () => {
    console.log(`Subscribe to creator: ${user.displayName || username}`);
    // Future: Implement Firestore logic to subscribe to creator's repository
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      {user.photoURL && (
        <Image
          src={user.photoURL}
          alt={user.displayName || username}
          width={120}
          height={120}
          className="rounded-full shadow mb-4"
        />
      )}
      <h1 className="text-3xl font-bold mb-1">{user.displayName || username}</h1>
      <p className="text-gray-600 mb-4">@{user.handle || username}</p>
      {user.bio && <p className="text-gray-700 max-w-md">{user.bio}</p>}

      <div className="mt-6 flex gap-4">
        <button
          onClick={handleToggleFavorite}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-white rounded-full shadow hover:bg-yellow-500 transition"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.538 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.538-1.118l1.07-3.292a1 1 0 00-.364-1.118l-2.8-2.034c-.783-.57-.38-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
          </svg>
          Add to Favorites
        </button>
        <button
          onClick={handleSubscribeToCreator}
          className="px-4 py-2 bg-emerald-600 text-white rounded-full shadow hover:bg-emerald-700 transition"
        >
          Subscribe to Creator
        </button>
      </div>

      <div className="mt-12 w-full max-w-4xl">
        <h2 className="text-2xl font-bold mb-6 text-left">Creator&apos;s Applications</h2>
        {loadingApps ? (
          <div className="text-gray-500 text-center">Loading applications...</div>
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
          <div className="text-gray-500 text-center">No public applications found for this creator.</div>
        )}
      </div>
    </div>
  )
}
