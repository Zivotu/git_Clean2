'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import {
  onAuthStateChanged,
  setPersistence,
  inMemoryPersistence,
  type User,
} from 'firebase/auth';
import { ensureUserDoc } from './ensureUserDoc';

type AuthCtx = { user: User | null; loading: boolean };
const Ctx = createContext<AuthCtx>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [persistenceReady, setPersistenceReady] = useState(false);

  // In iframe/sandbox contexts, IndexedDB/cookies can be unavailable.
  // Switch to in-memory persistence so Firebase can attach ID tokens for Firestore rules.
  useEffect(() => {
    if (!auth) {
      setPersistenceReady(true);
      return;
    }
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (!isIframe) {
      setPersistenceReady(true);
      return;
    }
    (async () => {
      try {
        await setPersistence(auth, inMemoryPersistence);
        // eslint-disable-next-line no-console
        console.info('[Auth] Using inMemoryPersistence in iframe context');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] Failed to set inMemoryPersistence', e);
      } finally {
        setPersistenceReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    if (!persistenceReady) return;

    const off = onAuthStateChanged(auth, async (u: User | null) => {
      setUser(u ?? null);
      setLoading(false);

      if (u) {
        try {
          // Ensure we have a fresh ID token available for Firestore rules
          try {
            await u.getIdToken(true);
          } catch {
            await u.getIdToken();
          }

          const ensureWithRetry = async (retries = 2) => {
            try {
              await ensureUserDoc({
                uid: u.uid,
                email: u.email,
                displayName: u.displayName,
                photoURL: u.photoURL,
              });
            } catch (err: unknown) {
              const code = (err as any)?.code ?? '';
              if (retries > 0 && (code === 'permission-denied' || code === 'unauthenticated')) {
                await new Promise((r) => setTimeout(r, 500));
                return ensureWithRetry(retries - 1);
              }
              throw err;
            }
          };

          await ensureWithRetry();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error ensuring user document', err);
        }
      }
    });
    return () => off();
  }, [persistenceReady]);

  return <Ctx.Provider value={{ user, loading }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function getDisplayName(user: User | null): string {
  if (!user) return '';
  if (user.displayName) return user.displayName;
  const email = user.email || '';
  const local = email.split('@')[0] || '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
}
