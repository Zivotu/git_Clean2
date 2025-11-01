'use client';

import { useState, ChangeEvent, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiAuthedPost, ApiError } from '@/lib/api';
import { useAuth, getDisplayName } from '@/lib/auth';
import ProgressModal from '@/components/ProgressModal';
import { useBuildEvents, BuildStatus } from '@/hooks/useBuildEvents';
import type { BuildState as ProgressModalState } from '@/components/ProgressModal';

// Temporary draft type for building manifest locally
interface ManifestDraft {
  name: string;
  description: string;
  permissions: {
    camera: boolean;
    microphone: boolean;
    webgl: boolean;
    download: boolean;
  };
}

const friendlyByCode: Record<string, string> = {
  NET_OPEN_NEEDS_DOMAINS: 'Dodaj barem jednu domenu (npr. api.example.com).',
  ses_lockdown: 'SES/lockdown nije podržan u browseru. Ukloni ga ili pokreni samo na serveru.',
  max_apps: 'Dosegnut je maksimalan broj aplikacija za tvoj plan.'
};

export default function CreatePage() {
  const [code, setCode] = useState('');
  const [manifest, setManifest] = useState<ManifestDraft>({
    name: '',
    description: '',
    permissions: {
      camera: false,
      microphone: false,
      webgl: false,
      download: false,
    },
  });
  const [publishError, setPublishError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [authError, setAuthError] = useState('');
  const { user } = useAuth();
  const router = useRouter();
  const [showProgress, setShowProgress] = useState(false);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);

  const { status: buildStatus, reason: buildError, listingId } = useBuildEvents(currentBuildId);

  const progressModalState = useMemo((): ProgressModalState | null => {
    if (!buildStatus) return null;
    const mapping: Record<BuildStatus, ProgressModalState> = {
      queued: 'queued',
      bundling: 'running',
      verifying: 'running',
      success: 'success',
      failed: 'error',
    };
    return mapping[buildStatus];
  }, [buildStatus]);

  useEffect(() => {
    if (buildStatus) {
      setShowProgress(true);
    }
    if (buildStatus === 'success' && listingId) {
      // Redirect to My Projects with a congratulations/info toast
      setTimeout(() => router.push(`/my?submitted=1`), 800);
    }
  }, [buildStatus, listingId, router]);


  const publish = async () => {
    setPublishError('');
    setAuthError('');
    setPublishing(true);
    setCurrentBuildId(null);

    try {
      if (!user) {
        setAuthError('Za objavu se prvo prijavi.');
        return;
      }

      const sesRe = /(lockdown\s*\(|require\s*\(\s*['"]ses['"]\s*\)|from\s+['"]ses['"]|import\s*\(\s*['"]ses['"]\s*\))/;
      if (sesRe.test(code)) {
        setPublishError('SES/lockdown nije podržan u browseru. Ukloni ga iz koda ili ga pokreni samo na serveru.');
        return;
      }

      const capabilitiesPayload: Record<string, any> = {
        permissions: {
          camera: manifest.permissions.camera,
          microphone: manifest.permissions.microphone,
          webgl: manifest.permissions.webgl,
          fileDownload: manifest.permissions.download,
        },
      };

      const payload = {
        title: manifest.name,
        description: manifest.description,
        author: {
          uid: user.uid || '',
          name: getDisplayName(user || null),
          photo: user.photoURL || undefined,
          handle: (user.email || '').split('@')[0] || undefined,
        },
        capabilities: capabilitiesPayload,
        inlineCode: code,
        visibility: 'public',
      };

      const json = await apiAuthedPost<{
        buildId?: string;
        listingId?: string | number;
        slug?: string;
        error?: { errorCode?: string; message?: string };
      }>('/publish', payload);

      if (json.buildId) {
        setCurrentBuildId(json.buildId);
      } else {
        throw new Error('Build ID not returned from server');
      }

    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          setAuthError('Nisi prijavljen ili je sesija istekla. Prijavi se i pokušaj ponovno.');
        } else {
          const code = e.code as string | undefined;
          const friendly = (code && friendlyByCode[code]) || e.message || code || 'Greška pri objavi';
          setPublishError(friendly);
        }
      } else {
        setPublishError(String(e));
      }
      setShowProgress(false);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden">
      {showProgress && (
        <ProgressModal
          state={progressModalState}
          error={buildError || undefined}
          onClose={() => {
            setShowProgress(false);
            setCurrentBuildId(null);
          }}
        />
      )}
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="space-y-4">
            <h2 className="font-semibold">Izvor aplikacije</h2>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-64 border rounded p-2 font-mono text-sm"
              placeholder={'Zalijepi HTML ili React (JSX) kod...'}
            />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">Osnove</h2>
          <div>
            <label className="block text-sm font-medium">Ime</label>
            <input
              className="w-full border rounded p-1 text-sm"
              value={manifest.name}
              onChange={(e) => setManifest({ ...manifest, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Opis</label>
            <textarea
              className="w-full border rounded p-1 text-sm"
              value={manifest.description}
              onChange={(e) => setManifest({ ...manifest, description: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
            <div className="flex flex-col items-end">
                <button
                onClick={publish}
                disabled={publishing || !user || !code || !manifest.name}
                className="px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
                >
                Objavi
                </button>
                {publishError && (
                <p className="text-sm text-red-600 mt-2 max-w-prose text-right">
                    {publishError}
                </p>
                )}
                {!user && (
                <p className="text-sm text-red-600 mt-2">
                    Za objavu se prvo prijavi. <a href="/login" className="underline">Prijava</a>
                </p>
                )}
                {authError && (
                <p className="text-sm text-red-600 mt-2">
                    {authError} <a href="/login" className="underline">Prijava</a>
                </p>
                )}
            </div>
        </div>
      </div>
    </main>
  );
}