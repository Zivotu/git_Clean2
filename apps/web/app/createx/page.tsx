'use client';

import { useState, useEffect } from 'react';
import { SANDBOX_SUBDOMAIN_ENABLED } from '@/lib/config';
import { apiGet, apiAuthedPost, ApiError } from '@/lib/api';
import { useTerms } from '@/components/terms/TermsProvider';
import TermsPreviewModal from '@/components/terms/TermsPreviewModal';
import { TERMS_POLICY } from '@thesara/policies/terms';

const steps = [
  'Analiza',
  'Generiranje manifesta',
  'Provjera s LLM-om',
  'Pitanja',
  'Transformacija',
  'Preview',
  'Gotovo',
];
const stepMap: Record<string, number> = {
  analyze: 0,
  manifest: 1,
  llm: 2,
  llm_skipped: 2,
  questions: 3,
  transform: 4,
  preview: 5,
  done: 6,
};

export default function CreateXPage() {
  const { status: termsStatus, accept: acceptTerms, refresh: refreshTerms } = useTerms();
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const needsTermsConsent = Boolean(termsStatus && termsStatus.accepted === false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [artifacts, setArtifacts] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [planLimit, setPlanLimit] = useState(false);

  const progress = (currentStep / (steps.length - 1)) * 100;

  const publish = async () => {
    if (needsTermsConsent) {
      if (!termsChecked) {
        setTermsError('Prije pokretanja potvrdi da prihvacas uvjete.');
        return;
      }
      try {
        await acceptTerms('createx-publish');
        setTermsError(null);
      } catch (err) {
        console.error('createx_terms_accept_failed', err);
        setTermsError('Spremanje prihvacanja nije uspjelo. Pokusaj ponovno.');
        return;
      }
    }
    const forceWizard = true;
    setBusy(true);
    setPreviewUrl(null);
    try {
      const json = await apiAuthedPost<{
        id?: string;
        logs?: Record<string, string>;
        wizardQuestions?: string[];
        confidence: number;
      }>(
        '/createx/publish',
        { title, description, inlineCode: code, skipLLM: false, forceWizard }
      );
      setLogs(json.logs || {});
      const qs = json.wizardQuestions || [];
      setQuestions(qs);
      setNeedsConfirm(forceWizard || qs.length > 0 || json.confidence < 1);
      setJobId(json.id || null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'terms_not_accepted') {
        setTermsError('Prije objave prihvati uvjete korištenja.');
        setShowTermsModal(true);
        void refreshTerms();
      } else {
        setLogs({ error: String(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!jobId) return;
    setBusy(true);
    setPlanLimit(false);
    try {
      const json = await apiAuthedPost<{
        logs?: Record<string, string>;
        error?: string;
        artifacts?: any;
      }>('/createx/confirm', { id: jobId, answers, title, description });
      setLogs((prev) => ({ ...prev, ...(json.logs || {}) }));
      if (json.error === 'plan_limit') {
        setPlanLimit(true);
        return;
      }
      if (json.error) {
        setLogs((prev) => ({ ...prev, error: json.error || 'Confirm failed' }));
        return;
      }
      setArtifacts(json.artifacts);
      try {
        const pJson = await apiGet<{ previewUrl?: string }>(`/createx/preview?id=${jobId}`);
        setPreviewUrl(pJson.previewUrl || null);
        setCurrentStep(stepMap.preview);
      } catch (e) {
        setLogs((prev) => ({ ...prev, preview: String(e) }));
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'terms_not_accepted') {
        setTermsError('Prije potvrde prihvati uvjete korištenja.');
        setShowTermsModal(true);
        void refreshTerms();
      } else {
        setLogs((prev) => ({ ...prev, error: String(e) }));
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      try {
        const json = await apiGet<{ progress?: { step?: string } }>(`/createx/progress?id=${jobId}`);
        const step: string | null = json.progress?.step || null;
        if (step) {
          setCurrentStep(stepMap[step] ?? 0);
          if (step === 'done' || step === 'preview') clearInterval(t);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(t);
  }, [jobId]);

  useEffect(() => {
    if (!needsTermsConsent) {
      setTermsChecked(false);
      setTermsError(null);
    }
  }, [needsTermsConsent]);

  return (
    <>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold">THESARA.SPACE Publish</h1>

      <div className="space-y-2">
        <div className="h-2 bg-gray-200 rounded">
          <div className="h-full bg-emerald-500 rounded" style={{ width: `${progress}%` }} />
        </div>
        <ul className="flex flex-wrap gap-2 text-sm">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs ${i <= currentStep ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-100 text-gray-500 border-gray-300'}`}>{i < currentStep ? '✓' : i + 1}</span>
              {s}
            </li>
          ))}
        </ul>
      </div>

      <input
        className="w-full border rounded p-2"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Naslov"
      />
      <input
        className="w-full border rounded p-2"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Opis"
      />
  <textarea
    className="w-full border rounded p-2 font-mono text-sm"
    rows={8}
    value={code}
    onChange={(e) => setCode(e.target.value)}
    placeholder="// Paste your TSX code here"
  />
  {needsTermsConsent && (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
      <p className="font-semibold">
        Potvrdi da prihvacas {TERMS_POLICY.shortLabel} prije pokretanja THESARA.SPACE objave.
      </p>
      <label className="mt-2 flex items-start gap-3 text-gray-800">
        <input
          type="checkbox"
          checked={termsChecked}
          onChange={(event) => {
            setTermsChecked(event.target.checked);
            if (event.target.checked) setTermsError(null);
          }}
          className="mt-1 h-4 w-4 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500"
        />
        <span>
          Potvrdujem da sam procitao/la uvjete i prihvacam ih za sve naredne objave stvorene s
          THESARA.SPACE alatom.
        </span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowTermsModal(true)}
          className="text-sm font-semibold text-emerald-700 underline underline-offset-2"
        >
          Otvori uvjete
        </button>
        <span className="text-xs text-amber-800">
          Obavezno prilikom prve objave ili nakon promjene verzije ({TERMS_POLICY.version}).
        </span>
      </div>
      {termsError && <p className="mt-2 text-xs text-red-600">{termsError}</p>}
    </div>
  )}
  <button
        className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
        onClick={publish}
        disabled={busy}
      >
        Pokreni
      </button>

      {needsConfirm && (
        <div className="space-y-2">
          {questions.length > 0 && <h2 className="font-semibold">Pitanja</h2>}
          {questions.map((q, i) => (
            <div key={i} className="space-y-1">
              <label className="block text-sm font-medium">{q}</label>
              <input
                className="w-full border rounded p-1 text-sm"
                value={answers[`q${i}`] || ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [`q${i}`]: e.target.value }))}
              />
            </div>
          ))}
          {planLimit && (
            <p className="text-sm text-red-600">
              Free plan allows up to 5 apps. Upgrade to the Gold plan for unlimited publishing.
            </p>
          )}
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            onClick={confirm}
            disabled={busy || planLimit}
          >
            Potvrdi
          </button>
        </div>
      )}

      {artifacts?.diff && (
        <div>
          <h2 className="font-semibold">Diff</h2>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">{artifacts.diff}</pre>
        </div>
      )}

      {previewUrl && (
        <div className="space-y-2">
          <h2 className="font-semibold">Preview</h2>
          {!SANDBOX_SUBDOMAIN_ENABLED && (
            <div className="text-xs text-gray-700 bg-yellow-100 border border-yellow-200 rounded p-2">
              Sigurnosni ‘kavez’ je aktivan bez vlastite poddomene. U produkciji preporučujemo wildcard subdomene radi bolje izolacije.
              <a
                href="https://github.com/createx/README#sandbox-subdomene"
                target="_blank"
                rel="noopener noreferrer"
                className="underline ml-1"
              >
                Saznaj više
              </a>
            </div>
          )}
          <iframe src={previewUrl} className="w-full h-64 border rounded" />
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 underline"
          >
            Open in new tab
          </a>
        </div>
      )}

      <div>
        <h2 className="font-semibold">Log</h2>
        <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-64">
          {Object.entries(logs)
            .map(([k, v]) => `--- ${k} ---\n${v}`)
            .join('\n')}
        </pre>
      </div>
    </div>
      <TermsPreviewModal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title={TERMS_POLICY.shortLabel}
      />
    </>
  );
}
