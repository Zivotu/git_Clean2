import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { apiAuthedPost } from './api';

export type MinimalUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  locale?: string;
};

export async function ensureUserDoc(user: MinimalUser) {
  if (!db) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Novi korisnik - koristi merge:false da spriječiš miješanje podataka
    await setDoc(
      ref,
      {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        username: user.email?.split('@')[0] ?? null,
        createdAt: serverTimestamp(),
      },
      { merge: false }
    );
    try {
      await apiAuthedPost('me/welcome-email', {
        email: user.email,
        displayName: user.displayName ?? undefined,
        locale: user.locale ?? 'en',
      });
    } catch (err) {
      console.warn('Failed to trigger welcome email', err);
    }
  } else {
    // Postojeći korisnik - ažuriraj samo email i username, NE photoURL i displayName
    // da spriječiš session confusion gdje se podaci miješaju između korisnika
    const updates: any = {
      email: user.email ?? null,
      updatedAt: serverTimestamp(),
    };

    // Ažuriraj username samo ako ne postoji
    const existingData = snap.data() as any;
    if (!existingData?.username && user.email) {
      updates.username = user.email.split('@')[0];
    }

    await setDoc(ref, updates, { merge: true });
  }
}

