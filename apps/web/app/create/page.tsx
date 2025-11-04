'use client';

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { apiAuthedPost, ApiError, apiGet, apiPost } from '@/lib/api';
import { useAuth, getDisplayName } from '@/lib/auth';
import ProgressModal, { type BuildState as ProgressModalState } from '@/components/ProgressModal';
import { useBuildEvents, type BuildStatus } from '@/hooks/useBuildEvents';
import {
  MAX_PREVIEW_SIZE_BYTES,
  PREVIEW_PRESET_PATHS,
  createPresetPreviewFile,
} from '@/lib/previewClient';

type Mode = 'html' | 'react';
type SubmissionType = 'code' | 'bundle';

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

const overlayMaxChars = 22;
const stepsList = ['Izvor', 'Osnove'] as const;

const friendlyByCode: Record<string, string> = {
  NET_OPEN_NEEDS_DOMAINS: 'Dodaj barem jednu domenu (npr. api.example.com).',
  NET_DOMAIN_NOT_ALLOWED: 'Ta domena nije dopuštena.',
  LLM_MISSING_API_KEY: 'Nedostaje LLM API ključ.',
  LLM_INVALID_JSON: 'AI servis je vratio neispravan JSON.',
  LLM_UNREACHABLE: 'AI servis trenutno nije dostupan.',
  BUILD_PUBLISH_RENAME_FAILED: 'Objavljivanje nije uspjelo. Pokušaj ponovno.',
  ses_lockdown: 'SES/lockdown nije podržan u browseru. Ukloni ga ili pokreni samo na serveru.',
  ses_compartment: 'Kod koristi SES Compartment – potrebno je ručno odobrenje.',
  max_apps: 'Dosegnut je maksimalan broj aplikacija za tvoj plan.',
};

const detectMode = (value: string): Mode =>
  value.trim().startsWith('<') ? 'html' : 'react';

const readFileAsDataUrl = async (file: File) =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_error'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });

const deriveAppId = (name: string): string => {
  const fallback = `app-${Date.now()}`;
  const raw = name.toLowerCase().trim();
  const ascii = raw
    ? raw
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
    : '';
  const cleaned = ascii.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
  return cleaned || fallback;
};

const mapJobState = (state: string): ProgressModalState => {
  if (!state) return 'running';
  const normalized = state.toLowerCase();
  if (['waiting', 'delayed', 'waiting-children', 'queued'].includes(normalized)) return 'queued';
  if (['active', 'running', 'processing'].includes(normalized)) return 'running';
  if (['completed', 'success', 'finished'].includes(normalized)) return 'success';
  if (['failed', 'error', 'stalled'].includes(normalized)) return 'error';
  return 'running';
};

export default function CreatePage() {
  const [step, setStep] = useState(0);
  const [submissionType, setSubmissionType] = useState<SubmissionType>('code');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('html');
  const bundleInputRef = useRef<HTMLInputElement | null>(null);
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleError, setBundleError] = useState('');

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

  const [trEn, setTrEn] = useState({ title: '', description: '' });
  const [trDe, setTrDe] = useState({ title: '', description: '' });
  const [trHr, setTrHr] = useState({ title: '', description: '' });
  const [openEn, setOpenEn] = useState(false);
  const [openDe, setOpenDe] = useState(false);
  const [openHr, setOpenHr] = useState(false);

  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const [previewChoice, setPreviewChoice] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState(() => PREVIEW_PRESET_PATHS[0]);
  const [overlayTitle, setOverlayTitle] = useState('');
  const [customPreview, setCustomPreview] = useState<{ file: File; dataUrl: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewUploading, setPreviewUploading] = useState(false);

  const [publishError, setPublishError] = useState('');
  const [authError, setAuthError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const { user } = useAuth();
  const router = useRouter();

  const [showProgress, setShowProgress] = useState(false);
  const [buildStep, setBuildStep] = useState('');
  const [manualBuildState, setManualBuildState] = useState<ProgressModalState | null>(null);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);
  const [localJobLog, setLocalJobLog] = useState('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const modalState = progressModalState ?? manualBuildState;

  useEffect(() => {
    if (buildStatus) {
      setManualBuildState(null);
      setShowProgress(true);
    }
    if (buildStatus === 'success' && listingId) {
      setTimeout(() => router.push('/my?submitted=1'), 800);
    }
  }, [buildStatus, listingId, router]);

  useEffect(() => () => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    const permissions = {
      camera: false,
      microphone: false,
      webgl: false,
      download: false,
    };
    const gum = /navigator\.mediaDevices\.getUserMedia\s*\(([^)]*)\)/s.exec(code);
    if (gum) {
      const args = gum[1];
      const hasVideo = /video\s*:/s.test(args);
      const hasAudio = /audio\s*:/s.test(args);
      permissions.camera = hasVideo || (!hasVideo && !hasAudio);
      permissions.microphone = hasAudio || (!hasVideo && !hasAudio);
    }
    if (/getContext\s*\(\s*['"]webgl2?['\"]/s.test(code)) permissions.webgl = true;
    setManifest((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, ...permissions },
    }));
  }, [code]);

  const stopJobPolling = useCallback(() => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const watchLocalBundle = useCallback(
    (appId: string, jobId: string) => {
      stopJobPolling();
      setShowProgress(true);
      setManualBuildState('queued');
      setBuildStep('queued');
      setPublishError('');
      setBundleError('');
      setLocalJobLog('');
      setLocalPreviewUrl(null);
      setCurrentBuildId(null);

      const fetchStatus = async () => {
        try {
          const data = await apiGet<{
            state?: string;
            status?: string;
            step?: string;
            log?: string;
            preview?: string;
            error?: string;
            buildId?: string;
          }>(`/apps/${appId}/build-status/${jobId}`, { auth: true });
          const state = data.state || data.status || '';
          const mapped = mapJobState(state);
          setManualBuildState(mapped);
          if (data.step) setBuildStep(data.step);
          if (data.log) {
            setLocalJobLog((prev) => (prev ? `${prev}\n${data.log}` : data.log || ''));
          }
          if (data.preview) {
            setLocalPreviewUrl(data.preview);
          }
          if (mapped === 'error') {
            stopJobPolling();
            setPublishing(false);
            setPublishError(data.error || 'Build nije uspio. Provjeri log ispod.');
          } else if (mapped === 'success' && data.buildId) {
            stopJobPolling();
            setManualBuildState(null);
            setCurrentBuildId(data.buildId);
            setPublishing(false);
          }
        } catch (err) {
          stopJobPolling();
          setManualBuildState('error');
          setPublishing(false);
          const message =
            err instanceof ApiError && err.message
              ? err.message
              : 'Greška pri praćenju builda.';
          setPublishError(message);
        }
      };

      void fetchStatus();
      jobPollRef.current = setInterval(() => {
        void fetchStatus();
      }, 1500);
    },
    [stopJobPolling],
  );

  const handleSubmissionTypeChange = (value: SubmissionType) => {
    setSubmissionType(value);
    setPublishError('');
    setBundleError('');
    setLocalJobLog('');
    setLocalPreviewUrl(null);
    if (value === 'code') {
      setBundleFile(null);
      if (bundleInputRef.current) bundleInputRef.current.value = '';
    }
  };

  const handleNext = () =>
    setStep((prev) => Math.min(prev + 1, stepsList.length - 1));
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 0));

  const handleCodeChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setCode(value);
    setMode(detectMode(value));
  };

  const handleBundleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setBundleFile(null);
      setBundleError('');
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.zip')) {
      setBundleFile(null);
      setBundleError('Podržavamo samo .zip pakete.');
      if (bundleInputRef.current) bundleInputRef.current.value = '';
      return;
    }
    setBundleFile(file);
    setBundleError('');
  };

  const clearBundleSelection = () => {
    setBundleFile(null);
    setBundleError('');
    if (bundleInputRef.current) bundleInputRef.current.value = '';
  };

  const handlePresetSelect = (preset: (typeof PREVIEW_PRESET_PATHS)[number]) => {
    setPreviewChoice('preset');
    setSelectedPreset(preset);
    setCustomPreview(null);
    setPreviewError('');
  };

  const handleCustomPreview = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewError('');
    if (file.size > MAX_PREVIEW_SIZE_BYTES) {
      setCustomPreview(null);
      setPreviewChoice('preset');
      setPreviewError('Datoteka je prevelika. Maksimalno 1MB.');
      if (previewInputRef.current) previewInputRef.current.value = '';
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCustomPreview({ file, dataUrl });
      setPreviewChoice('custom');
    } catch {
      setCustomPreview(null);
      setPreviewChoice('preset');
      setPreviewError('Neuspješno čitanje datoteke.');
      if (previewInputRef.current) previewInputRef.current.value = '';
    }
  };

  const resetCustomPreview = () => {
    setCustomPreview(null);
    setPreviewChoice('preset');
    setPreviewError('');
    if (previewInputRef.current) previewInputRef.current.value = '';
  };

  const ensurePreviewForSlug = async () => {
    setPreviewUploading(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setPreviewUploading(false);
    return true;
  };

  const publish = async () => {
    stopJobPolling();
    setPublishError('');
    setAuthError('');
    setBundleError('');
    setPreviewError('');
    setLocalJobLog('');
    setLocalPreviewUrl(null);
    setManualBuildState(null);
    setCurrentBuildId(null);

    try {
      if (!user) {
        setAuthError('Za objavu se prvo prijavi.');
        return;
      }

      if (submissionType === 'bundle') {
        if (!bundleFile) {
          setBundleError('Odaberi ZIP datoteku.');
          return;
        }
        setPublishing(true);
        try {
          const appId = deriveAppId(manifest.name || bundleFile.name);
          const form = new FormData();
          form.append('file', bundleFile, bundleFile.name);
          const upload = await apiPost<{ jobId?: string }>(
            `/apps/${appId}/upload`,
            form,
            { auth: true },
          );
          if (!upload?.jobId) {
            setPublishError('Upload paketa nije uspio. Pokušaj ponovno.');
            setPublishing(false);
            return;
          }
          watchLocalBundle(appId, upload.jobId);
        } catch (err) {
          setPublishing(false);
          if (err instanceof ApiError) {
            if (err.status === 401) {
              setAuthError('Nisi prijavljen ili je sesija istekla. Prijavi se i pokušaj ponovno.');
            } else {
              setPublishError(err.message || 'Upload nije uspio.');
            }
          } else {
            setPublishError(String(err));
          }
        }
        return;
      }

      const sesRe =
        /(lockdown\s*\(|\brequire\s*\(\s*['"]ses['"]\s*\)|\bfrom\s+['"]ses['"]|import\s*\(\s*['"]ses['"]\s*\))/;
      if (sesRe.test(code)) {
        setPublishError('SES/lockdown nije podržan u browseru. Ukloni ga iz koda ili ga pokreni samo na serveru.');
        return;
      }

      const norm = (value: string) => value.trim();
      const translations: Record<string, { title?: string; description?: string }> = {};
      if (norm(trEn.title) || norm(trEn.description)) {
        translations.en = {
          ...(norm(trEn.title) ? { title: norm(trEn.title) } : {}),
          ...(norm(trEn.description) ? { description: norm(trEn.description) } : {}),
        };
      }
      if (norm(trDe.title) || norm(trDe.description)) {
        translations.de = {
          ...(norm(trDe.title) ? { title: norm(trDe.title) } : {}),
          ...(norm(trDe.description) ? { description: norm(trDe.description) } : {}),
        };
      }
      if (norm(trHr.title) || norm(trHr.description)) {
        translations.hr = {
          ...(norm(trHr.title) ? { title: norm(trHr.title) } : {}),
          ...(norm(trHr.description) ? { description: norm(trHr.description) } : {}),
        };
      }

      let previewAttachment: { dataUrl: string } | undefined;
      try {
        if (previewChoice === 'custom' && customPreview?.dataUrl) {
          previewAttachment = { dataUrl: customPreview.dataUrl };
        } else {
          const file = await createPresetPreviewFile(selectedPreset, {
            overlayText: overlayTitle.trim() || undefined,
          });
          const dataUrl = await readFileAsDataUrl(file);
          previewAttachment = { dataUrl };
        }
      } catch (err) {
        console.warn('preview-prep-failed', err);
      }

      setPublishing(true);
      setManualBuildState('queued');
      setShowProgress(true);
      const payload = {
        title: manifest.name,
        description: manifest.description,
        ...(Object.keys(translations).length ? { translations } : {}),
        author: {
          uid: user.uid || '',
          name: getDisplayName(user || null),
          photo: user.photoURL || undefined,
          handle: (user.email || '').split('@')[0] || undefined,
        },
        capabilities: {
          permissions: {
            camera: manifest.permissions.camera,
            microphone: manifest.permissions.microphone,
            webgl: manifest.permissions.webgl,
            fileDownload: manifest.permissions.download,
          },
        },
        inlineCode: code,
        visibility: 'public',
        ...(previewAttachment ? { preview: previewAttachment } : {}),
      };

      const json = await apiAuthedPost<{
        buildId?: string;
        listingId?: string | number;
        slug?: string;
        error?: { errorCode?: string; message?: string };
      }>('/publish', payload);

      if (json.buildId) {
        setCurrentBuildId(json.buildId);
        if (json.slug) {
          void ensurePreviewForSlug();
        }
      } else {
        setPublishError('Build ID nije vraćen s poslužitelja.');
        setShowProgress(false);
        setManualBuildState(null);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAuthError('Nisi prijavljen ili je sesija istekla. Prijavi se i pokušaj ponovno.');
        } else {
          const code = err.code as string | undefined;
          const friendly = (code && friendlyByCode[code]) || err.message || code || 'Greška pri objavi.';
          setPublishError(friendly);
        }
      } else {
        setPublishError(String(err));
      }
      setShowProgress(false);
      setManualBuildState(null);
    } finally {
      setPublishing(false);
    }
  };

  const codeOrBundleFilled =
    submissionType === 'code' ? code.trim().length > 0 : Boolean(bundleFile);
  const titleFilled = manifest.name.trim().length > 0;
  const descFilled = manifest.description.trim().length > 0;
  const imageChosen = Boolean(customPreview?.dataUrl || selectedPreset);
  const allReady = titleFilled && descFilled && imageChosen && codeOrBundleFilled;

  const previewDisplayUrl =
    previewChoice === 'custom' && customPreview?.dataUrl
      ? customPreview.dataUrl
      : selectedPreset;

  const progressPct = useMemo(
    () => ((step + 1) / stepsList.length) * 100,
    [step],
  );

  const ChecklistItem = ({ label, done }: { label: string; done: boolean }) => (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            done ? 'bg-emerald-600' : 'bg-gray-300'
          }`}
        />
        <span className={done ? 'text-gray-700' : 'text-gray-500'}>{label}</span>
      </div>
      <span className={`text-xs ${done ? 'text-emerald-700' : 'text-gray-400'}`}>{done ? '✔' : '—'}</span>
    </div>
  );

  const StepButton = ({
    index,
    label,
  }: {
    index: number;
    label: string;
  }) => (
    <button
      key={label}
      onClick={() => setStep(index)}
      className={`rounded-xl border px-3 py-2 transition text-left shadow-sm ${
        index === step
          ? 'bg-white border-emerald-300 ring-2 ring-emerald-200'
          : 'bg-white/70 hover:bg-white border-gray-200'
      }`}
    >
      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
        {index}
      </span>
      <span className="align-middle font-medium">{label}</span>
    </button>
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white pb-12">
      <AnimatePresence>
        {showProgress && modalState && (
          <ProgressModal
            state={modalState}
            error={buildError || publishError || undefined}
            onClose={() => setShowProgress(false)}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-emerald-700">Objavi novu aplikaciju</h1>
          <div className="flex min-w-[260px] items-center gap-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/60 ring-1 ring-emerald-200">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-sm font-medium text-emerald-700">{Math.round(progressPct)}%</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
          {stepsList.map((label, index) => (
            <StepButton key={label} index={index} label={label} />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {stepsList[step] === 'Izvor' && (
              <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-6">
                <h2 className="text-lg font-semibold">Izvor aplikacije</h2>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="submission-type"
                      value="code"
                      checked={submissionType === 'code'}
                      onChange={() => handleSubmissionTypeChange('code')}
                    />
                    <span>Zalijepi kod</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="submission-type"
                      value="bundle"
                      checked={submissionType === 'bundle'}
                      onChange={() => handleSubmissionTypeChange('bundle')}
                    />
                    <span>Upload paketa (.zip)</span>
                  </label>
                </div>

                {submissionType === 'code' ? (
                  <textarea
                    value={code}
                    onChange={handleCodeChange}
                    className="min-h-[280px] w-full rounded-xl border p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder={
                      mode === 'html'
                        ? 'HTML snipet ili cijela stranica…'
                        : 'React komponenta…'
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      ZIP paket mora sadržavati build izlaz zajedno s datotekama{' '}
                      <code>package.json</code> i <code>pnpm-lock.yaml</code>. Worker će ga lokalno instalirati i pokrenuti{' '}
                      <code>pnpm run build</code>.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => bundleInputRef.current?.click()}
                        className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        Odaberi ZIP
                      </button>
                      <input
                        ref={bundleInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={handleBundleFileChange}
                      />
                      {bundleFile && (
                        <span className="max-w-[220px] truncate text-sm text-gray-700">{bundleFile.name}</span>
                      )}
                      {bundleFile && (
                        <button
                          type="button"
                          className="text-xs text-gray-600 underline"
                          onClick={clearBundleSelection}
                        >
                          Ukloni
                        </button>
                      )}
                    </div>
                    {bundleError && <p className="text-sm text-red-600">{bundleError}</p>}
                    <p className="text-xs text-gray-500">
                      Nakon uspješnog builda dobit ćeš lokalni preview prije slanja na administratorski pregled.
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleNext}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    Dalje →
                  </button>
                </div>
              </section>
            )}

            {stepsList[step] === 'Osnove' && (
              <section className="space-y-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-6">
                <h2 className="text-lg font-semibold">Osnovne informacije</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">Naziv</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                      value={manifest.name}
                      onChange={(event) =>
                        setManifest({ ...manifest, name: event.target.value })
                      }
                      placeholder="Moj super app"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Opis</label>
                    <textarea
                      className="min-h-[80px] w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                      value={manifest.description}
                      onChange={(event) =>
                        setManifest({ ...manifest, description: event.target.value })
                      }
                      placeholder="Kratak opis tvoje aplikacije..."
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 rounded-xl border bg-emerald-50/40 p-3">
                    <label className="text-sm font-medium">Odaberi vlastitu grafiku</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => previewInputRef.current?.click()}
                        className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        Odaberi sliku
                      </button>
                      <input
                        ref={previewInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCustomPreview}
                      />
                      {customPreview && (
                        <button
                          type="button"
                          onClick={resetCustomPreview}
                          className="text-sm text-gray-600 underline"
                        >
                          Ukloni prilagođenu grafiku
                        </button>
                      )}
                      <span className="text-[11px] text-gray-600">Maks. 1MB</span>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">
                        Naslov aplikacije na slici{' '}
                        <span className="font-normal text-gray-500">({overlayMaxChars} znakova)</span>
                      </label>
                      <input
                        value={overlayTitle}
                        onChange={(event) =>
                          setOverlayTitle(event.target.value.slice(0, overlayMaxChars))
                        }
                        maxLength={overlayMaxChars}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                        placeholder="Naslov za overlay…"
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        Ovaj naslov će se prikazati preko svih thumbnailova kao naslov aplikacije.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mt-2 block text-sm font-medium">
                      Ili odaberi jedan od predložaka
                    </label>
                    <p className="text-xs text-gray-600">
                      Klikom na predložak vidiš kako izgleda s naslovom preko slike.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {PREVIEW_PRESET_PATHS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePresetSelect(preset)}
                        className="relative w-full text-left"
                        aria-label="Odaberi predložak"
                      >
                        <div
                          className={`relative overflow-hidden rounded-lg border ${
                            selectedPreset === preset && previewChoice === 'preset'
                              ? 'border-emerald-500 ring-2 ring-emerald-400'
                              : 'border-gray-200'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={preset} alt="preset" className="aspect-video w-full object-cover" />
                          {!!overlayTitle.trim() && (
                            <div className="absolute inset-x-0 bottom-0 break-words bg-slate-900/80 px-3 py-1.5 text-center text-xs font-semibold text-white leading-snug">
                              {overlayTitle.trim().slice(0, overlayMaxChars)}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="relative aspect-video bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewDisplayUrl}
                        alt="App preview"
                        className="h-full w-full object-cover"
                      />
                      {!!overlayTitle.trim() && (
                        <div className="absolute inset-x-0 bottom-0 break-words bg-slate-900/80 px-4 py-2 text-center text-sm font-semibold text-white leading-snug">
                          {overlayTitle.trim().slice(0, overlayMaxChars)}
                        </div>
                      )}
                    </div>
                  </div>

                  {previewUploading && (
                    <p className="text-xs text-gray-500">Učitavam preview…</p>
                  )}
                  {previewError && <p className="text-sm text-red-600">{previewError}</p>}
                </div>

                <div className="space-y-3 pt-4">
                  <h3 className="font-medium">Prijevodi (neobavezno)</h3>
                  <p className="-mt-1 text-xs text-gray-600">
                    Ako ostavite prazno, sustav će automatski prevesti nakon odobrenja.
                  </p>

                  <div className="overflow-hidden rounded-xl border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => setOpenEn((value) => !value)}
                    >
                      <span className="font-medium">English</span>
                      <span className="text-xs text-gray-500">{openEn ? 'Sakrij' : 'Prikaži'}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openEn && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-2 px-3 pb-3"
                        >
                          <input
                            className="w-full rounded-lg border p-2 text-sm"
                            placeholder="Title"
                            value={trEn.title}
                            onChange={(event) =>
                              setTrEn((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                          <textarea
                            className="w-full rounded-lg border p-2 text-sm"
                            rows={3}
                            placeholder="Description"
                            value={trEn.description}
                            onChange={(event) =>
                              setTrEn((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="overflow-hidden rounded-xl border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => setOpenDe((value) => !value)}
                    >
                      <span className="font-medium">Deutsch</span>
                      <span className="text-xs text-gray-500">{openDe ? 'Sakrij' : 'Prikaži'}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openDe && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-2 px-3 pb-3"
                        >
                          <input
                            className="w-full rounded-lg border p-2 text-sm"
                            placeholder="Titel"
                            value={trDe.title}
                            onChange={(event) =>
                              setTrDe((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                          <textarea
                            className="w-full rounded-lg border p-2 text-sm"
                            rows={3}
                            placeholder="Beschreibung"
                            value={trDe.description}
                            onChange={(event) =>
                              setTrDe((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="overflow-hidden rounded-xl border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => setOpenHr((value) => !value)}
                    >
                      <span className="font-medium">Hrvatski</span>
                      <span className="text-xs text-gray-500">{openHr ? 'Sakrij' : 'Prikaži'}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openHr && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-2 px-3 pb-3"
                        >
                          <input
                            className="w-full rounded-lg border p-2 text-sm"
                            placeholder="Naziv (preveden)"
                            value={trHr.title}
                            onChange={(event) =>
                              setTrHr((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                          <textarea
                            className="w-full rounded-lg border p-2 text-sm"
                            rows={3}
                            placeholder="Opis (preveden)"
                            value={trHr.description}
                            onChange={(event) =>
                              setTrHr((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    onClick={handleBack}
                    className="rounded-lg border px-4 py-2 transition hover:bg-gray-50"
                  >
                    ← Nazad
                  </button>
                  <div className="flex flex-col items-end">
                    <button
                      onClick={publish}
                      disabled={
                        !allReady || publishing || (submissionType === 'bundle' && !bundleFile)
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Objavi
                    </button>
                    {publishError && (
                      <p className="mt-2 max-w-prose text-right text-sm text-red-600">
                        {publishError}
                      </p>
                    )}
                    {!user && (
                      <p className="mt-2 text-sm text-red-600">
                        Za objavu se prvo prijavi.{' '}
                        <a href="/login" className="underline">
                          Prijava
                        </a>
                      </p>
                    )}
                    {authError && (
                      <p className="mt-2 text-sm text-red-600">
                        {authError}{' '}
                        <a href="/login" className="underline">
                          Prijava
                        </a>
                      </p>
                    )}
                    {submissionType === 'bundle' && localPreviewUrl && (
                      <p className="mt-2 text-sm text-emerald-700">
                        Bundle je uspješno izgrađen.{' '}
                        <a href={localPreviewUrl} className="underline" target="_blank" rel="noreferrer">
                          Otvori preview
                        </a>
                      </p>
                    )}
                    {submissionType === 'bundle' && localJobLog && (
                      <pre className="mt-3 max-h-48 w-full overflow-y-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700">
                        {localJobLog}
                      </pre>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
              <h3 className="mb-3 font-semibold">Sažetak</h3>
              <div className="space-y-2">
                <ChecklistItem label="Naslov" done={titleFilled} />
                <ChecklistItem
                  label={submissionType === 'code' ? 'Kod' : 'Bundle (.zip)'}
                  done={codeOrBundleFilled}
                />
                <ChecklistItem label="Opis" done={descFilled} />
                <ChecklistItem label="Slika" done={imageChosen} />
                <div className="border-t pt-2" />
                <div className={`text-sm font-medium ${allReady ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {allReady ? 'Spremno za objavu' : 'Dovrši stavke za objavu'}
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
              <h3 className="mb-3 font-semibold">Preview</h3>
              <div className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewDisplayUrl} alt="preview" className="aspect-video w-full object-cover" />
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
              <button
                onClick={publish}
                disabled={!allReady || publishing || (submissionType === 'bundle' && !bundleFile)}
                className={`w-full rounded-xl text-white font-semibold tracking-wide transition shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
                  !allReady || publishing || (submissionType === 'bundle' && !bundleFile)
                    ? 'cursor-not-allowed bg-emerald-500/60'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                style={{ paddingTop: '14px', paddingBottom: '14px', fontSize: '1.125rem' }}
              >
                {publishing ? 'Objavljujem…' : 'OBJAVI'}
              </button>
              <p className="mt-2 text-xs text-gray-500">
                {allReady
                  ? 'Sve stavke su ispunjene — spremno za objavu.'
                  : 'Dovrši: Naslov, Kod/Bundle, Opis i Slika.'}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
