'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { apiAuthedPost } from './api';
import { onAuthStateChanged, type User, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { ensureUserDoc } from './ensureUserDoc';

type AuthCtx = { user: User | null; loading: boolean };
const Ctx = createContext<AuthCtx>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    // In sandboxed iframes, prefer in-memory persistence to avoid storage restrictions
    try {
      const inIframe = typeof window !== 'undefined' && window.self !== window.top;
      if (inIframe) {
        // Fire-and-forget; if this fails we continue with default persistence
        void setPersistence(auth, inMemoryPersistence).catch(() => { });
      }
    } catch { }

    let unsubscribeFirestore: (() => void) | null = null;

    const off = onAuthStateChanged(auth, async (u) => {
      // Clean up previous Firestore listener
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Set initial user from Firebase Auth
      setUser(u);
      setLoading(false);

      if (u) {
        try {
          // Detect user's current locale from cookie or default to 'en'
          const getLocale = () => {
            if (typeof document !== 'undefined') {
              const cookies = document.cookie.split(';');
              for (const cookie of cookies) {
                const [key, value] = cookie.trim().split('=');
                if (key === 'NEXT_LOCALE') {
                  return decodeURIComponent(value);
                }
              }
            }
            return 'en';
          };
          const locale = getLocale();

          // Proactively refresh the ID token so Firestore has a valid auth context
          try { await u.getIdToken(true); } catch { }
          await ensureUserDoc({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            locale,
          });
          // Track visit
          apiAuthedPost('/me/visit').catch(() => { });

          // Set up real-time listener for Firestore creator data
          if (db) {
            const creatorRef = doc(db, 'creators', u.uid);
            unsubscribeFirestore = onSnapshot(
              creatorRef,
              (snapshot) => {
                if (snapshot.exists()) {
                  const data = snapshot.data();
                  // Create an enhanced user object with Firestore data
                  const enhancedUser = Object.create(u) as User;
                  // Override displayName and photoURL with Firestore data if available
                  Object.defineProperty(enhancedUser, 'displayName', {
                    value: data.displayName || u.displayName,
                    writable: false,
                    enumerable: true,
                    configurable: true,
                  });
                  Object.defineProperty(enhancedUser, 'photoURL', {
                    value: data.photoURL || data.photo || u.photoURL,
                    writable: false,
                    enumerable: true,
                    configurable: true,
                  });
                  setUser(enhancedUser);
                }
              },
              (error) => {
                console.error('Error listening to creator data:', error);
              }
            );
          }
        } catch (err) {
          // Retry once after a brief tick in case token/persistence just initialized
          try {
            await new Promise((r) => setTimeout(r, 50));
            try { await u.getIdToken(); } catch { }
            const getLocale = () => {
              if (typeof document !== 'undefined') {
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                  const [key, value] = cookie.trim().split('=');
                  if (key === 'NEXT_LOCALE') {
                    return decodeURIComponent(value);
                  }
                }
              }
              return 'en';
            };
            const locale = getLocale();
            await ensureUserDoc({
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              locale,
            });
          } catch (err2) {
            console.error('Error ensuring user document', err2);
          }
        }
      }
    });
    return () => {
      off();
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, []);

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
