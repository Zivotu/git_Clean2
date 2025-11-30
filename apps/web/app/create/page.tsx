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
import CreateRedesign from './CreateRedesign';
import { useRouter } from 'next/navigation';
import { apiAuthedPost, ApiError, apiPatch, apiPost } from '@/lib/api';
import { useAuth, getDisplayName } from '@/lib/auth';
import ProgressModal, { type BuildState as ProgressModalState } from '@/components/ProgressModal';
import AlertDialog from '@/components/AlertDialog';
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
import { useTermsLabel } from '@/hooks/useTermsLabel';

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
const MAX_CUSTOM_ASSET_COUNT = 30;
const MAX_CUSTOM_ASSET_BYTES = 100 * 1024;
const ALLOWED_CUSTOM_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];

interface CustomAsset {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  type: string;
}
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
    bundleAiWarning:
      'IMPORTANT: Apps that rely on Google AI Studio, Gemini, Kimi or any other LLM provider must include their own API key. Without it the bundle will not work after publishing.',
    bundleAiWarningDetail:
      'Enter your key below (we do not supply one). Leave it empty only if your AI app works without a private key. Documentation on AI bundles is coming soon.',
    bundleAiNoKeyNote:
      'You can still publish demos that do not require keys — it depends on how you built the app.',
    bundleAiApiLabel: 'AI / LLM API key',
    bundleAiApiPlaceholder: 'Paste your provider key (stored only for this build)',
    bundleAiApiHelp:
      'We inject this key into the bundle so it can reach your AI service. If the app stops working later, rotate or update the key.',
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
    bundleAiWarning:
      'VAZNO: Aplikacije koje se oslanjaju na Google AI Studio, Gemini, Kimi ili bilo kojeg drugog LLM pruzatelja moraju ukljucivati vlastiti API kljuc. Bez njega paket nece raditi nakon objavljivanja.',
    bundleAiWarningDetail:
      'Unesi svoj kljuc u nastavku (mi ga ne isporucujemo). Ostavi ga praznim samo ako tvoja AI aplikacija radi bez privatnog kljuca. Dokumentacija o AI paketima dolazi uskoro.',
    bundleAiNoKeyNote:
      'I dalje mozes objavljivati demo verzije koje ne zahtijevaju kljuceve - to ovisi o tome kako si izgradio aplikaciju.',
    bundleAiApiLabel: 'AI / LLM API kljuc',
    bundleAiApiPlaceholder: 'Zalijepi svoj kljuc pruzatelja (pohranjen samo za ovu izradu)',
    bundleAiApiHelp:
      'Ubacujemo ovaj kljuc u paket kako bi mogao doci do tvoje AI usluge. Ako aplikacija kasnije prestane raditi, rotiraj ili azuriraj kljuc.',
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
    bundleAiWarning:
      'WICHTIG: Apps, die auf Google AI Studio, Gemini, Kimi oder einen anderen LLM-Anbieter angewiesen sind, ben?tigen einen eigenen API-Schl?ssel. Ohne ihn funktioniert das Bundle nach der Ver?ffentlichung nicht.',
    bundleAiWarningDetail:
      'Trage deinen Schl?ssel unten ein (wir stellen keinen bereit). Lass das Feld nur leer, wenn deine AI-App ohne privaten Schl?ssel auskommt. Eine Dokumentation zu AI-Bundles folgt in K?rze.',
    bundleAiNoKeyNote:
      'Du kannst weiterhin Demo-Apps ver?ffentlichen, die keinen Schl?ssel brauchen ? das h?ngt davon ab, wie du sie gebaut hast.',
    bundleAiApiLabel: 'AI- / LLM-API-Schl?ssel',
    bundleAiApiPlaceholder: 'F?ge hier deinen Anbieter-Schl?ssel ein (wird nur f?r diesen Build gespeichert)',
    bundleAiApiHelp:
      'Wir betten den Schl?ssel in das Bundle ein, damit es deinen AI-Dienst erreichen kann. Wenn die App sp?ter nicht mehr funktioniert, ?berpr?fe oder rotiere den Schl?ssel.',
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
  const customAssetInputRef = useRef<HTMLInputElement | null>(null);
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  const [customAssetError, setCustomAssetError] = useState<string | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [bundleFile, setBundleFile] = useState<File | null>(null);
  const [bundleError, setBundleError] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);


  const { messages, locale } = useI18n();
  const termsLabel = useTermsLabel();
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
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUploading, setPreviewUploading] = useState(false);
  const screenshotMaxMb = useMemo(
    () => Math.round((MAX_SCREENSHOT_SIZE_BYTES / (1024 * 1024)) * 10) / 10,
    [],
  );
  const previewMaxMb = useMemo(
    () => Math.round((MAX_PREVIEW_SIZE_BYTES / (1024 * 1024)) * 10) / 10,
    [],
  );
  const customAssetMaxKb = useMemo(
    () => Math.round((MAX_CUSTOM_ASSET_BYTES / 1024) * 10) / 10,
    [],
  );

  const [publishError, setPublishError] = useState('');
  const [publishErrorCode, setPublishErrorCode] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [authError, setAuthError] = useState('');
  const [publishing, setPublishing] = useState(false);

  const { user } = useAuth();
  const router = useRouter();

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
      setCustomAssets([]);
      setCustomAssetError(null);
      setShowAdvancedOptions(false);
      if (customAssetInputRef.current) customAssetInputRef.current.value = '';
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
    setCustomAssets([]);
    setCustomAssetError(null);
    setShowAdvancedOptions(false);
    if (customAssetInputRef.current) customAssetInputRef.current.value = '';
    if (bundleInputRef.current) bundleInputRef.current.value = '';
  };

  const handleCustomAssetInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setCustomAssetError(null);
    const next: CustomAsset[] = [];
    const existingNames = new Set(customAssets.map((asset) => asset.name.toLowerCase()));
    for (const file of files) {
      if (customAssets.length + next.length >= MAX_CUSTOM_ASSET_COUNT) {
        setCustomAssetError(tCreate('advancedAssetsLimitError', { limit: MAX_CUSTOM_ASSET_COUNT }));
        break;
      }
      const mime = (file.type || '').toLowerCase();
      if (!ALLOWED_CUSTOM_ASSET_TYPES.includes(mime)) {
        setCustomAssetError(tCreate('advancedAssetsTypeError'));
        continue;
      }
      if (file.size > MAX_CUSTOM_ASSET_BYTES) {
        setCustomAssetError(tCreate('advancedAssetsSizeError'));
        continue;
      }
      const name = file.name.trim();
      if (!name) {
        setCustomAssetError(tCreate('advancedAssetsNameError'));
        continue;
      }
      if (existingNames.has(name.toLowerCase())) {
        setCustomAssetError(tCreate('advancedAssetsDuplicateError'));
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const id =
          typeof globalThis.crypto?.randomUUID === 'function'
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        next.push({
          id,
          name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
        });
        existingNames.add(name.toLowerCase());
      } catch {
        setCustomAssetError(tCreate('advancedAssetsReadError'));
      }
    }
    if (next.length) {
      setCustomAssets((prev) => [...prev, ...next]);
    }
    if (customAssetInputRef.current) customAssetInputRef.current.value = '';
  };

  const removeCustomAsset = (id: string) => {
    setCustomAssets((prev) => prev.filter((asset) => asset.id !== id));
  };

  const handlePresetSelect = (preset: (typeof PREVIEW_PRESET_PATHS)[number]) => {
    setPreviewChoice('preset');
    setSelectedPreset(preset);
    setCustomPreview(null);
    setPreviewError(null);
  };

  const handleCustomPreview = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewError(null);
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
    setPreviewError(null);
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
    setPreviewError(null);
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
          form.append('title', manifest.name || bundleFile.name);
          form.append('description', manifest.description || '');
          form.append('visibility', 'public');
          form.append('id', appId);
          if (llmApiKey.trim()) {
            form.append('llmApiKey', llmApiKey.trim());
          }
          if (customAssets.length) {
            form.append(
              'customAssets',
              JSON.stringify(
                customAssets.map((asset) => ({
                  name: asset.name,
                  dataUrl: asset.dataUrl,
                  mimeType: asset.type,
                })),
              ),
            );
          }
          if (previewAttachment?.dataUrl) {
            form.append('preview', previewAttachment.dataUrl);
          }
          // Append the ZIP last so Fastify's req.file() sees the metadata fields first.
          form.append('file', bundleFile, bundleFile.name);
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
        tags: selectedTags,
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
  const tagsReady = selectedTags.length > 0;
  const allReady =
    titleFilled &&
    descFilled &&
    imageChosen &&
    codeOrBundleFilled &&
    longDescriptionReady &&
    tagsReady;

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
          className={`inline-block h-2.5 w-2.5 rounded-full ${done ? 'bg-emerald-600' : 'bg-gray-300'
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
      className={`rounded-xl border px-3 py-2 transition text-left shadow-sm ${index === step
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
    <main className="bg-gray-50 dark:bg-[#050505]">
      <AnimatePresence>
        {showProgress && modalState && (
          <ProgressModal
            state={modalState}
            error={buildError || publishError || undefined}
            onClose={() => setShowProgress(false)}
          />
        )}
      </AnimatePresence>

      <div>
        <CreateRedesign
          step={step}
          setStep={setStep}
          submissionType={submissionType}
          onSubmissionTypeChange={handleSubmissionTypeChange}
          code={code}
          onCodeChange={handleCodeChange}
          bundleFile={bundleFile}
          onBundleClick={() => bundleInputRef.current?.click()}
          onBundleChange={handleBundleFileChange}
          clearBundleSelection={clearBundleSelection}
          manifestName={manifest.name}
          manifestDescription={manifest.description}
          setManifestName={(v: string) => setManifest((prev) => ({ ...prev, name: v }))}
          setManifestDescription={(v: string) => setManifest((prev) => ({ ...prev, description: v }))}
          longDescription={longDescription}
          onLongDescription={handleLongDescriptionInput}
          overlayTitle={overlayTitle}
          setOverlayTitle={setOverlayTitle}
          previewUrl={previewDisplayUrl}
          onPreviewUploadClick={() => previewInputRef.current?.click()}
          onPreviewChange={handleCustomPreview}
          selectedPreset={String(selectedPreset)}
          onPresetSelect={handlePresetSelect}
          publish={publish}
          publishing={publishing}
          allReady={allReady}
          bundleInputRef={bundleInputRef}
          previewInputRef={previewInputRef}
          screenshotInputRefs={screenshotInputRefs}
          screenshots={screenshots}
          screenshotErrors={screenshotErrors}
          onScreenshotChange={handleScreenshotSelect}
          onScreenshotRemove={handleScreenshotRemove}
          screenshotMaxMb={screenshotMaxMb}
          overlayMaxChars={overlayMaxChars}
          previewUploading={previewUploading}
          customPreview={customPreview}
          resetCustomPreview={resetCustomPreview}
          previewChoice={previewChoice}
          needsTermsConsent={needsTermsConsent}
          publishTermsChecked={publishTermsChecked}
          setPublishTermsChecked={setPublishTermsChecked}
          onOpenTerms={() => setShowTermsModal(true)}
          publishTermsError={publishTermsError}
          // Pass state for Rooms and Localization
          roomsMode={roomsMode}
          setRoomsMode={setRoomsMode}
          trEn={trEn} setTrEn={setTrEn}
          trDe={trDe} setTrDe={setTrDe}
          trHr={trHr} setTrHr={setTrHr}
          // Pass preset paths for graphics
          PREVIEW_PRESET_PATHS={PREVIEW_PRESET_PATHS}
          // Pass props for Advanced Options (Custom Assets)
          showAdvancedOptions={showAdvancedOptions}
          setShowAdvancedOptions={setShowAdvancedOptions}
          customAssets={customAssets}
          removeCustomAsset={removeCustomAsset}
          customAssetError={customAssetError}
          customAssetInputRef={customAssetInputRef}
          handleCustomAssetInput={handleCustomAssetInput}
          customAssetMaxKb={customAssetMaxKb}
          MAX_CUSTOM_ASSET_COUNT={MAX_CUSTOM_ASSET_COUNT}
          // Pass step handlers
          handleNext={handleNext}
          handleBack={handleBack}
          // Pass LLM API Key state
          llmApiKey={llmApiKey}
          setLlmApiKey={setLlmApiKey}
          // Pass i18n function
          tCreate={tCreate}
          // Missing props restored
          bundleError={bundleError}
          localPreviewUrl={localPreviewUrl}
          localJobLog={localJobLog}
          authError={authError}
          publishError={publishError}
          isSignedIn={!!user}
          termsLabel={termsLabel}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
        />
      </div>

      <UpgradeModal />
      <TermsPreviewModal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title={termsLabel}
      />
      <AlertDialog
        open={Boolean(previewError)}
        title="Gre\u0161ka pri grafici"
        message={previewError ?? ''}
        onClose={() => setPreviewError(null)}
      />
    </main>
  );
}
