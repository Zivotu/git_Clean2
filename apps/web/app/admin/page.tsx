'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { apiGet, apiGetRaw, apiPost, ApiError } from '@/lib/api';
import { joinUrl } from '@/lib/url';
import { auth } from '@/lib/firebase';
import { PUBLIC_API_URL } from '@/lib/config';
import ConfirmDialog from '@/components/ConfirmDialog';
import { resolvePreviewUrl } from '@/lib/preview';
import { useBuildSse } from '@/components/useBuildSse';
import UserManagement from '@/components/UserManagement';
import Tabs from '@/components/Tabs';
import AmbassadorProgram from '@/components/AmbassadorProgram';
import { fetchAllowedAdminEmails, saveAllowedAdminEmails } from '@/lib/adminAccess';

async function buildHeaders(withJson: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = withJson
    ? { 'Content-Type': 'application/json' }
    : {};
  try {
    const token = await auth?.currentUser?.getIdToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  return headers;
}

type LlmReport = {
  provider?: string;
  model?: string;
  status: 'not_ready' | 'generating' | 'complete' | 'error';
  createdAt?: string;
  error?: { code: string; detail?: string };
  data?: {
    summary?: string;
    publishRecommendation?: 'approve' | 'review' | 'reject';
    confidence?: number;
    risks?: { id?: string; severity: 'low' | 'med' | 'high' | 'critical'; title: string; detail?: string }[];
    questions?: { q: string; where?: string }[];
    suggested_manifest_patch?: Record<string, any>;
    suggested_transform_flags?: Record<string, any>;
  };
};

type ReviewItem = {
  id: string;
  buildId?: string;
  pendingBuildId?: string;
  title: string;
  description?: string;
  previewUrl?: string;
  ownerEmail?: string;
  submittedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  publishedAt?: number;
  appId?: string;
  slug?: string;
  version?: number;
  playUrl?: string;
  visibility?: string;
  accessMode?: string;
  author?: { uid?: string; name?: string; handle?: string };
  llm?: LlmReport;
  llmAttempts?: number;
  networkPolicy?: string;
  networkDomains?: string[];
  networkPolicyReason?: string;
  state?: BuildState;
  moderation?: {
    status?: 'approved' | 'rejected';
    by?: string | null;
    at?: number;
    reason?: string | null;
  };
};

type BuildState =
  | 'queued'
  | 'init'
  | 'analyze'
  | 'build'
  | 'bundle'
  | 'verify'
  | 'ai_scan'
  | 'llm_waiting'
  | 'llm_generating'
  | 'pending_review'
  | 'llm_failed'
  | 'pending_review_llm'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'failed'
  | 'deleted';

type TimelineEntry = { state: BuildState; at: number };

type ConfirmActionType = 'approve' | 'delete' | 'force-delete' | 'restore';
type PendingConfirmAction = { type: ConfirmActionType; item: ReviewItem };

const friendlyErrorByCode: Record<string, string> = {
  LLM_MISSING_API_KEY: 'Nedostaje LLM API ključ.',
  LLM_INVALID_JSON: 'LLM je vratio neispravan JSON.',
  LLM_UNREACHABLE: 'AI servis nije dostupan.',
  MISSING_ARTIFACT: 'Nedostaju artefakti – pokrenite cijeli build (pnpm run createx:build).',
};

function timelineClass(state: BuildState): string {
  if (state === 'llm_waiting') return 'timeline-step timeline-step-waiting';
  if (state === 'llm_generating') return 'timeline-step timeline-step-generating';
  return 'timeline-step timeline-step-active';
}
function BuildTimeline({ buildId }: { buildId: string }) {
  const API = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
  const { events, status, error } = useBuildSse(`${API}/review/builds/${buildId}/events`);
  return (
    <div className="mt-3 border rounded p-3">
      <div className="text-sm opacity-70">SSE: {status}{error ? ` — ${error}` : ''}</div>
      <ol className="mt-2 space-y-1 text-sm">
        {events.map(e => (
          <li key={`${e.at}-${e.type}-${e.payload?.status || ''}`}>
            <span className="inline-block w-28 font-mono">{new Date(e.at).toLocaleTimeString()}</span>
            <span className="inline-block w-24 font-semibold">{e.type}</span>
            <span className="opacity-60">
              {e.payload?.status || e.payload?.reason || e.payload?.message || ''}
            </span>
          </li>
        ))}
        {events.length === 0 && status === 'streaming' && <li className="text-xs text-gray-500">Čekam na događaje...</li>}
        {status === 'connecting' && <li className="text-xs text-gray-500">Povezujem se na SSE...</li>}
      </ol>
    </div>
  );
}

export default function AdminDashboard() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState('');
  const [report, setReport] = useState<LlmReport | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);
  const [currentIdentifier, setCurrentIdentifier] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState<ReviewItem | null>(null);
  const [tab, setTab] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'deleted'>('all');
  const [search, setSearch] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [confirmAction, setConfirmAction] = useState<PendingConfirmAction | null>(null);
  const [rejectState, setRejectState] = useState<{ item: ReviewItem; reason: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [zipReady, setZipReady] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [policy, setPolicy] = useState<{ camera?: boolean; microphone?: boolean; geolocation?: boolean; clipboardRead?: boolean; clipboardWrite?: boolean; } | null>(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [adminSettingsLoading, setAdminSettingsLoading] = useState(false);
  const [adminSettingsSaving, setAdminSettingsSaving] = useState(false);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminTab, setAdminTab] = useState('Aplikacije');

  const resolveItemTarget = (item: ReviewItem | null | undefined): string | null => {
    if (!item) return null; // Prioritize pending build, then current build, then ID as fallback
    return item.buildId || item.pendingBuildId || (item as any).id || null;
  };

  const ensureAdminClaim = (claims: Record<string, any> | undefined | null): boolean => {
    if (!claims) return false;
    if (claims.admin === true) return true;
    if (claims.role && String(claims.role).toLowerCase() === 'admin') return true;
    if (claims.isAdmin === true) return true;
    return false;
  };

  const deriveDownloadBase = (item: ReviewItem | null, fallback: string): string => {
    const raw = item?.slug || item?.title || fallback;
    if (!raw) return fallback;
    const safe = String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return safe || fallback;
  };

  const [artifacts, setArtifacts] = useState<any | null>(null);
  const showDetails = Boolean(currentItem) || Boolean(currentBuildId);

  const closeDetails = () => {
    setReport(null);
    setShowRaw(false);
    setCurrentItem(null);
    setCurrentBuildId(null);
    setCurrentIdentifier(null);
    setArtifacts(null);
    setTimeline([]);
    setPolicy(null);
    setZipReady(false);
    setPreviewSrc(null);
  };

  const previewLink = currentBuildId
    ? joinUrl(PUBLIC_API_URL, `/review/builds/${currentBuildId}/index.html`)
    : null;
  const manifestLink =
    artifacts?.manifest?.exists && artifacts.manifest.url
      ? joinUrl(PUBLIC_API_URL, artifacts.manifest.url)
      : null;
  const astLink =
    artifacts?.ast?.exists && artifacts.ast.url
      ? joinUrl(PUBLIC_API_URL, artifacts.ast.url)
      : null;
  const importsLink =
    artifacts?.imports?.exists && artifacts.imports.url
      ? joinUrl(PUBLIC_API_URL, artifacts.imports.url)
      : null;
  const transformPlanLink =
    artifacts?.transformPlan?.exists && artifacts.transformPlan.url
      ? joinUrl(PUBLIC_API_URL, artifacts.transformPlan.url)
      : null;
  const transformReportLink =
    artifacts?.transformReport?.exists && artifacts.transformReport.url
      ? joinUrl(PUBLIC_API_URL, artifacts.transformReport.url)
      : null;

  const viewReport = async (identifier: string) => {
    const match =
      items.find(
        (it) =>
          it.buildId === identifier ||
          it.pendingBuildId === identifier ||
          it.appId === identifier ||
          it.id === identifier ||
          it.slug === identifier,
      ) || null;
    setCurrentIdentifier(identifier);
    setCurrentItem(match);
    setShowRaw(false);
    setReport(null);
    setPreviewSrc(null);
    setZipReady(false);
    setTimeline([]);
    setArtifacts(null);
    setCurrentBuildId(null);

    try {
      let idx: any = {};
      try {
        idx = await apiGet<any>(`/review/artifacts/${identifier}`, { auth: true });
      } catch {}
      setArtifacts(idx);
      const resolvedBuildId = idx.buildId || resolveItemTarget(match) || '';
      setCurrentBuildId(resolvedBuildId || null);
      setZipReady(Boolean(idx.bundle?.exists));

      // Use the direct bundle URL if available (bundle-first), otherwise fallback
      const previewUrl = idx.previewIndex?.exists
        ? joinUrl(PUBLIC_API_URL, idx.previewIndex.url)
        : resolvePreviewUrl(match?.previewUrl);

      const preview = previewUrl || joinUrl(PUBLIC_API_URL, '/assets/preview-placeholder.svg');
      setPreviewSrc(preview);
      if (resolvedBuildId) {
        try {
          const buildJson = await apiGet<any>(`/review/builds/${resolvedBuildId}`, { auth: true });
          setTimeline(buildJson.timeline || []);
        } catch {}
        try {
          const pol = await apiGet<any>(`/review/builds/${resolvedBuildId}/policy`, { auth: true });
          setPolicy(pol || {});
        } catch {}
      }
    } catch {}
  };

  async function downloadCode(id?: string) {
    const target = id || currentBuildId;
    if (!target) {
      alert('Bundle nije spreman.');
      return;
    }
    try {
      const basePath = `/review/code/${target}`;
      let res = await apiGetRaw(`${basePath}?format=zip`, { auth: true });
      if (res.status === 404) {
        alert('Artefakti ove aplikacije još nisu spremni. Pričekaj dovršetak builda ili ponovno pokreni build pa pokušaj opet.');
        return;
      }
      if (!res.ok) {
        res = await apiGetRaw(basePath, { auth: true });
        if (res.status === 404) {
          alert('Artefakti ove aplikacije još nisu spremni. Pričekaj dovršetak builda ili ponovno pokreni build pa pokušaj opet.');
          return;
        }
        if (!res.ok) throw new Error(`download_failed_${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const base = deriveDownloadBase(currentItem, target);
      if (res.headers.get('content-type') === 'application/zip') {
        a.download = `${base}-bundle.zip`;
      } else {
        a.download = `${base}.tar.gz`;
      }
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Preuzimanje nije uspjelo. Pokušaj ponovno kasnije.');
    }
  }

  const triggerLlm = async (id: string) => {
    if (llmEnabled === false) {
      alert('LLM analiza je trenutno isključena.');
      return;
    }
    setRegeneratingId(id);
    try {
      await apiPost(`/review/builds/${id}/llm`, {}, { auth: true });
      await load();
      if (id === currentBuildId) await viewReport(id);
    } catch (e) {
      if (id === currentBuildId)
        setReport({ status: 'error', error: { code: e instanceof ApiError && e.code ? e.code : 'UNKNOWN' } });
      setRegeneratingId(null);
    }
  };

  const regenerate = async () => {
    if (currentBuildId) await triggerLlm(currentBuildId);
  };

  const load = useCallback(async (cursor?: string): Promise<number | undefined> => {
    try {
      let url = '/review/builds';
      const params = new URLSearchParams();
      params.set('status', tab);
      if (cursor) params.set('cursor', cursor);
      const q = params.toString();
      if (q) url += `?${q}`;
      const json = await apiGet<any>(url, { auth: true });
      setItems((prev) => (cursor ? [...prev, ...(json.items || [])] : json.items || []));
      setNextCursor(json.nextCursor || null);
      setError('');
      return 200;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          return 401;
        }
        if (e.status === 403) {
          setError('Access denied – sign in as admin or ask to be whitelisted.');
          return 403;
        }
        setError('Failed to load');
        return e.status;
      }
      setError('Failed to load');
    }
  }, [tab]);

  // `auth` is a module-level singleton from our Firebase wrapper, so it's safe to omit
  // it from the dependency list and treat the reference as stable.
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLlmEnabled(null);
        return;
      }
      try {
        const token = await user.getIdTokenResult();
        const adminClaim = ensureAdminClaim(token.claims);
        setIsAdmin(adminClaim);
        if (!adminClaim) {
          setError('Access denied – sign in as admin or ask to be whitelisted.');
          setLlmEnabled(null);
          return;
        }
        if (llmEnabled === null) {
          try {
            const cfg = await apiGet<any>('/review/config', { auth: true });
            setLlmEnabled(Boolean(cfg.llmReviewEnabled));
          } catch {
            setLlmEnabled(null);
          }
        }
        let status = await load();
        if (status === 401) {
          try {
            await auth.currentUser?.getIdToken(true);
          } catch {}
          status = await load();
          if (status === 401) {
            setError('Access denied – sign in as admin or ask to be whitelisted.');
          }
        }
      } catch {
        setIsAdmin(false);
        setLlmEnabled(null);
        setError('Access denied – sign in as admin or ask to be whitelisted.');
      }
    });
    return () => unsubscribe();
  }, [load, llmEnabled]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(() => {
      load();
    }, 10000);
    return () => clearInterval(t);
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) {
      setAllowedEmails([]);
      return;
    }
    let cancelled = false;
    const loadAllowed = async () => {
      setAdminSettingsLoading(true);
      setAdminSettingsError(null);
      try {
        const emails = await fetchAllowedAdminEmails();
        if (!cancelled) setAllowedEmails(emails);
      } catch (err) {
        console.error('Failed to load allowed admin emails', err);
        if (!cancelled) setAdminSettingsError('Ne mogu učitati popis dopuštenih admin korisnika.');
      } finally {
        if (!cancelled) setAdminSettingsLoading(false);
      }
    };
    void loadAllowed();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const handleRefreshAllowed = useCallback(async () => {
    if (!isAdmin) return;
    setAdminSettingsLoading(true);
    setAdminSettingsError(null);
    try {
      const emails = await fetchAllowedAdminEmails(true);
      setAllowedEmails(emails);
    } catch (err) {
      console.error('Failed to refresh allowed admin emails', err);
      setAdminSettingsError('Osvježavanje popisa nije uspjelo.');
    } finally {
      setAdminSettingsLoading(false);
    }
  }, [isAdmin]);

  const handleAddAdminEmail = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isAdmin) return;
      const email = newAdminEmail.trim().toLowerCase();
      if (!email) {
        setAdminSettingsError('Unesite e-mail adresu.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setAdminSettingsError('E-mail adresa nije valjana.');
        return;
      }
      if (allowedEmails.includes(email)) {
        setAdminSettingsError('E-mail je već na popisu.');
        return;
      }
      setAdminSettingsSaving(true);
      setAdminSettingsError(null);
      try {
        const updated = [...allowedEmails, email].sort();
        await saveAllowedAdminEmails(updated);
        setAllowedEmails(updated);
        setNewAdminEmail('');
      } catch (err) {
        console.error('Failed to add admin email', err);
        setAdminSettingsError('Dodavanje nije uspjelo.');
      } finally {
        setAdminSettingsSaving(false);
      }
    },
    [allowedEmails, isAdmin, newAdminEmail],
  );

  const handleRemoveAdminEmail = useCallback(
    async (email: string) => {
      if (!isAdmin) return;
      const confirmed = window.confirm(`Ukloniti ${email} iz popisa?`);
      if (!confirmed) return;
      setAdminSettingsSaving(true);
      setAdminSettingsError(null);
      try {
        const updated = allowedEmails.filter((entry) => entry !== email);
        await saveAllowedAdminEmails(updated);
        setAllowedEmails(updated);
      } catch (err) {
        console.error('Failed to remove admin email', err);
        setAdminSettingsError('Uklanjanje nije uspjelo.');
      } finally {
        setAdminSettingsSaving(false);
      }
    },
    [allowedEmails, isAdmin],
  );

  const approve = async (item: ReviewItem) => {
    const target = resolveItemTarget(item);
    if (!target) {
      alert('Nema aktivnog builda za odobriti.');
      return;
    }
    await apiPost(`/review/approve/${target}`, {}, { auth: true });
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    alert('Approved');
    setTab('approved');
    if (items.length === 1 && nextCursor) {
      await load(nextCursor);
    }
  };

  const reject = async (item: ReviewItem, reason: string) => {
    const target = resolveItemTarget(item);
    if (!target) {
      alert('Nema aktivnog builda za odbijanje.');
      return;
    }
    await apiPost(`/review/reject/${target}`, { reason }, { auth: true });
    alert('Rejected');
    await load();
  };

  const deleteApp = async (item: ReviewItem) => {
    const target = item.id || item.slug || resolveItemTarget(item);
    if (!target) return;
    try {
      await apiPost(`/review/builds/${target}/delete`, {}, { auth: true });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      alert('Deleted');
    } catch (e) {
      alert('Failed to delete');
    }
  };

  const forceDeleteApp = async (item: ReviewItem) => {
    const target = resolveItemTarget(item) || item.id;
    try {
      await apiPost(`/review/builds/${target}/force-delete`, {}, { auth: true });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      alert('Deleted permanently');
    } catch (e) {
      alert('Failed to delete permanently');
    }
  };

  const restoreApp = async (item: ReviewItem) => {
    const target = item.id || item.slug || resolveItemTarget(item);
    if (!target) return;
    try {
      await apiPost(`/review/builds/${target}/restore`, {}, { auth: true });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      alert('Restored');
    } catch (e) {
      alert('Failed to restore');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, item } = confirmAction;
    try {
      if (type === 'approve') {
        await approve(item);
      } else if (type === 'delete') {
        await deleteApp(item);
      } else if (type === 'force-delete') {
        await forceDeleteApp(item);
      } else if (type === 'restore') {
        await restoreApp(item);
      }
    } finally {
      setConfirmAction(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectState) return;
    try {
      const reason = rejectState.reason.trim() || 'No reason provided';
      await reject(rejectState.item, reason);
    } finally {
      setRejectState(null);
    }
  };

const filtered = items.filter((it) =>
  (it.title || '').toLowerCase().includes(search.toLowerCase()) ||
  (it.ownerEmail || '').toLowerCase().includes(search.toLowerCase()),
);

const confirmDialog = confirmAction
  ? (() => {
      const { item, type } = confirmAction;
      const name = item.title || item.slug || item.id;
      switch (type) {
        case 'approve':
          return {
            title: 'Confirm approval',
            message: (
              <div className="space-y-2 text-sm">
                <p>
                  Approve <strong>{name}</strong>? The app will become visible to users.
                </p>
              </div>
            ),
            confirmLabel: 'Approve',
            confirmTone: 'default' as const,
          };
        case 'delete':
          return {
            title: 'Confirm delete',
            message: (
              <div className="space-y-2 text-sm">
                <p>
                  This moves <strong>{name}</strong> to the deleted tab. You can restore it later.
                </p>
              </div>
            ),
            confirmLabel: 'Delete',
            confirmTone: 'danger' as const,
          };
        case 'force-delete':
          return {
            title: 'Delete permanently',
            message: (
              <div className="space-y-2 text-sm">
                <p>
                  Permanently remove <strong>{name}</strong> and its build artifacts. This cannot be
                  undone.
                </p>
                <p className="font-semibold text-red-600">Type DELETE below to confirm.</p>
              </div>
            ),
            confirmLabel: 'Delete permanently',
            confirmTone: 'danger' as const,
            requireText: 'DELETE' as const,
          };
        case 'restore':
          return {
            title: 'Restore app',
            message: (
              <div className="space-y-2 text-sm">
                <p>
                  Restore <strong>{name}</strong> to the review queue?
                </p>
              </div>
            ),
            confirmLabel: 'Restore',
            confirmTone: 'default' as const,
          };
        default:
          return null;
      }
    })()
  : null;

if (error)
  return (
    <div className="p-4 space-y-4">
      <div>{error}</div>
      {error ===
        'Access denied – sign in as admin or ask to be whitelisted.' &&
        isAdmin === false && (
          <div className="flex gap-2">
            <button
              onClick={() => auth?.signOut()}
              className="px-2 py-1 border rounded"
            >
              Logout
            </button>
            <button
              onClick={() => {
                window.location.href = '/login';
              }}
              className="px-2 py-1 border rounded"
            >
              Login
            </button>
          </div>
        )}
    </div>
  );

  return (
    <>
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold">Admin Dashboard</h1>
        <Tabs tabs={['Aplikacije', 'Users', 'AmbasadorProgram', 'Admins']} activeTab={adminTab} onTabChange={setAdminTab}>
          {adminTab === 'Aplikacije' && (
            <>
              {/* Ambassador admin quick access */}
              <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Ambassador program</h2>
                    <p className="text-sm text-gray-500">Upravljaj prijavama, promo kodovima i isplatama ambasadora.</p>
                  </div>
                  <Link
                    href="/admin/ambassador"
                    className="inline-flex items-center justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                  >
                    Otvori Ambassador admin
                  </Link>
                </div>
              </section>
              <div className="flex gap-4">
                {(['all', 'pending', 'approved', 'rejected', 'deleted'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded ${tab === t ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="ml-auto border px-2 py-1 rounded"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="px-2 py-1 border rounded">
                    Clear
                  </button>
                )}
                <button onClick={() => load()} className="px-2 py-1 border rounded">
                  Refresh
                </button>
              </div>
              <div className="text-xs text-gray-500">Pronađeno {filtered.length} aplikacija</div>
              {llmEnabled === false && (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  AI provjera je privremeno isključena. Objave čekaju ručni pregled.
                </div>
              )}
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2">App ID</th>
                    <th className="text-left p-2">Preview</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Owner Email</th>
                    <th className="text-left p-2">Submitted</th>
                    <th className="text-left p-2">Network</th>
                    <th className="text-left p-2">LLM</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const imgSrc = resolvePreviewUrl(it.previewUrl);
                    const hasPreview = Boolean(imgSrc);
                    const actionTarget = resolveItemTarget(it);
                    const detailId = actionTarget || '';
                    const isRegenerating = actionTarget ? regeneratingId === actionTarget : false;
                    return (
                      <tr key={it.id} className="border-t">
                        <td className="p-2">{it.appId}</td>
                        <td className="p-2">
                          {hasPreview ? (
                            <Image
                              src={imgSrc}
                              alt="preview"
                              width={40}
                              height={40}
                              unoptimized
                              style={{ color: 'transparent' }}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-100 text-slate-500 text-[10px] font-medium grid place-items-center">
                              Bez
                            </div>
                          )}
                        </td>
                        <td className="p-2">{it.title}</td>
                        <td className="p-2">
                          {it.ownerEmail ? (
                            <a href={`mailto:${it.ownerEmail}`} className="text-emerald-600 underline">
                              {it.ownerEmail}
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-2">{it.submittedAt ? new Date(it.submittedAt).toLocaleString() : '-'}</td>
                        <td className="p-2">
                          {it.networkPolicy || '-'}
                          {it.networkDomains && it.networkDomains.length > 0 && (
                            <div className="text-xs text-gray-600">
                              {it.networkDomains
                                .map((d) => `fetch prema ${d}`)
                                .join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          {llmEnabled === false ? (
                            <span className="text-xs text-gray-500">LLM disabled</span>
                          ) : it.llm?.status === 'complete' ? (
                            <>
                              {it.llm.data?.publishRecommendation && (
                                <span
                                  className={`px-1 text-xs rounded ${
                                    it.llm.data.publishRecommendation === 'approve'
                                      ? 'bg-green-100 text-green-800'
                                      : it.llm.data.publishRecommendation === 'reject'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  AI preporuka: {it.llm.data.publishRecommendation}
                                </span>
                              )}
                              {it.llm.data?.summary && (
                                <div className="text-xs mt-1">{it.llm.data.summary}</div>
                              )}
                              <div className="w-24 bg-gray-200 h-2 rounded mt-1">
                                <div
                                  className="h-2 bg-emerald-600 rounded"
                                  style={{ width: `${(it.llm.data?.confidence || 0) * 100}%` }}
                                />
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {it.llm.data?.risks?.map((r) => (
                                  <span
                                    key={r.id || r.title}
                                    className="px-1 text-xs rounded bg-red-100 text-red-800"
                                  >
                                    {r.title}
                                  </span>
                                ))}
                              </div>
                            </>
                          ) : it.state === 'llm_failed' ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600">
                                LLM failed
                              </span>
                              {actionTarget && (
                                <button
                                  onClick={() => triggerLlm(actionTarget)}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
                                  disabled={isRegenerating}>
                                  {isRegenerating ? 'Running...' : 'Try again'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">
                                LLM waiting{it.llmAttempts ? ` (${it.llmAttempts})` : ''}
                              </span>
                              {actionTarget && (
                                <button
                                  onClick={() => triggerLlm(actionTarget)}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
                                  disabled={isRegenerating}
                                >
                                  {isRegenerating ? 'Running...' : 'Try again'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2 flex flex-wrap gap-2">
                          {tab === 'deleted' ? (
                            <>
                              <button
                                onClick={() => setConfirmAction({ type: 'restore', item: it })}
                                className="px-2 py-1 bg-emerald-600 text-white rounded"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => setConfirmAction({ type: 'force-delete', item: it })}
                                className="px-2 py-1 bg-black text-white rounded"
                                title="Permanently delete"
                              >
                                Delete Permanently
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmAction({ type: 'approve', item: it })}
                                className="px-2 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
                                disabled={!actionTarget}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => actionTarget && setRejectState({ item: it, reason: '' })}
                                className="px-2 py-1 bg-red-600 text-white rounded disabled:opacity-50"
                                disabled={!actionTarget}
                              >
                                Reject
                              </button>
                              {isRegenerating ? (
                                <span className="inline-block w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                              ) : (
                                <button
                                  onClick={() => detailId && viewReport(detailId)}
                                  className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
                                  disabled={!detailId}
                                >
                                  Details
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmAction({ type: 'delete', item: it })}
                                className="px-2 py-1 bg-black text-white rounded"
                                title="Delete"
                              >
                                Delete
                              </button>
                              {it.playUrl && (
                                <button
                                  onClick={() => {
                                    if (typeof window === 'undefined') return;
                                    const url = it.playUrl!.startsWith('http')
                                      ? it.playUrl!
                                      : new URL(it.playUrl!, window.location.origin).toString();
                                    window.open(url, '_blank', 'noopener');
                                  }}
                                  className="px-2 py-1 border rounded"
                                >
                                  Play
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {nextCursor && (
                <div className="text-center mt-4">
                  <button
                    onClick={() => load(nextCursor)}
                    className="px-2 py-1 border rounded"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
          {adminTab === 'Users' && <UserManagement />}
          {adminTab === 'AmbasadorProgram' && <AmbassadorProgram />}
          {adminTab === 'Admins' && (
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Postavke admin sučelja</h2>
                  <p className="text-sm text-gray-500">
                    Upravlja popisom računa koji smiju otključati skriveni admin pristup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshAllowed}
                  disabled={adminSettingsLoading}
                  className="inline-flex items-center justify-center rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Osvježi
                </button>
              </div>
              {adminSettingsError && (
                <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  {adminSettingsError}
                </div>
              )}
              <div className="mt-3">
                {adminSettingsLoading ? (
                  <div className="text-sm text-gray-500">Učitavanje…</div>
                ) : allowedEmails.length === 0 ? (
                  <div className="text-sm text-gray-500">Nema dopuštenih e-mail adresa.</div>
                ) : (
                  <ul className="space-y-2">
                    {allowedEmails.map((email) => (
                      <li
                        key={email}
                        className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm text-gray-800"
                      >
                        <span className="truncate">{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAdminEmail(email)}
                          disabled={adminSettingsSaving}
                          className="text-rose-600 transition hover:text-rose-700 disabled:opacity-40"
                        >
                          Ukloni
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <form onSubmit={handleAddAdminEmail} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(event) => {
                    setNewAdminEmail(event.target.value);
                    if (adminSettingsError) setAdminSettingsError(null);
                  }}
                  placeholder="admin@example.com"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                />
                <button
                  type="submit"
                  disabled={adminSettingsSaving || adminSettingsLoading}
                  className="inline-flex items-center justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  Dodaj
                </button>
              </form>
            </section>
          )}
        </Tabs>
      </div>
      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 max-w-2xl max-h-[80vh] overflow-auto rounded space-y-2">
            <button
              className="mb-2 text-sm text-red-600"
              onClick={closeDetails}
            >
              Close
            </button>
            {previewSrc && (
              <Image
                src={previewSrc}
                alt="preview"
                width={128}
                height={128}
                unoptimized
                style={{ color: 'transparent' }}
                className="w-32 h-32 object-cover mb-2"
              />
            )}
            {currentItem && (
              <div className="text-sm mb-3 space-y-1">
                <div className="font-semibold">{currentItem.title}</div>
                {currentItem.description && (
                  <div className="text-gray-700 whitespace-pre-wrap">{currentItem.description}</div>
                )}
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                  {currentItem.appId && <span>App ID: {currentItem.appId}</span>}
                  {currentItem.slug && <span>Slug: {currentItem.slug}</span>}
                  {currentItem.version !== undefined && (
                    <span>Verzija: {currentItem.version}</span>
                  )}
                  {currentItem.ownerEmail && <span>Owner: {currentItem.ownerEmail}</span>}
                  {(currentItem.author?.handle || currentItem.author?.name) && (
                    <span>
                      Autor: {currentItem.author?.name || currentItem.author?.handle}
                    </span>
                  )}
                  {currentItem.visibility && <span>Vidljivost: {currentItem.visibility}</span>}
                  {currentItem.accessMode && <span>Pristup: {currentItem.accessMode}</span>}
                </div>
                <div className="text-xs text-gray-600 flex flex-col gap-0.5 mt-1">
                  {currentItem.createdAt && (
                    <span>Kreirano: {new Date(currentItem.createdAt).toLocaleString()}</span>
                  )}
                  {currentItem.submittedAt && (
                    <span>Poslano na review: {new Date(currentItem.submittedAt).toLocaleString()}</span>
                  )}
                  {currentItem.updatedAt && (
                    <span>Zadnje ažurirano: {new Date(currentItem.updatedAt).toLocaleString()}</span>
                  )}
                  {currentItem.publishedAt && (
                    <span>Objavljeno: {new Date(currentItem.publishedAt).toLocaleString()}</span>
                  )}
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-2 mt-2">
                  {currentBuildId && (
                    <span className="flex items-center gap-1">
                      Build ID:
                      <code className="bg-gray-100 rounded px-1 py-px">{currentBuildId}</code>
                      <button
                        type="button"
                        className="px-1 py-px border rounded"
                        onClick={() => {
                          const clip = navigator?.clipboard;
                          if (clip?.writeText) {
                            void clip.writeText(currentBuildId).catch(() => {});
                          }
                        }}
                      >
                        Copy
                      </button>
                    </span>
                  )}
                  {currentIdentifier && currentIdentifier !== currentBuildId && (
                    <span>Traženi ID: {currentIdentifier}</span>
                  )}
                  {currentItem.pendingBuildId && currentItem.pendingBuildId !== currentBuildId && (
                    <span>Pending build: {currentItem.pendingBuildId}</span>
                  )}
                </div>
                {currentItem.moderation && (
                  <div className="text-xs text-gray-600 mt-1">
                    Moderacija: {currentItem.moderation.status || 'pending'}
                    {currentItem.moderation.reason ? ` · ${currentItem.moderation.reason}` : ''}
                    {currentItem.moderation.by ? ` · ${currentItem.moderation.by}` : ''}
                    {currentItem.moderation.at ? ` · ${new Date(currentItem.moderation.at).toLocaleString()}` : ''}
                  </div>
                )}
                {currentItem.playUrl && (
                  <div className="text-xs mt-1">
                    <a href={currentItem.playUrl} target="_blank" className="text-emerald-600 underline">
                      Otvori play URL
                    </a>
                  </div>
                )}
              </div>
            )}
            {currentBuildId ? (
              <div className="flex flex-col gap-1 mb-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {previewLink && (
                    <a
                      href={previewLink}
                      target="_blank"
                      className="px-2 py-1 border rounded text-emerald-600"
                    >
                      Otvori preview
                    </a>
                  )}
                  <button
                    onClick={() => downloadCode()}
                    className="px-2 py-1 border rounded bg-emerald-50 text-emerald-700"
                  >
                    Preuzmi bundle (.zip)
                  </button>
                  {manifestLink && (
                    <a href={manifestLink} target="_blank" className="px-2 py-1 border rounded">
                      Manifest
                    </a>
                  )}
                  {astLink && (
                    <a href={astLink} target="_blank" className="px-2 py-1 border rounded">
                      AST
                    </a>
                  )}
                  {importsLink && (
                    <a href={importsLink} target="_blank" className="px-2 py-1 border rounded">
                      Imports
                    </a>
                  )}
                  {transformPlanLink && (
                    <a href={transformPlanLink} target="_blank" className="px-2 py-1 border rounded">
                      Transform plan
                    </a>
                  )}
                  {transformReportLink && (
                    <a href={transformReportLink} target="_blank" className="px-2 py-1 border rounded">
                      Transform report
                    </a>
                  )}
                </div>
                {!zipReady && (
                  <div className="text-xs text-gray-500">
                    Bundle se još priprema – ZIP će uvijek sadržavati metapodatke te eventualno README dok artefakati ne budu spremni.
                  </div>
                )}
                {!zipReady && currentIdentifier && (
                  <div>
                    <button
                      onClick={async () => {
                        try {
                          await apiPost(`/review/builds/${currentIdentifier}/rebuild`, {}, { auth: true });
                          alert('Build queued. Refreshing…');
                          await viewReport(currentIdentifier);
                        } catch {
                          alert('Failed to queue build');
                        }
                      }}
                      className="px-2 py-1 border rounded"
                    >
                      Run build again
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-red-600 mb-2">
                Build artefakti nisu dostupni za ovaj unos.
              </div>
            )}
            {timeline.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-2">
                {timeline.map((t, idx) => (
                  <div key={`${t.state}-${idx}`} className="flex items-center">
                    <span className={timelineClass(t.state)}>{t.state}</span>
                    {idx < timeline.length - 1 && (
                      <span className="timeline-arrow timeline-arrow-active" aria-hidden="true">
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {currentBuildId ? <BuildTimeline buildId={currentBuildId} /> : null}
            {currentItem?.networkPolicy && (
              <div className="text-sm mb-2">
                <div>
                  Automatska mrežna politika: {currentItem.networkPolicy}
                </div>
                {currentItem.networkPolicyReason && (
                  <div className="text-xs text-gray-600">
                    {currentItem.networkPolicyReason}
                  </div>
                )}
                {currentItem.networkDomains && currentItem.networkDomains.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-gray-600 mt-1">
                    {currentItem.networkDomains.map((d) => (
                      <li key={d}>fetch prema {d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {currentBuildId && (
              <div className="text-sm mb-2">
                <div className="font-semibold">Dozvole (Permissions-Policy)</div>
                <div className="flex flex-wrap gap-3 mt-1">
                  {['camera','microphone','geolocation','clipboardRead','clipboardWrite'].map((k) => (
                    <label key={k} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean((policy as any)?.[k])}
                        onChange={(e) => setPolicy((p) => ({ ...(p||{}), [k]: e.target.checked }))}
                      />
                      <span>{k}</span>
                    </label>
                  ))}
                </div>
                {report?.status === 'complete' && (report.data?.suggested_manifest_patch as any)?.permissionsPolicy && (
                  <div className="mt-2 text-xs text-gray-700">
                    <div className="font-medium mb-1">AI prijedlog dozvola:</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(((report.data?.suggested_manifest_patch as any)?.permissionsPolicy) || {}).map(([k, v]) => (
                        <span key={k} className={`px-1 rounded ${v ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        const ai = (report?.data?.suggested_manifest_patch as any)?.permissionsPolicy;
                        if (ai) setPolicy((p) => ({ ...(p || {}), ...ai }));
                      }}
                      className="mt-2 px-2 py-1 border rounded"
                    >
                      Primijeni AI prijedlog
                    </button>
                  </div>
                )}
                <div className="mt-2">
                  <button
                    onClick={async () => {
                      if (!currentBuildId || !policy) return;
                      setPolicySaving(true);
                      try {
                        await fetch(`${PUBLIC_API_URL}/review/builds/${currentBuildId}/policy`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: await buildHeaders(true),
                          body: JSON.stringify(policy),
                        });
                      } catch (e) {
                        console.error(e);
                        alert('Spremanje nije uspjelo');
                      } finally {
                        setPolicySaving(false);
                      }
                    }}
                    className="px-3 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
                    disabled={policySaving}
                  >
                    {policySaving ? 'Spremam…' : 'Spremi dozvole'}
                  </button>
                </div>
              </div>
            )}
            {currentItem?.llmAttempts !== undefined && (
              <div className="text-sm mb-2">LLM attempts: {currentItem.llmAttempts}</div>
            )}
            {report?.status === 'not_ready' && currentBuildId && (
              <div className="space-y-2">
                <p className="text-sm">No report available.</p>
                <button
                  onClick={regenerate}
                  className="px-3 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
                  disabled={regeneratingId === currentBuildId || llmEnabled === false}
                >
                  {regeneratingId === currentBuildId
                    ? 'Analiza…'
                    : llmEnabled === false
                    ? 'LLM isključen'
                    : 'Pokreni LLM analizu'}
                </button>
                {llmEnabled === false && (
                  <p className="text-xs text-gray-500">Uključi AI provjeru u konfiguraciji kako bi izvještaj bio dostupan.</p>
                )}
              </div>
            )}
            {report?.status === 'complete' && (
              <>
                  <p className="text-sm text-gray-600">
                    Provider: {report.provider} / {report.model}
                  </p>
                  {report.data?.publishRecommendation && (
                    <div className="text-sm font-semibold mt-1">
                      AI preporuka: {report.data.publishRecommendation}
                    </div>
                  )}
                  {report.data?.summary && (
                    <p className="text-sm mt-1">{report.data.summary}</p>
                  )}
                  {report.data?.confidence !== undefined && (
                    <div className="w-32 bg-gray-200 h-2 rounded">
                      <div
                        className="h-2 bg-emerald-600 rounded"
                        style={{ width: `${(report.data?.confidence || 0) * 100}%` }}
                      />
                    </div>
                  )}
                  {(report.data?.risks?.length ?? 0) > 0 && (
                    <ul className="list-disc list-inside text-sm mt-2">
                      {(report.data?.risks ?? []).map((r) => (
                        <li key={r.title}>{r.title}</li>
                      ))}
                    </ul>
                  )}
                  {(report.data?.questions?.length ?? 0) > 0 && (
                    <ul className="list-disc list-inside text-sm mt-2">
                      {(report.data?.questions ?? []).map((q) => (
                        <li key={q.q}>{q.q}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    className="text-xs text-emerald-600 underline mt-2"
                    onClick={() => setShowRaw((s) => !s)}
                  >
                    {showRaw ? 'Hide JSON' : 'Show JSON'}
                  </button>
                  {showRaw && (
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                      {JSON.stringify(report, null, 2)}
                    </pre>
                  )}
                </>
              )}
            {report?.status === 'error' && (
              <div className="space-y-2">
                <div className="text-sm text-red-600">
                  {friendlyErrorByCode[report.error?.code || ''] ||
                    report.error?.code ||
                    'LLM review failed'}
                </div>
                <button
                  onClick={regenerate}
                  className="px-3 py-1 bg-emerald-600 text-white rounded disabled:opacity-50"
                  disabled={regeneratingId === currentBuildId}
                >
                  {regeneratingId === currentBuildId ? 'Analiza…' : 'Run again'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          confirmTone={confirmDialog.confirmTone}
          requireText={confirmDialog.requireText}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirmAction(null)}
        />
      )}
      {rejectState && (
        <ConfirmDialog
          open
          title={`Reject ${rejectState.item.title || rejectState.item.slug || rejectState.item.id}?`}
          message={
            <div className="space-y-3 text-sm">
              <p>Enter a rejection reason that will be shown to the creator.</p>
              <textarea
                className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                rows={4}
                value={rejectState.reason}
                onChange={(e) =>
                  setRejectState((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
                }
                placeholder="Reason for rejection"
              />
            </div>
          }
          confirmLabel="Reject"
          confirmTone="danger"
          onConfirm={handleRejectConfirm}
          onClose={() => setRejectState(null)}
        />
      )}
    </>
  );
}
