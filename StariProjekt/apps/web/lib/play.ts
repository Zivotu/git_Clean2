import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { playHref } from '@/lib/urls';

async function resolveCurrentUser(): Promise<User | null> {
  const authInstance = auth;
  if (!authInstance) return null;
  if (authInstance.currentUser) return authInstance.currentUser;
  return await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(
      authInstance,
      (u) => {
        unsubscribe();
        resolve(u ?? null);
      },
      () => {
        unsubscribe();
        resolve(null);
      },
    );
  });
}

export async function getPlayUrl(id: string): Promise<string> {
  const user = await resolveCurrentUser();
  const token = user ? await user.getIdToken() : undefined;
  return playHref(id, { run: 1, token });
}

