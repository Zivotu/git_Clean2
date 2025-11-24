'use client';

import { db } from '@/lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export type FavoriteCreatorMeta = {
  id: string;
  handle: string;
  displayName?: string | null;
  photoURL?: string | null;
};

const LOCAL_KEY = 'cx:favorites';

function readLocalMap(): Record<string, FavoriteCreatorMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, FavoriteCreatorMeta>) : {};
  } catch (err) {
    console.warn('[favorites] Failed to read local cache', err);
    return {};
  }
}

function writeLocalMap(map: Record<string, FavoriteCreatorMeta>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[favorites] Failed to persist local cache', err);
  }
}

export function getLocalFavorite(id: string): FavoriteCreatorMeta | undefined {
  const map = readLocalMap();
  return map[id];
}

export function setLocalFavorite(meta: FavoriteCreatorMeta) {
  const map = readLocalMap();
  map[meta.id] = {
    id: meta.id,
    handle: meta.handle,
    displayName: meta.displayName ?? null,
    photoURL: meta.photoURL ?? null,
  };
  writeLocalMap(map);
}

export function removeLocalFavorite(id: string) {
  const map = readLocalMap();
  if (map[id]) {
    delete map[id];
    writeLocalMap(map);
  }
}

export function listLocalFavorites(): FavoriteCreatorMeta[] {
  return Object.values(readLocalMap());
}

export async function fetchRemoteFavorites(uid?: string | null): Promise<FavoriteCreatorMeta[]> {
  if (!uid || !db) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'favorites'));
    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        handle: (data.handle as string) ?? docSnap.id,
        displayName: (data.displayName as string | null) ?? null,
        photoURL: (data.photoURL as string | null) ?? null,
      };
    });
  } catch (err) {
    console.warn('[favorites] Failed to fetch remote favorites', err);
    return [];
  }
}

export async function isFavorite(id: string, uid?: string | null): Promise<boolean> {
  if (uid && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'favorites', id));
      if (snap.exists()) return true;
    } catch (err) {
      console.warn('[favorites] Failed to check remote favorite, falling back to local', err);
    }
  }
  return Boolean(getLocalFavorite(id));
}

export async function persistFavorite(meta: FavoriteCreatorMeta, uid?: string | null) {
  if (uid && db) {
    try {
      const ref = doc(db, 'users', uid, 'favorites', meta.id);
      await setDoc(
        ref,
        {
          creatorId: meta.id,
          handle: meta.handle,
          displayName: meta.displayName ?? null,
          photoURL: meta.photoURL ?? null,
          followedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.warn('[favorites] Failed to persist favorite remotely, keeping local only', err);
    }
  }
  setLocalFavorite(meta);
}

export async function deleteFavorite(id: string, uid?: string | null) {
  if (uid && db) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'favorites', id));
    } catch (err) {
      console.warn('[favorites] Failed to delete remote favorite, removing local anyway', err);
    }
  }
  removeLocalFavorite(id);
}

export async function syncFavorites(uid?: string | null): Promise<FavoriteCreatorMeta[]> {
  const remote = await fetchRemoteFavorites(uid);
  if (remote.length) {
    remote.forEach(setLocalFavorite);
    return remote;
  }
  return listLocalFavorites();
}
