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
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiAuthedPost, ApiError, apiPatch, apiPost } from '@/lib/api';
import { useAuth, getDisplayName } from '@/lib/auth';
import ProgressModal, { type BuildState as ProgressModalState } from '@/components/ProgressModal';
import { useBuildEvents, type BuildStatus } from '@/hooks/useBuildEvents';
import {
  MAX_PREVIEW_SIZE_BYTES,
  MAX_SCREENSHOT_SIZE_BYTES,
  PREVIEW_PRESET_PATHS,
  ScreenshotUploadError,
  createPresetPreviewFile,
  uploadScreenshotFile,
} from '@/lib/previewClient';
import type { RoomsMode } from '@/lib/types';
import readFileAsDataUrl from '@/lib/readFileAsDataUrl';
import { useTerms } from '@/components/terms/TermsProvider';
import TermsPreviewModal from '@/components/terms/TermsPreviewModal';
import { TERMS_POLICY } from '@thesara/policies/terms';
import { useI18n } from '@/lib/i18n-provider';
import { defaultLocale } from '@/i18n/config';

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
const LONG_DESCRIPTION_LIMIT = 4000;
const MIN_LONG_DESCRIPTION = 20;
const SCREENSHOT_FIELD_COUNT = 2;
const stepsList = ['source', 'basics'] as const;
type StepKey = typeof stepsList[number];

const createFallbacks: Record<string, Record<string, string>> = {
  en: {
    bundlePreviewHint:
      "After a successful build you'll get a local preview before we send it to admin review.",
    bundleTestingNote:
      'Before uploading, launch the bundle where you built it, save something to storage, close the browser and reopen. If it fails there, it will also fail on Thesara.',
    bundleTestingPromptHint:
      'When prompting an LLM, remind it to persist state with localStorage so our shim can sync it.',
    basicInfoHeading: 'Basic information',
    namePlaceholder: 'My super app',
    descriptionPlaceholder: 'Short description of your app...',
    translationsHeading: 'Translations (optional)',
    translationsHint: 'Leave the fields empty to auto-translate after approval.',
    translationsToggleShow: 'Show',
    translationsToggleHide: 'Hide',
    translationTitlePlaceholder: 'Translated title',
    translationDescriptionPlaceholder: 'Translated description',
    publishTermsPrompt: 'Before your first publish confirm you accept {terms}.',
    publishTermsCheckbox: 'I confirm I read the terms and accept them for all future publishes.',
    publishTermsButton: 'Open terms',
    publishTermsNote: 'Required only the first time or after the version changes ({version}).',
    bundleBuiltMessage: 'Bundle built successfully.',
    openPreviewLink: 'Open preview',
    summaryHeading: 'Summary',
    summaryTitle: 'Title',
    summaryCode: 'Code',
    summaryBundle: 'Bundle (.zip)',
    summaryDescription: 'Description',
    summaryDetailed: 'Detailed overview',
    summaryScreenshots: 'Screenshots (optional)',
    summaryImage: 'Graphic',
    summaryReady: 'Ready to publish',
    summaryIncomplete: 'Complete the steps to publish',
    previewSectionHeading: 'Preview',
    bundleUnsupported: 'We only support .zip bundles.',
    publishTermsErrorStart: 'Confirm you accept the terms before your first publish.',
    publishTermsErrorBundle: 'Accept the terms before uploading a bundle.',
    publishTermsErrorPublish: 'Accept the terms before publishing.',
    authErrorSignIn: 'Please sign in before publishing.',
    authErrorSession: 'You are not signed in or your session expired. Sign in and try again.',
    roomsHeading: 'Rooms with PIN (Thesara Rooms)',
    roomsDescription:
      'Thesara can require a room name and PIN before loading the iframe, keep the PIN outside your app, and offer a public demo room (PIN 1111) for testing.',
    betaLabel: 'Beta',
    roomsOptionOff: 'Disabled — everyone shares the same storage',
    roomsOptionOptional: 'Demo room plus the user can create a private room',
    roomsOptionRequired: 'User must enter a room name and PIN before using the app',
    roomsFootnote: 'You can change this option the next time you publish the app.',
    customGraphicLabel: 'Choose your own graphic',
    shortVideoButton: 'Thesara Short Video',
  },
  hr: {
    bundlePreviewHint: 'Nakon uspješnog builda dobit ćeš lokalni preview prije administratorskog pregleda.',
    bundleTestingNote:
      'Prije uploadanja pokreni bundle tamo gdje si ga gradio, pokušaj nešto spremiti u pohranu, zatvori preglednik i ponovno otvori. Ako tamo ne radi, neće raditi ni na Thesari.',
    bundleTestingPromptHint:
      'Kad koristiš LLM, napomeni u promptu da treba koristiti localStorage kako bi naš shim mogao sinkati podatke.',
    basicInfoHeading: 'Osnovne informacije',
    namePlaceholder: 'Moj super app',
    descriptionPlaceholder: 'Kratak opis tvoje aplikacije...',
    translationsHeading: 'Prijevodi (neobavezno)',
    translationsHint: 'Ako ostaviš prazno, sustav će automatski prevesti nakon odobrenja.',
    translationsToggleShow: 'Prikaži',
    translationsToggleHide: 'Sakrij',
    translationTitlePlaceholder: 'Naziv (preveden)',
    translationDescriptionPlaceholder: 'Opis (preveden)',
    publishTermsPrompt: 'Prije prve objave potvrdi da prihvaćaš {terms}.',
    publishTermsCheckbox: 'Potvrđujem da sam pročitao/la uvjete i prihvaćam ih za sve buduće objave.',
    publishTermsButton: 'Otvori uvjete',
    publishTermsNote: 'Obavezno je samo prvi put ili nakon promjene verzije ({version}).',
    bundleBuiltMessage: 'Bundle je uspješno izgrađen.',
    openPreviewLink: 'Otvori preview',
    summaryHeading: 'Sažetak',
    summaryTitle: 'Naslov',
    summaryCode: 'Kod',
    summaryBundle: 'Bundle (.zip)',
    summaryDescription: 'Opis',
    summaryDetailed: 'Detaljni opis',
    summaryScreenshots: 'Snimke zaslona (neobavezno)',
    summaryImage: 'Slika',
    summaryReady: 'Spremno za objavu',
    summaryIncomplete: 'Dovrši stavke za objavu',
    previewSectionHeading: 'Pregled',
    bundleUnsupported: 'Podržavamo samo .zip pakete.',
    publishTermsErrorStart: 'Prije prve objave potvrdi da prihvaćaš uvjete korištenja.',
    publishTermsErrorBundle: 'Prije slanja bundla potvrdi da prihvaćaš uvjete korištenja.',
    publishTermsErrorPublish: 'Prije objave potvrdi da prihvaćaš uvjete korištenja.',
    authErrorSignIn: 'Za objavu se prvo prijavi.',
    authErrorSession: 'Nisi prijavljen ili je sesija istekla. Prijavi se i pokušaj ponovno.',
    roomsHeading: 'Sobe s PIN-om (Thesara Rooms)',
    roomsDescription:
      'Thesara može tražiti naziv sobe i PIN prije učitavanja iframea, držati PIN izvan tvoje aplikacije i ponuditi demo sobu (PIN 1111) za testiranje.',
    betaLabel: 'Beta',
    roomsOptionOff: 'Isključeno — svi korisnici dijele istu pohranu',
    roomsOptionOptional: 'Demo soba + korisnik može kreirati privatnu sobu',
    roomsOptionRequired: 'Korisnik mora unijeti naziv i PIN prije korištenja',
    roomsFootnote: 'Opciju možeš naknadno promijeniti prilikom sljedeće objave aplikacije.',
    customGraphicLabel: 'Odaberi vlastitu grafiku',
    shortVideoButton: 'Thesara kratki video',
  },
  de: {
    bundlePreviewHint:
      'Nach einem erfolgreichen Build erhältst du eine lokale Vorschau, bevor wir sie zur Prüfung schicken.',
    bundleTestingNote:
      'Teste dein Bundle dort, wo es erstellt wurde: etwas speichern, Browser schließen und erneut öffnen. Wenn es dort nicht funktioniert, funktioniert es auch auf Thesara nicht.',
    bundleTestingPromptHint:
      'Wenn du ein LLM nutzt, erwähne im Prompt, dass Daten über localStorage gespeichert werden sollen, damit unser Shim sie synchronisieren kann.',
    basicInfoHeading: 'Grundlegende Informationen',
    namePlaceholder: 'Meine Super-App',
    descriptionPlaceholder: 'Kurze Beschreibung deiner App...',
    translationsHeading: 'Übersetzungen (optional)',
    translationsHint: 'Lass die Felder leer, um nach der Freigabe automatisch zu übersetzen.',
    translationsToggleShow: 'Anzeigen',
    translationsToggleHide: 'Ausblenden',
    translationTitlePlaceholder: 'Übersetzter Titel',
    translationDescriptionPlaceholder: 'Übersetzte Beschreibung',
    publishTermsPrompt: 'Bestätige vor deiner ersten Veröffentlichung, dass du {terms} akzeptierst.',
    publishTermsCheckbox:
      'Ich bestätige, dass ich die Bedingungen gelesen habe und sie für alle zukünftigen Veröffentlichungen akzeptiere.',
    publishTermsButton: 'Bedingungen öffnen',
    publishTermsNote: 'Nur bei der ersten Veröffentlichung oder nach einer Versionsänderung erforderlich ({version}).',
    bundleBuiltMessage: 'Bundle wurde erfolgreich gebaut.',
    openPreviewLink: 'Vorschau öffnen',
    summaryHeading: 'Zusammenfassung',
    summaryTitle: 'Titel',
    summaryCode: 'Code',
    summaryBundle: 'Bundle (.zip)',
    summaryDescription: 'Beschreibung',
    summaryDetailed: 'Ausführliche Beschreibung',
    summaryScreenshots: 'Screenshots (optional)',
    summaryImage: 'Grafik',
    summaryReady: 'Bereit zur Veröffentlichung',
    summaryIncomplete: 'Schließe die Schritte für die Veröffentlichung ab',
    previewSectionHeading: 'Vorschau',
    bundleUnsupported: 'Wir unterstützen nur .zip-Pakete.',
    publishTermsErrorStart: 'Bestätige die Bedingungen vor deiner ersten Veröffentlichung.',
    publishTermsErrorBundle: 'Akzeptiere die Bedingungen, bevor du ein Bundle hochlädst.',
    publishTermsErrorPublish: 'Akzeptiere die Bedingungen vor der Veröffentlichung.',
    authErrorSignIn: 'Bitte melde dich vor der Veröffentlichung an.',
    authErrorSession: 'Du bist nicht angemeldet oder deine Sitzung ist abgelaufen. Melde dich erneut an.',
    roomsHeading: 'Räume mit PIN (Thesara Rooms)',
    roomsDescription:
      'Thesara kann vor dem Laden des Iframes einen Raumnamen und eine PIN verlangen, den PIN außerhalb deiner App halten und einen öffentlichen Demo-Raum (PIN 1111) bereitstellen.',
    betaLabel: 'Beta',
    roomsOptionOff: 'Deaktiviert — alle teilen denselben Speicher',
    roomsOptionOptional: 'Demo-Raum plus Nutzer kann einen privaten Raum erstellen',
    roomsOptionRequired: 'Nutzer muss vor der Verwendung Raumnamen und PIN eingeben',
    roomsFootnote: 'Diese Option kannst du bei der nächsten Veröffentlichung ändern.',
    customGraphicLabel: 'Eigene Grafik wählen',
    shortVideoButton: 'Thesara Kurzvideo',
  },
};

const friendlyByCode: Record<string, string> = {
  NET_OPEN_NEEDS_DOMAINS: 'Dodaj barem jednu domenu (npr. api.example.com).',
  NET_DOMAIN_NOT_ALLOWED: 'Ta domena nije dopuÅ¡tena.',
  LLM_MISSING_API_KEY: 'Nedostaje LLM API kljuÄ.',
  LLM_INVALID_JSON: 'AI servis je vratio neispravan JSON.',
  LLM_UNREACHABLE: 'AI servis trenutno nije dostupan.',
  BUILD_PUBLISH_RENAME_FAILED: 'Objavljivanje nije uspjelo. PokuÅ¡aj ponovno.',
  ses_lockdown: 'SES/lockdown nije podrÅ¾an u browseru. Ukloni ga ili pokreni samo na serveru.',
  ses_compartment: 'Kod koristi SES Compartment â€“ potrebno je ruÄno odobrenje.',
  max_apps: 'Dosegnut je maksimalan broj aplikacija za tvoj plan. ObriÅ¡i postojeÄ‡u ili aktiviraj Gold.',
};

const detectMode = (value: string): Mode =>
  value.trim().startsWith('<') ? 'html' : 'react';

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
  const [llmApiKey, setLlmApiKey] = useState('');

  const { messages, locale } = useI18n();
  const tCreate = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const localeFallback = createFallbacks[locale] || createFallbacks[defaultLocale] || {};
      const englishFallback = createFallbacks.en || {};
      let value =
        messages[`Create.${key}`] ||
        localeFallback[key] ||
        englishFallback[key] ||
        key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replaceAll(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [messages, locale]
  );
  const getStepLabel = useCallback(
    (key: StepKey) => (key === 'basics' ? tCreate('basics') : tCreate('source')),
    [tCreate]
  );

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
  const [roomsMode, setRoomsMode] = useState<RoomsMode>('off');
  const [longDescription, setLongDescription] = useState('');
  const [longDescriptionError, setLongDescriptionError] = useState('');
  const [screenshots, setScreenshots] = useState<Array<{ file: File; dataUrl: string } | null>>(
    () => Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => null),
  );
  const [screenshotErrors, setScreenshotErrors] = useState<string[]>(
    () => Array.from({ length: SCREENSHOT_FIELD_COUNT }, () => ''),
  );
  const screenshotInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [trEn, setTrEn] = useState({ title: '', description: '' });
  const [trDe, setTrDe] = useState({ title: '', description: '' });
  const [trHr, setTrHr] = useState({ title: '', description: '' });
  const [openEn, setOpenEn] = useState(false);
  const [openDe, setOpenDe] = useState(false);
  const [openHr, setOpenHr] = useState(false);

  const previewInputRef = useRef<HTMLInputElement | null>(null);
  const [previewChoice, setPreviewChoice] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<
    (typeof PREVIEW_PRESET_PATHS)[number]
  >(() => PREVIEW_PRESET_PATHS[0]);
  const [overlayTitle, setOverlayTitle] = useState('');
  const [customPreview, setCustomPreview] = useState<{ file: File; dataUrl: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewUploading, setPreviewUploading] = useState(false);
  const screenshotMaxMb = useMemo(
    () => Math.round((MAX_SCREENSHOT_SIZE_BYTES / (1024 * 1024)) * 10) / 10,
    [],
  );
  const previewMaxMb = useMemo(
    () => Math.round((MAX_PREVIEW_SIZE_BYTES / (1024 * 1024)) * 10) / 10,
    [],
  );

  const [publishError, setPublishError] = useState('');
  const [publishErrorCode, setPublishErrorCode] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [authError, setAuthError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const { user } = useAuth();
  const router = useRouter();

  const handleOpenShortVideo = useCallback(() => {
    const shortUrl = 'https://youtube.com/shorts/m_4RqaGClFI';
    if (typeof window !== 'undefined') {
      window.open(shortUrl, '_blank', 'noopener,noreferrer');
    } else {
      router.push(shortUrl);
    }
  }, [router]);
  const { status: termsStatus, accept: acceptLatestTerms, refresh: refreshTermsStatus } = useTerms();

  const [showProgress, setShowProgress] = useState(false);
  const [buildStep, setBuildStep] = useState('');
  const [manualBuildState, setManualBuildState] = useState<ProgressModalState | null>(null);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);
  const [localJobLog, setLocalJobLog] = useState('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [publishTermsChecked, setPublishTermsChecked] = useState(false);
  const [publishTermsError, setPublishTermsError] = useState<string | null>(null);
  const needsTermsConsent = useMemo(
    () => Boolean(user && termsStatus && termsStatus.accepted === false),
    [user, termsStatus],
  );


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

  useEffect(() => {
    if (termsStatus?.accepted) {
      setPublishTermsChecked(false);
      setPublishTermsError(null);
    }
  }, [termsStatus?.accepted]);

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
      setBundleError(tCreate('bundleUnsupported'));
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
      setPreviewError('NeuspjeÅ¡no Äitanje datoteke.');
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

  const handleLongDescriptionInput = useCallback(
    (value: string) => {
      const next = value.slice(0, LONG_DESCRIPTION_LIMIT);
      setLongDescription(next);
      if (longDescriptionError && next.trim().length >= MIN_LONG_DESCRIPTION) {
        setLongDescriptionError('');
      }
    },
    [longDescriptionError],
  );

  const handleScreenshotSelect = useCallback(
    async (index: number, files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (file.size > MAX_SCREENSHOT_SIZE_BYTES) {
        setScreenshotErrors((prev) => {
          const next = [...prev];
          next[index] = `${tCreate('screenshotsTooLarge', { size: screenshotMaxMb })}`;
          return next;
        });
        if (screenshotInputRefs.current[index]) {
          screenshotInputRefs.current[index]!.value = '';
        }
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setScreenshots((prev) => {
          const next = [...prev];
          next[index] = { file, dataUrl };
          return next;
        });
        setScreenshotErrors((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      } catch (err) {
        console.warn('screenshot-read-failed', err);
        setScreenshotErrors((prev) => {
          const next = [...prev];
          next[index] = tCreate('screenshotsUploadFailed');
          return next;
        });
      }
    },
    [screenshotMaxMb, tCreate],
  );

  const handleScreenshotRemove = useCallback((index: number) => {
    setScreenshots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setScreenshotErrors((prev) => {
      const next = [...prev];
      next[index] = '';
      return next;
    });
    if (screenshotInputRefs.current[index]) {
      screenshotInputRefs.current[index]!.value = '';
    }
  }, []);

  const syncListingMetadata = useCallback(
    async (identifier: string) => {
      if (!identifier) return;
      const trimmedDescription = longDescription.trim();
      if (trimmedDescription) {
        await apiPatch(
          `/listing/${encodeURIComponent(identifier)}`,
          { longDescription: trimmedDescription },
          { auth: true },
        );
      }
      for (let index = 0; index < screenshots.length; index += 1) {
        const entry = screenshots[index];
        if (!entry) continue;
        await uploadScreenshotFile(identifier, index, entry.file);
      }
    },
    [longDescription, screenshots],
  );

  const publish = async () => {
    setPublishError('');
    setAuthError('');
    setBundleError('');
    setPreviewError('');
    setLocalJobLog('');
    setLocalPreviewUrl(null);
    setManualBuildState(null);
    setCurrentBuildId(null);

    try {
      if (needsTermsConsent) {
        if (!publishTermsChecked) {
        setPublishTermsError(tCreate('publishTermsErrorStart'));
          return;
        }
        try {
          await acceptLatestTerms('publish-flow');
          setPublishTermsError(null);
        } catch (err) {
          console.error('terms_accept_publish_failed', err);
          setPublishTermsError('Spremanje prihvaÄ‡anja nije uspjelo. PokuÅ¡aj ponovno.');
          return;
        }
      }

      if (!user) {
        setAuthError(tCreate('authErrorSignIn'));
        return;
      }

      const trimmedLongDescription = longDescription.trim();
      if (trimmedLongDescription.length < MIN_LONG_DESCRIPTION) {
        const message = tCreate('longDescriptionTooShort', { min: MIN_LONG_DESCRIPTION });
        setLongDescriptionError(message);
        setPublishError(message);
        return;
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

      if (submissionType === 'bundle') {
        if (!bundleFile) {
          setBundleError(`${tCreate('chooseZip')} datoteku.`);
          return;
        }
        setShowProgress(true);
        setManualBuildState('queued');
        setBuildStep('queued');
        setPublishing(true);
        try {
          const appId = deriveAppId(manifest.name || bundleFile.name);
          const form = new FormData();
          form.append('file', bundleFile, bundleFile.name);
          form.append('title', manifest.name || bundleFile.name);
          form.append('description', manifest.description || '');
          form.append('visibility', 'public');
          form.append('id', appId);
          if (llmApiKey.trim()) {
            form.append('llmApiKey', llmApiKey.trim());
          }
          if (previewAttachment?.dataUrl) {
            form.append('preview', previewAttachment.dataUrl);
          }
          const bundlePublish = await apiPost<{ ok?: boolean; buildId?: string; listingId?: string | number; slug?: string; error?: string; }>(
            '/publish/bundle',
            form,
            { auth: true },
          );

          if (bundlePublish?.buildId) {
            setCurrentBuildId(bundlePublish.buildId);
            if (bundlePublish.slug) {
              void ensurePreviewForSlug();
            }
            const targetIdentifier =
              bundlePublish.slug || (bundlePublish.listingId ? String(bundlePublish.listingId) : '');
            if (targetIdentifier) {
              try {
                await syncListingMetadata(targetIdentifier);
              } catch (err) {
                console.error('bundle-metadata-sync-failed', err);
                setPublishError(tCreate('metadataSyncFailed'));
              }
            }
          } else {
            const message =
              bundlePublish?.error || 'Build ID nije vracen s posluzitelja.';
            setPublishError(message);
            setShowProgress(false);
            setManualBuildState(null);
          }
        } catch (err) {
          if (err instanceof ApiError) {
            if (err.status === 401) {
              setAuthError(tCreate('authErrorSession'));
            } else if (err.code === 'terms_not_accepted') {
              setPublishTermsError(tCreate('publishTermsErrorBundle'));
              setShowTermsModal(true);
              void refreshTermsStatus();
            } else {
              setPublishError(err.message || 'Upload nije uspio.');
            }
          } else {
            setPublishError(String(err));
          }
          setShowProgress(false);
          setManualBuildState(null);
        }
        return;
      }

      const sesRe =
        /(lockdown\s*\(|\brequire\s*\(\s*['"]ses['"]\s*\)|\bfrom\s+['"]ses['"]|import\s*\(\s*['"]ses['"]\s*\))/;
      if (sesRe.test(code)) {
        setPublishError('SES/lockdown nije podrÅ¾an u browseru. Ukloni ga iz koda ili ga pokreni samo na serveru.');
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
          storage: {
            roomsMode,
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
        const targetIdentifier = json.slug || (json.listingId ? String(json.listingId) : '');
        if (targetIdentifier) {
          try {
            await syncListingMetadata(targetIdentifier);
          } catch (err) {
            console.error('metadata-sync-failed', err);
            setPublishError(tCreate('metadataSyncFailed'));
          }
        }
      } else {
        setPublishError('Build ID nije vra��en s poslu�_itelja.');
        setShowProgress(false);
        setManualBuildState(null);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAuthError(tCreate('authErrorSession'));
        } else if (err.code === 'terms_not_accepted') {
          setPublishTermsError(tCreate('publishTermsErrorPublish'));
          setShowTermsModal(true);
          void refreshTermsStatus();
        } else {
          const code = err.code as string | undefined;
          const friendly = (code && friendlyByCode[code]) || err.message || code || 'GreÅ¡ka pri objavi.';
          setPublishError(friendly);
          setPublishErrorCode(code || null);
          if (code === 'max_apps') {
            setShowUpgradeModal(true);
          }
        }
      } else {
        setPublishError(String(err));
        setPublishErrorCode(null);
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
  const longDescriptionReady = longDescription.trim().length >= MIN_LONG_DESCRIPTION;
  const screenshotsReady = screenshots.some((entry) => Boolean(entry));
  const allReady =
    titleFilled &&
    descFilled &&
    imageChosen &&
    codeOrBundleFilled &&
    longDescriptionReady;

  const previewDisplayUrl =
    previewChoice === 'custom' && customPreview?.dataUrl
      ? customPreview.dataUrl
      : selectedPreset;

  const UpgradeModal = () => {
    if (!showUpgradeModal) return null;
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowUpgradeModal(false)} />
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6">
          <h3 className="text-xl font-semibold mb-2">TrebaÅ¡ Gold za viÅ¡e aplikacija</h3>
          <p className="text-sm text-gray-700 mb-4">
            U besplatnom paketu moÅ¾eÅ¡ imati 1 aplikaciju ukupno. ObriÅ¡i postojeÄ‡u u <a href="/my" className="underline text-emerald-700">Mojim aplikacijama</a> ili nadogradi na Gold paket.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="rounded-lg border px-4 py-2 text-gray-700"
            >
              Zatvori
            </button>
            <a
              href="/checkout/gold"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm hover:bg-emerald-700"
            >
              Aktiviraj Gold
            </a>
          </div>
          <div className="mt-3 text-xs text-gray-600">
            Imate promo kod? <a href="/redeem" className="text-emerald-700 underline">Unesite ovdje</a>.
          </div>
        </div>
      </div>
    );
  };

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
      <span className={`text-xs ${done ? 'text-emerald-700' : 'text-gray-400'}`}>{done ? 'âœ”' : 'â€”'}</span>
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
          <h1 className="text-2xl font-bold text-emerald-700">{tCreate('pageTitle')}</h1>
          <div className="flex min-w-[260px] items-center gap-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/60 ring-1 ring-emerald-200">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-sm font-medium text-emerald-700">{Math.round(progressPct)}%</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
          {stepsList.map((stepKey, index) => (
            <StepButton
              key={stepKey}
              index={index}
              label={getStepLabel(stepKey)}
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {stepsList[step] === 'source' && (
              <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-6">
                <h2 className="text-lg font-semibold">{tCreate('sourceSection')}</h2>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="submission-type"
                      value="code"
                      checked={submissionType === 'code'}
                      onChange={() => handleSubmissionTypeChange('code')}
                    />
                    <span>{tCreate('optionPasteCode')}</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="submission-type"
                      value="bundle"
                      checked={submissionType === 'bundle'}
                      onChange={() => handleSubmissionTypeChange('bundle')}
                    />
                    <span>{tCreate('optionUploadBundle')}</span>
                  </label>
                </div>

                {submissionType === 'code' ? (
                  <textarea
                    value={code}
                    onChange={handleCodeChange}
                    className="min-h-[280px] w-full rounded-xl border p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder={
                      mode === 'html'
                        ? tCreate('placeholderHtmlLong')
                        : tCreate('placeholderReactLong')
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      {tCreate('bundleHintPart1')} <code>package.json</code>{' '}
                      {tCreate('bundleHintPart2')} <code>pnpm-lock.yaml</code>.{' '}
                      {tCreate('bundleHintPart3')} <code>pnpm run build</code>.
                    </p>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm font-extrabold uppercase tracking-wide text-red-700">
                        {tCreate('bundleAiWarning')}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-red-600">
                        {tCreate('bundleAiWarningDetail')}
                      </p>
                      <p className="mt-1 text-xs text-red-500">
                        {tCreate('bundleAiNoKeyNote')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => bundleInputRef.current?.click()}
                        className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        {tCreate('chooseZip')}
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
                    <div className="space-y-1">
                      <label className="block text-sm font-semibold text-gray-900" htmlFor="bundle-llm-api">
                        {tCreate('bundleAiApiLabel')}
                      </label>
                      <input
                        id="bundle-llm-api"
                        type="text"
                        autoComplete="off"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder={tCreate('bundleAiApiPlaceholder')}
                        value={llmApiKey}
                        onChange={(event) => setLlmApiKey(event.target.value)}
                      />
                      <p className="text-xs text-gray-500">{tCreate('bundleAiApiHelp')}</p>
                    </div>
                    {bundleError && <p className="text-sm text-red-600">{bundleError}</p>}
                    <p className="text-xs text-gray-500">
                      {tCreate('bundlePreviewHint')}
                    </p>
                    <p className="text-xs text-amber-600">
                      {tCreate('bundleTestingNote')}
                    </p>
                    <p className="text-xs text-amber-600">
                      {tCreate('bundleTestingPromptHint')}
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleNext}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    {tCreate('next')} →
                  </button>
                </div>
              </section>
            )}

            {stepsList[step] === 'basics' && (
              <section className="space-y-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-6">
                <h2 className="text-lg font-semibold">{tCreate('basicInfoHeading')}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">{tCreate('name')}</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                      value={manifest.name}
                      onChange={(event) =>
                        setManifest({ ...manifest, name: event.target.value })
                      }
                      placeholder={tCreate('namePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">{tCreate('description')}</label>
                    <textarea
                      className="min-h-[80px] w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                      value={manifest.description}
                      onChange={(event) =>
                        setManifest({ ...manifest, description: event.target.value })
                      }
                      placeholder={tCreate('descriptionPlaceholder')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    {tCreate('longDescriptionLabel')}
                  </label>
                  <textarea
                    className="min-h-[140px] w-full rounded-xl border px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                    value={longDescription}
                    onChange={(event) => handleLongDescriptionInput(event.target.value)}
                    placeholder={tCreate('longDescriptionPlaceholder')}
                  />
                  <p className="mt-1 text-xs text-gray-600">
                    {tCreate('longDescriptionHint', { min: MIN_LONG_DESCRIPTION })}
                  </p>
                  <p className="text-xs text-gray-600">
                    {tCreate('longDescriptionCounter', {
                      used: longDescription.length,
                      limit: LONG_DESCRIPTION_LIMIT,
                    })}
                  </p>
                  {longDescriptionError && (
                    <p className="text-xs text-red-600">{longDescriptionError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    {tCreate('screenshotsLabel')}
                  </label>
                  <p className="text-xs text-gray-600">
                    {tCreate('screenshotsHint', { size: screenshotMaxMb })}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Array.from({ length: SCREENSHOT_FIELD_COUNT }).map((_, index) => {
                      const entry = screenshots[index];
                      const error = screenshotErrors[index];
                      const fieldLabel = tCreate('screenshotsPreviewAlt', { index: index + 1 });
                      return (
                        <div
                          key={index}
                          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-gray-700">{fieldLabel}</p>
                              <p className="text-[11px] text-gray-500">
                                {tCreate('screenshotsFileHint', { size: screenshotMaxMb })}
                              </p>
                            </div>
                            {entry && (
                              <button
                                type="button"
                                onClick={() => handleScreenshotRemove(index)}
                                className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                              >
                                {tCreate('screenshotsRemoveButton')}
                              </button>
                            )}
                          </div>
                          <div className="relative aspect-video rounded-xl border border-dashed border-gray-300 bg-gray-50 overflow-hidden">
                            {entry ? (
                              <Image
                                src={entry.dataUrl}
                                alt={fieldLabel}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[11px] uppercase tracking-wide text-gray-400">
                                  {tCreate('screenshotsEmptyPlaceholder')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => screenshotInputRefs.current[index]?.click()}
                              className="rounded-lg border border-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              {entry
                                ? tCreate('screenshotsReplaceButton')
                                : tCreate('screenshotsUploadButton')}
                            </button>
                            <input
                              ref={(el) => {
                                screenshotInputRefs.current[index] = el;
                              }}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(event) => handleScreenshotSelect(index, event.target.files)}
                            />
                          </div>
                          {error && <p className="text-xs text-red-600">{error}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {tCreate('roomsHeading')}
                      </p>
                      <p className="text-xs text-slate-600">
                        {tCreate('roomsDescription')}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                      {tCreate('betaLabel')}
                    </span>
                  </div>
                  <select
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={roomsMode}
                    onChange={(event) => setRoomsMode(event.target.value as RoomsMode)}
                  >
                    <option value="off">{tCreate('roomsOptionOff')}</option>
                    <option value="optional">{tCreate('roomsOptionOptional')}</option>
                    <option value="required">{tCreate('roomsOptionRequired')}</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {tCreate('roomsFootnote')}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 rounded-xl border bg-emerald-50/40 p-3">
                    <label className="text-sm font-medium">{tCreate('customGraphicLabel')}</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => previewInputRef.current?.click()}
                        className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        {tCreate('chooseCustomGraphic')}
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
                          {tCreate('removeCustomGraphic')}
                        </button>
                      )}
                      <span className="text-[11px] text-gray-600">
                        {tCreate('customGraphicHint')} {previewMaxMb}MB
                      </span>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700">
                        {tCreate('previewTitleLabel')}{' '}
                        <span className="font-normal text-gray-500">
                          ({overlayMaxChars} {tCreate('characters')})
                        </span>
                      </label>
                      <input
                        value={overlayTitle}
                        onChange={(event) =>
                          setOverlayTitle(event.target.value.slice(0, overlayMaxChars))
                        }
                        maxLength={overlayMaxChars}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                        placeholder={tCreate('previewTitlePlaceholder')}
                      />
                      <p className="text-xs text-gray-500">{tCreate('previewTitleHint')}</p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Ovaj naslov Ä‡e se prikazati preko svih thumbnailova kao naslov aplikacije.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mt-2 block text-sm font-medium">
                      Ili odaberi jedan od predloÅ¾aka
                    </label>
                    <p className="text-xs text-gray-600">
                      Klikom na predloÅ¾ak vidiÅ¡ kako izgleda s naslovom preko slike.
                    </p>
                  </div>

                  <div className="grid gap-3 grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                    {PREVIEW_PRESET_PATHS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePresetSelect(preset)}
                        className="relative w-full text-left"
                        aria-label="Odaberi predloÅ¾ak"
                      >
                        <div
                          className={`relative overflow-hidden rounded-lg border ${
                            selectedPreset === preset && previewChoice === 'preset'
                              ? 'border-emerald-500 ring-2 ring-emerald-400'
                              : 'border-gray-200'
                          }`}
                        >
                          <Image
                            src={preset}
                            alt="preset"
                            width={1280}
                            height={720}
                            className="aspect-video w-full object-cover"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
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
                      <Image
                        src={previewDisplayUrl}
                        alt="App preview"
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                      {!!overlayTitle.trim() && (
                        <div className="absolute inset-x-0 bottom-0 break-words bg-slate-900/80 px-4 py-2 text-center text-sm font-semibold text-white leading-snug">
                          {overlayTitle.trim().slice(0, overlayMaxChars)}
                        </div>
                      )}
                    </div>
                  </div>

                  {previewUploading && (
                    <p className="text-xs text-gray-500">{tCreate('previewUploading')}</p>
                  )}
                  {previewError && <p className="text-sm text-red-600">{previewError}</p>}
                </div>

                <div className="space-y-3 pt-4">
                  <h3 className="font-medium">{tCreate('translationsHeading')}</h3>
                  <p className="-mt-1 text-xs text-gray-600">
                    {tCreate('translationsHint')}
                  </p>

                  <div className="overflow-hidden rounded-xl border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
                      onClick={() => setOpenEn((value) => !value)}
                    >
                      <span className="font-medium">English</span>
                      <span className="text-xs text-gray-500">
                        {openEn ? tCreate('translationsToggleHide') : tCreate('translationsToggleShow')}
                      </span>
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
                            placeholder={tCreate('translationTitlePlaceholder')}
                            value={trEn.title}
                            onChange={(event) =>
                              setTrEn((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                          <textarea
                            className="w-full rounded-lg border p-2 text-sm"
                            rows={3}
                            placeholder={tCreate('translationDescriptionPlaceholder')}
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
                      <span className="text-xs text-gray-500">
                        {openDe ? tCreate('translationsToggleHide') : tCreate('translationsToggleShow')}
                      </span>
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
                            placeholder={tCreate('translationTitlePlaceholder')}
                            value={trDe.title}
                            onChange={(event) =>
                              setTrDe((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                          <textarea
                            className="w-full rounded-lg border p-2 text-sm"
                            rows={3}
                            placeholder={tCreate('translationDescriptionPlaceholder')}
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
                      <span className="text-xs text-gray-500">
                        {openHr ? tCreate('translationsToggleHide') : tCreate('translationsToggleShow')}
                      </span>
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
                            placeholder={tCreate('translationTitlePlaceholder')}
                            value={trHr.title}
                            onChange={(event) =>
                              setTrHr((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                          <textarea
                            className="w-full rounded-lg border p-2 text-sm"
                            rows={3}
                            placeholder={tCreate('translationDescriptionPlaceholder')}
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
              {needsTermsConsent && (
                <div className="mt-6 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                  <p className="font-semibold">
                    {tCreate('publishTermsPrompt', { terms: TERMS_POLICY.shortLabel })}
                  </p>
                  <label className="flex items-start gap-3 text-gray-800">
                    <input
                      type="checkbox"
                      checked={publishTermsChecked}
                      onChange={(event) => {
                        setPublishTermsChecked(event.target.checked);
                        if (event.target.checked) setPublishTermsError(null);
                      }}
                      className="mt-1 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      {tCreate('publishTermsCheckbox')}
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
                    >
                      {tCreate('publishTermsButton')}
                    </button>
                    <span className="text-xs text-amber-800">
                      {tCreate('publishTermsNote', { version: TERMS_POLICY.version })}
                    </span>
                  </div>
                  {publishTermsError && (
                    <p className="text-xs text-red-600">{publishTermsError}</p>
                  )}
                </div>
              )}
              <div className="flex justify-between pt-4">
                <button
                  onClick={handleBack}
                  className="rounded-lg border px-4 py-2 transition hover:bg-gray-50"
                >
                  ← {tCreate('back')}
                </button>
                  <div className="flex flex-col items-end">
                    <button
                      onClick={publish}
                      disabled={
                        !allReady || publishing || (submissionType === 'bundle' && !bundleFile)
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {tCreate('publish')}
                    </button>
                    {publishError && (
                      <p className="mt-2 max-w-prose text-right text-sm text-red-600">
                        {publishError}
                      </p>
                    )}
                    {!user && (
                      <p className="mt-2 text-sm text-red-600">
                        {tCreate('mustSignIn')}{' '}
                        <a href="/login" className="underline">
                          {tCreate('login')}
                        </a>
                      </p>
                    )}
                    {authError && (
                      <p className="mt-2 text-sm text-red-600">
                        {authError}{' '}
                        <a href="/login" className="underline">
                          {tCreate('login')}
                        </a>
                      </p>
                    )}
                    {submissionType === 'bundle' && localPreviewUrl && (
                      <p className="mt-2 text-sm text-emerald-700">
                        {tCreate('bundleBuiltMessage')}{' '}
                        <a href={localPreviewUrl} className="underline" target="_blank" rel="noreferrer">
                          {tCreate('openPreviewLink')}
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
              <h3 className="mb-3 font-semibold">{tCreate('summaryHeading')}</h3>
              <div className="space-y-2">
                <ChecklistItem label={tCreate('summaryTitle')} done={titleFilled} />
                <ChecklistItem
                  label={
                    submissionType === 'code'
                      ? tCreate('summaryCode')
                      : tCreate('summaryBundle')
                  }
                  done={codeOrBundleFilled}
                />
                <ChecklistItem label={tCreate('summaryDescription')} done={descFilled} />
                <ChecklistItem label={tCreate('summaryDetailed')} done={longDescriptionReady} />
                <ChecklistItem label={tCreate('summaryScreenshots')} done={screenshotsReady} />
                <ChecklistItem label={tCreate('summaryImage')} done={imageChosen} />
                <div className="border-t pt-2" />
                <div className={`text-sm font-medium ${allReady ? 'text-emerald-700' : 'text-gray-500'}`}>
                  {allReady ? tCreate('summaryReady') : tCreate('summaryIncomplete')}
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
              <h3 className="mb-3 font-semibold">{tCreate('previewSectionHeading')}</h3>
              <div className="overflow-hidden rounded-lg border">
                <Image
                  src={previewDisplayUrl}
                  alt="preview"
                  width={1280}
                  height={720}
                  className="aspect-video w-full object-cover"
                  sizes="(max-width: 768px) 100vw, 400px"
                />
              </div>
            </section>

            
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleOpenShortVideo}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M6 4.5v11a.5.5 0 00.77.423l9-5.5a.5.5 0 000-.846l-9-5.5A.5.5 0 006 4.5z" />
                  </svg>
                  {tCreate('shortVideoButton')}
                </button>
                <button
                  onClick={publish}
                  disabled={!allReady || publishing || (submissionType === 'bundle' && !bundleFile)}
                  className={`flex-1 rounded-xl text-white font-semibold tracking-wide transition shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
                    !allReady || publishing || (submissionType === 'bundle' && !bundleFile)
                      ? 'cursor-not-allowed bg-emerald-500/60'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                  style={{ paddingTop: '14px', paddingBottom: '14px', fontSize: '1.125rem' }}
                >
                  {publishing ? 'Objavljujem…' : 'OBJAVI'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {allReady
                  ? 'Sve stavke su ispunjene – spremno za objavu.'
                  : 'Dovrši: Naslov, Kod/Bundle, Opis i Slika.'}
              </p>
            </section>

          </aside>
        </div>
      </div>
      <UpgradeModal />
      <TermsPreviewModal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title={TERMS_POLICY.shortLabel}
      />
    </main>
  );
}
