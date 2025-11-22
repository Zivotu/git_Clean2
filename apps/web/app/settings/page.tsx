'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { useAuth, getDisplayName } from '@/lib/auth';
import { updateProfile } from 'firebase/auth';
import { db, storage } from '@/lib/firebase';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'; // Added getDoc, collection, query, where, getDocs
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PUBLIC_API_URL } from '@/lib/config';

function Toast({
  message,
  type = 'success',
  onClose,
}: {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: 'from-emerald-500 to-green-600',
    error: 'from-red-500 to-red-600',
  } as const;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slideInRight">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-lg bg-gradient-to-r ${colors[type]}`}
      >
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}

const THREE_MONTHS_IN_MS = 3 * 30 * 24 * 60 * 60 * 1000; // Rough calculation

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [repositoryName, setRepositoryName] = useState('');
  const [initialRepositoryName, setInitialRepositoryName] = useState('');
  const [repositoryNameError, setRepositoryNameError] = useState<string | null>(null);
  const [lastChangeTimestamp, setLastChangeTimestamp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [appId, setAppId] = useState('');
  const [versions, setVersions] = useState<
    { buildId: string; version: number; archivedAt: number }[]
  >([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (user && db) {
      setName(getDisplayName(user));

      const fetchCreatorProfile = async () => {
        const creatorDocRef = doc(db, 'creators', user.uid);
        const creatorDocSnap = await getDoc(creatorDocRef);
        if (creatorDocSnap.exists()) {
          const creatorData = creatorDocSnap.data();
          const currentRepoName = creatorData.customRepositoryName || creatorData.handle || getDisplayName(user);
          setRepositoryName(currentRepoName);
          setInitialRepositoryName(currentRepoName);
          setLastChangeTimestamp(creatorData.lastRepositoryNameChangeTimestamp || null);
        } else {
          // If no creator document, use display name as default
          const defaultRepoName = getDisplayName(user);
          setRepositoryName(defaultRepoName);
          setInitialRepositoryName(defaultRepoName);
          setLastChangeTimestamp(null);
        }
      };
      fetchCreatorProfile();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setRepositoryNameError(null);

    // Validate repository name format
    if (!repositoryName.trim()) {
      setRepositoryNameError('Repository name cannot be empty.');
      setBusy(false);
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(repositoryName)) {
      setRepositoryNameError('Repository name can only contain letters, numbers, hyphens, and underscores.');
      setBusy(false);
      return;
    }

    // Cooldown check
    const now = Date.now();
    const canChange = !lastChangeTimestamp || (now - lastChangeTimestamp) > THREE_MONTHS_IN_MS;
    const repositoryNameChanged = repositoryName !== initialRepositoryName;

    if (repositoryNameChanged && !canChange) {
      setRepositoryNameError('You can only change your repository name once every three months.');
      setBusy(false);
      return;
    }

    try {
      let photoURL = user.photoURL || null;
      if (file && storage) {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        try {
          await uploadBytes(storageRef, file);
        } catch (err) {
          console.error('Error uploading avatar', err);
          setToast({
            message: 'Upload failed. Please try again or contact support.',
            type: 'error',
          });
          setBusy(false); // Make sure to set busy to false on error before returning
          return;
        }
        photoURL = await getDownloadURL(storageRef);
      }
      await updateProfile(user, { displayName: name, photoURL: photoURL || undefined });
      if (db) {
        const updateData: { displayName: string; photoURL: string | null; customRepositoryName?: string; lastRepositoryNameChangeTimestamp?: number; } = {
          displayName: name,
          photoURL: photoURL,
        };

        if (repositoryNameChanged && canChange) {
          // Perform uniqueness check for repositoryName
          const creatorsRef = collection(db, 'creators');
          const q = query(creatorsRef, where('customRepositoryName', '==', repositoryName));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty && querySnapshot.docs[0].id !== user.uid) {
            setRepositoryNameError('This repository name is already taken.');
            setBusy(false);
            return;
          }

          updateData.customRepositoryName = repositoryName;
          updateData.lastRepositoryNameChangeTimestamp = now;
        }

        await updateDoc(doc(db, 'creators', user.uid), updateData);
        setToast({ message: 'Profil ažuriran', type: 'success' });
        // After successful update, re-initialize initialRepositoryName and lastChangeTimestamp
        if (repositoryNameChanged && canChange) {
          setInitialRepositoryName(repositoryName);
          setLastChangeTimestamp(now);
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setToast({ message: 'Failed to update profile. Please try again.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const loadVersions = async () => {
    // TODO: Implement version loading logic
    console.log('loadVersions called');
  };

  const restoreVersion = async (buildId: string) => {
    // TODO: Implement version restore logic
    console.log('restoreVersion called', buildId);
  };

  const timeRemainingForChange = lastChangeTimestamp
    ? THREE_MONTHS_IN_MS - (Date.now() - lastChangeTimestamp)
    : 0;
  const daysRemaining = Math.ceil(timeRemainingForChange / (1000 * 60 * 60 * 24));
  const canChangeRepoName = daysRemaining <= 0;

  if (loading) {
    return (
      <main className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <main className="max-w-md mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Postavke profila</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar uid={user.uid} src={user.photoURL ?? undefined} name={name} size={64} />
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
            Ime koje vide posjetitelji
          </label>
          <input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ime"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="repositoryName" className="block text-sm font-medium text-gray-700">
            Ime repozitorija (jednom u tri mjeseca)
          </label>
          <input
            id="repositoryName"
            value={repositoryName}
            onChange={(e) => setRepositoryName(e.target.value)}
            placeholder="Ime repozitorija"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            disabled={!canChangeRepoName && repositoryName !== initialRepositoryName} // Disable if not allowed to change and it's not the initial name
          />
          {repositoryNameError && (
            <p className="mt-1 text-sm text-red-600">{repositoryNameError}</p>
          )}
          {!canChangeRepoName && repositoryName === initialRepositoryName && (
            <p className="mt-1 text-sm text-gray-500">
              Možete promijeniti ime repozitorija za {daysRemaining} dana.
            </p>
          )}
          {repositoryName === initialRepositoryName && (
            <p className="mt-1 text-sm text-gray-500">
              Vaše repozitorij ime je: <Link href={`/u/${repositoryName}`} className="text-blue-600 underline">{repositoryName}</Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || (!canChangeRepoName && repositoryName !== initialRepositoryName)}
            className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
          >
            {busy ? 'Spremanje...' : 'Spremi'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded border border-gray-300"
          >
            Odustani
          </button>
        </div>
      </form>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Archived Versions</h2>
        <div className="flex gap-2">
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="App ID"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            onClick={loadVersions}
            disabled={loadingVersions}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {loadingVersions ? 'Loading...' : 'Load'}
          </button>
        </div>
        {versions.length > 0 && (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.buildId} className="flex items-center gap-2">
                <span className="flex-1">v{v.version}</span>
                <button
                  type="button"
                  onClick={() => restoreVersion(v.buildId)}
                  className="px-2 py-1 text-sm rounded bg-emerald-600 text-white"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}

