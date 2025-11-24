'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import {
  FavoriteCreatorMeta,
  deleteFavorite,
  getLocalFavorite,
  isFavorite,
  persistFavorite,
} from '@/lib/favorites';

type FollowButtonProps = {
  creatorId: string;
  handle: string;
  displayName?: string | null;
  photoURL?: string | null;
};

export default function FollowButton({ creatorId, handle, displayName, photoURL }: FollowButtonProps) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<boolean>(() => Boolean(getLocalFavorite(creatorId)));

  // On mount, detect if already favorited (Firestore first, then localStorage)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await isFavorite(creatorId, user?.uid);
      if (!cancelled) setDone(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, creatorId]);

  const onClick = async () => {
    if (!user) return;
    try {
      setBusy(true);
      const meta: FavoriteCreatorMeta = {
        id: creatorId,
        handle,
        displayName: displayName ?? handle,
        photoURL: photoURL ?? null,
      };
      if (!done) {
        await persistFavorite(meta, user.uid);
        setDone(true);
      } else {
        await deleteFavorite(creatorId, user.uid);
        setDone(false);
      }
    } catch (e) {
      console.error('Favorite toggle failed', e);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <span>Dodaj u favorite</span>
      </Link>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${done ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-gray-300 hover:bg-gray-50'}`}
      title={done ? 'Ukloni iz favorita' : 'Dodaj u favorite'}
    >
      <svg className={`w-5 h-5 ${done ? 'text-red-500' : ''}`} fill={done ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
      <span>{done ? 'Ukloni iz favorita' : 'Dodaj u favorite'}</span>
    </button>
  );
}
