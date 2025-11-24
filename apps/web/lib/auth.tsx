'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import { apiAuthedPost } from './api';
import { onAuthStateChanged, type User, setPersistence, inMemoryPersistence } from 'firebase/auth';
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
    const off = onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      setLoading(false);

      if (u) {
        try {
          // Proactively refresh the ID token so Firestore has a valid auth context
          try { await u.getIdToken(true); } catch { }
          await ensureUserDoc({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
          });
          // Track visit
          apiAuthedPost('/me/visit').catch(() => { });
        } catch (err) {
          // Retry once after a brief tick in case token/persistence just initialized
          try {
            await new Promise((r) => setTimeout(r, 50));
            try { await u.getIdToken(); } catch { }
            await ensureUserDoc({
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
            });
          } catch (err2) {
            console.error('Error ensuring user document', err2);
          }
        }
      }
    });
    return () => off();
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
