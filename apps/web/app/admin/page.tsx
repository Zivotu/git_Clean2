"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  FileText,
  Download,
  ExternalLink,
  Trash2,
  RotateCcw,
  Shield,
  Mail,
  Settings,
  ChevronRight,
  MoreHorizontal,
  Filter
} from 'lucide-react';
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
import { useI18n } from '@/lib/i18n-provider';
import { buildLoginUrl, getCurrentRelativeUrl } from '@/lib/loginRedirect';

async function buildHeaders(withJson: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = withJson
    ? { 'Content-Type': 'application/json' }
    : {};
  try {
    const token = await auth?.currentUser?.getIdToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { }
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

type ConfirmActionType = 'approve' | 'delete' | 'force-delete' | 'restore' | 'refresh';
type PendingConfirmAction = { type: ConfirmActionType; item: ReviewItem };
type AdminTabKey = 'apps' | 'users' | 'ambassador' | 'admins' | 'emailTemplates' | 'storage';
const reviewStatuses = ['all', 'pending', 'approved', 'rejected', 'deleted'] as const;
type ReviewStatus = (typeof reviewStatuses)[number];

const ACCESS_DENIED_ERROR = 'access_denied';


function timelineClass(state: BuildState): string {
  if (state === 'llm_waiting') return 'timeline-step timeline-step-waiting';
  if (state === 'llm_generating') return 'timeline-step timeline-step-generating';
  return 'timeline-step timeline-step-active';
}
function BuildTimeline({ buildId }: { buildId: string }) {
  const apiBase =
    (PUBLIC_API_URL && PUBLIC_API_URL.trim()) ||
    (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '') ||
    '/api';
  const eventsUrl = joinUrl(apiBase, `/review/builds/${buildId}/events`);
  const { events, status, error } = useBuildSse(eventsUrl);
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
  const [tab, setTab] = useState<ReviewStatus>('all');
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
  // Admin editable fields for current item
  const [editableVisibility, setEditableVisibility] = useState<string>('public');
  const [editableAccessMode, setEditableAccessMode] = useState<string>('public');
  const [editableStatus, setEditableStatus] = useState<string>('draft');
  const [editableState, setEditableState] = useState<string>('inactive');
  const [adminSaving, setAdminSaving] = useState(false);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [adminSettingsLoading, setAdminSettingsLoading] = useState(false);
  const [adminSettingsSaving, setAdminSettingsSaving] = useState(false);
  const [adminSettingsError, setAdminSettingsError] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [pendingAdminRemoval, setPendingAdminRemoval] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTabKey>('apps');
  // Email templates editor state
  const [templates, setTemplates] = useState<Array<{ id: string; subject?: string; body?: string; description?: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newTemplateSubject, setNewTemplateSubject] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  // Storage maintenance state
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);


  const { messages } = useI18n();
  const tAdmin = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let value = messages[`Admin.${key}`] || key;
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          value = value.replaceAll(`{${paramKey}}`, String(paramValue));
        }
      }
      return value;
    },
    [messages],
  );

  const showAdminAlert = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      alert(tAdmin(key, params));
    },
    [tAdmin],
  );

  const formatActionError = (err: unknown): string => {
    if (err instanceof ApiError) {
      return err.message || err.code || '';
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (typeof err === 'string') {
      return err;
    }
    return '';
  };

  const showAdminErrorAlert = (key: string, err: unknown) => {
    const detail = formatActionError(err);
    const base = tAdmin(key);
    if (detail && detail !== base) {
      alert(`${base}\n\n${detail}`);
    } else {
      alert(base);
    }
  };

  const adminTabs = useMemo(
    () => [
      { id: 'apps', label: tAdmin('tabs.apps') },
      { id: 'users', label: tAdmin('tabs.users') },
      { id: 'ambassador', label: tAdmin('tabs.ambassadorProgram') },
      { id: 'admins', label: tAdmin('tabs.admins') },
      { id: 'emailTemplates', label: tAdmin('tabs.emailTemplates') },
      { id: 'storage', label: 'Storage' },
    ],
    [tAdmin],
  );

  const statusFilters = useMemo<Record<ReviewStatus, string>>(
    () => ({
      all: tAdmin('filters.status.all'),
      pending: tAdmin('filters.status.pending'),
      approved: tAdmin('filters.status.approved'),
      rejected: tAdmin('filters.status.rejected'),
      deleted: tAdmin('filters.status.deleted'),
    }),
    [tAdmin],
  );

  const getFriendlyError = useCallback(
    (code?: string | null) => {
      switch (code) {
        case 'LLM_MISSING_API_KEY':
          return tAdmin('errors.llmMissingApiKey');
        case 'LLM_INVALID_JSON':
          return tAdmin('errors.llmInvalidJson');
        case 'LLM_UNREACHABLE':
          return tAdmin('errors.llmUnreachable');
        case 'MISSING_ARTIFACT':
          return tAdmin('errors.missingArtifact');
        default:
          return null;
      }
    },
    [tAdmin],
  );

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

  const buildPreviewLink = currentBuildId
    ? resolvePreviewUrl(`/builds/${currentBuildId}/build/index.html`)
    : null;
  const bundlePreviewLink = currentBuildId
    ? resolvePreviewUrl(`/builds/${currentBuildId}/bundle/index.html`)
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
      } catch { }
      setArtifacts(idx);
      const resolvedBuildId = idx.buildId || resolveItemTarget(match) || '';
      setCurrentBuildId(resolvedBuildId || null);
      // initialize editable admin fields when viewing an item
      if (match) {
        setEditableVisibility(match.visibility || 'public');
        setEditableAccessMode(match.accessMode || 'public');
        setEditableStatus((match as any).status || 'draft');
        setEditableState((match as any).state || 'inactive');
      } else {
        setEditableVisibility('public');
        setEditableAccessMode('public');
        setEditableStatus('draft');
        setEditableState('inactive');
      }
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
        } catch { }
        try {
          const pol = await apiGet<any>(`/review/builds/${resolvedBuildId}/policy`, { auth: true });
          setPolicy(pol || {});
        } catch { }
      }
    } catch { }
  };

  async function downloadCode(id?: string) {
    const target = id || currentBuildId;
    if (!target) {
      showAdminAlert('alerts.bundleNotReady');
      return;
    }
    try {
      const basePath = `/review/code/${target}`;
      let res = await apiGetRaw(`${basePath}?format=zip`, { auth: true });
      if (res.status === 404) {
        showAdminAlert('alerts.artifactsPending');
        return;
      }
      if (!res.ok) {
        res = await apiGetRaw(basePath, { auth: true });
        if (res.status === 404) {
          showAdminAlert('alerts.artifactsPending');
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
      showAdminAlert('alerts.downloadFailed');
    }
  }

  const triggerLlm = async (id: string) => {
    if (llmEnabled === false) {
      alert(tAdmin('llmStatus.disabledToast'));
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
          setError(ACCESS_DENIED_ERROR);
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
          setError(ACCESS_DENIED_ERROR);
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
          } catch { }
          status = await load();
          if (status === 401) {
            setError(ACCESS_DENIED_ERROR);
          }
        }
      } catch {
        setIsAdmin(false);
        setLlmEnabled(null);
        setError(ACCESS_DENIED_ERROR);
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
        if (!cancelled) setAdminSettingsError(tAdmin('adminSettings.loadError'));
      } finally {
        if (!cancelled) setAdminSettingsLoading(false);
      }
    };
    void loadAllowed();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, tAdmin]);

  const handleRefreshAllowed = useCallback(async () => {
    if (!isAdmin) return;
    setAdminSettingsLoading(true);
    setAdminSettingsError(null);
    try {
      const emails = await fetchAllowedAdminEmails(true);
      setAllowedEmails(emails);
    } catch (err) {
      console.error('Failed to refresh allowed admin emails', err);
      setAdminSettingsError(tAdmin('adminSettings.refreshError'));
    } finally {
      setAdminSettingsLoading(false);
    }
  }, [isAdmin, tAdmin]);

  const handleAddAdminEmail = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isAdmin) return;
      const email = newAdminEmail.trim().toLowerCase();
      if (!email) {
        setAdminSettingsError(tAdmin('adminSettings.addEmpty'));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setAdminSettingsError(tAdmin('adminSettings.addInvalid'));
        return;
      }
      if (allowedEmails.includes(email)) {
        setAdminSettingsError(tAdmin('adminSettings.addDuplicate'));
        return;
      }
      setAdminSettingsSaving(true);
      setAdminSettingsError(null);
      try {
        const updated = await saveAllowedAdminEmails([...allowedEmails, email]);
        setAllowedEmails(updated);
        setNewAdminEmail('');
      } catch (err) {
        console.error('Failed to add admin email', err);
        setAdminSettingsError(tAdmin('adminSettings.addFailed'));
      } finally {
        setAdminSettingsSaving(false);
      }
    },
    [allowedEmails, isAdmin, newAdminEmail, tAdmin],
  );

  const handleRemoveAdminEmail = useCallback(
    async (email: string) => {
      if (!isAdmin) return;
      setAdminSettingsSaving(true);
      setAdminSettingsError(null);
      try {
        const updated = await saveAllowedAdminEmails(allowedEmails.filter((entry) => entry !== email));
        setAllowedEmails(updated);
      } catch (err) {
        console.error('Failed to remove admin email', err);
        setAdminSettingsError(tAdmin('adminSettings.removeFailed'));
      } finally {
        setAdminSettingsSaving(false);
      }
    },
    [allowedEmails, isAdmin, tAdmin],
  );

  const approve = async (item: ReviewItem) => {
    const target = resolveItemTarget(item);
    if (!target) {
      showAdminAlert('alerts.noBuildApprove');
      return;
    }
    try {
      await apiPost(`/review/approve/${target}`, {}, { auth: true });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      showAdminAlert('alerts.approveSuccess');
      setTab('approved');
      if (items.length === 1 && nextCursor) {
        await load(nextCursor);
      }
    } catch (err) {
      console.error('admin_approve_failed', err);
      showAdminErrorAlert('alerts.approveFailed', err);
    }
  };

  const refreshListing = async (item: ReviewItem) => {
    const target = resolveItemTarget(item);
    if (!target) {
      showAdminAlert('alerts.noBuildApprove');
      return;
    }
    try {
      await apiPost(`/review/refresh/${target}`, {}, { auth: true });
      showAdminAlert('alerts.refreshSuccess');
      await load();
    } catch (err) {
      console.error('admin_refresh_failed', err);
      showAdminErrorAlert('alerts.refreshFailed', err);
    }
  };

  const reject = async (item: ReviewItem, reason: string) => {
    const target = resolveItemTarget(item);
    if (!target) {
      showAdminAlert('alerts.noBuildReject');
      return;
    }
    try {
      await apiPost(`/review/reject/${target}`, { reason }, { auth: true });
      showAdminAlert('alerts.rejectSuccess');
      await load();
    } catch (err) {
      console.error('admin_reject_failed', err);
      showAdminErrorAlert('alerts.rejectFailed', err);
    }
  };

  const deleteApp = async (item: ReviewItem) => {
    const target = item.id || item.slug || resolveItemTarget(item);
    if (!target) return;
    try {
      await apiPost(`/review/builds/${target}/delete`, {}, { auth: true });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      showAdminAlert('alerts.deleteSuccess');
    } catch (e) {
      showAdminAlert('alerts.deleteFailed');
    }
  };

  const forceDeleteApp = async (item: ReviewItem) => {
    const target = resolveItemTarget(item) || item.id;
    try {
      await apiPost(`/review/builds/${target}/force-delete`, {}, { auth: true });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      showAdminAlert('alerts.forceDeleteSuccess');
    } catch (e) {
      showAdminAlert('alerts.forceDeleteFailed');
    }
  };

  const restoreApp = async (item: ReviewItem) => {
    const target = item.id || item.slug || resolveItemTarget(item);
    if (!target) return;
    try {
      await apiPost(`/review/builds/${target}/restore`, {}, { auth: true });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      showAdminAlert('alerts.restoreSuccess');
    } catch (e) {
      showAdminAlert('alerts.restoreFailed');
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, item } = confirmAction;
    try {
      if (type === 'approve') {
        await approve(item);
      } else if (type === 'refresh') {
        await refreshListing(item);
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

  const loadStorageStats = useCallback(async () => {
    setStorageLoading(true);
    setStorageError(null);
    try {
      const data = await apiGet<any>('/admin/maintenance/builds', { auth: true });
      setStorageStats(data);
    } catch (e) {
      console.error(e);
      setStorageError('Failed to load storage stats');
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminTab === 'storage' && !storageStats && !storageLoading) {
      loadStorageStats();
    }
  }, [adminTab, storageStats, storageLoading, loadStorageStats]);

  const handlePruneStorage = async () => {
    if (!confirm('Are you sure you want to delete orphaned builds? This cannot be undone.')) return;
    setStorageLoading(true);
    setStorageError(null);
    try {
      const data = await apiPost<any>('/admin/maintenance/builds/prune', {}, { auth: true });
      setStorageStats(data);
      alert(`Pruned ${data.orphanedBuilds} builds.`);
    } catch (e) {
      console.error(e);
      setStorageError('Failed to prune storage');
    } finally {
      setStorageLoading(false);
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
        case 'refresh':
          return {
            title: 'Refresh listing',
            message: (
              <div className="space-y-2 text-sm">
                <p>
                  Refresh <strong>{name}</strong>? This re-runs publish steps and syncs metadata.
                </p>
              </div>
            ),
            confirmLabel: 'Refresh',
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
        <div>{error === ACCESS_DENIED_ERROR ? tAdmin('errors.accessDenied') : error}</div>
        {error === ACCESS_DENIED_ERROR && isAdmin === false && (
          <div className="flex gap-2">
            <button onClick={() => auth?.signOut()} className="px-2 py-1 border rounded">
              {tAdmin('buttons.logout')}
            </button>
            <button
              onClick={() => {
                const target = getCurrentRelativeUrl();
                window.location.href = buildLoginUrl(target);
              }}
              className="px-2 py-1 border rounded"
            >
              {tAdmin('buttons.login')}
            </button>
          </div>
        )}
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-zinc-950/50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {tAdmin('title')}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manage applications, users, and system settings.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6">
            <Tabs tabs={adminTabs} activeTab={adminTab} onTabChange={(tab) => setAdminTab(tab as AdminTabKey)}>
              {adminTab === 'apps' && (
                <div className="space-y-6 py-6">
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-zinc-800/50 p-1 rounded-lg">
                      {reviewStatuses.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTab(t)}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${tab === t
                            ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-slate-100 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-zinc-800'
                            }`}
                        >
                          {statusFilters[t]}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={tAdmin('filters.searchPlaceholder')}
                          className="w-full sm:w-64 pl-9 pr-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                        />
                        {search && (
                          <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => load()}
                        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                        title={tAdmin('filters.refresh')}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* Stats & Alerts */}
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{tAdmin('stats.foundApps', { count: filtered.length })}</span>
                    {llmEnabled === false && (
                      <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {tAdmin('alerts.llmDisabled')}
                      </span>
                    )}
                  </div>

                  {/* Table */}
                  <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                      <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-slate-400 font-medium">
                        <tr>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.appId')}</th>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.preview')}</th>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.name')}</th>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.ownerEmail')}</th>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.submitted')}</th>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.network')}</th>
                          <th className="px-4 py-3 whitespace-nowrap">{tAdmin('table.llm')}</th>
                          <th className="px-4 py-3 whitespace-nowrap text-right">{tAdmin('table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
                        {filtered.map((it) => {
                          const imgSrc = resolvePreviewUrl(it.previewUrl);
                          const hasPreview = Boolean(imgSrc);
                          const actionTarget = resolveItemTarget(it);
                          const detailId = actionTarget || '';
                          const isRegenerating = actionTarget ? regeneratingId === actionTarget : false;
                          return (
                            <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{it.appId}</td>
                              <td className="px-4 py-3">
                                {hasPreview ? (
                                  <Image
                                    src={imgSrc}
                                    alt="preview"
                                    width={40}
                                    height={40}
                                    unoptimized
                                    style={{ color: 'transparent' }}
                                    className="w-10 h-10 object-cover rounded-md border border-slate-200 dark:border-zinc-700"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center">
                                    <div className="h-4 w-4 bg-slate-200 dark:bg-zinc-700 rounded-sm" />
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{it.title}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                {it.ownerEmail ? (
                                  <a href={`mailto:${it.ownerEmail}`} className="hover:text-emerald-600 hover:underline">
                                    {it.ownerEmail}
                                  </a>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs">
                                {it.submittedAt ? new Date(it.submittedAt).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <div className="flex flex-col gap-1">
                                  <span className="text-slate-600 dark:text-slate-400">{it.networkPolicy || '-'}</span>
                                  {it.networkDomains && it.networkDomains.length > 0 && (
                                    <div className="text-slate-400">
                                      {it.networkDomains
                                        .map((d) => tAdmin('network.fetchDomain', { domain: d }))
                                        .join(', ')}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {llmEnabled === false ? (
                                  <span className="text-xs text-slate-400">{tAdmin('llm.disabledLabel')}</span>
                                ) : it.llm?.status === 'complete' ? (
                                  <div className="space-y-1.5">
                                    {it.llm.data?.publishRecommendation && (
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${it.llm.data.publishRecommendation === 'approve'
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                          : it.llm.data.publishRecommendation === 'reject'
                                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                          }`}
                                      >
                                        {it.llm.data.publishRecommendation.toUpperCase()}
                                      </span>
                                    )}
                                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-500 rounded-full"
                                        style={{ width: `${(it.llm.data?.confidence || 0) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : it.state === 'llm_failed' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-rose-500 font-medium">Failed</span>
                                    {actionTarget && (
                                      <button
                                        onClick={() => triggerLlm(actionTarget)}
                                        className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-slate-400 hover:text-emerald-600 transition-colors"
                                        disabled={isRegenerating}
                                        title="Retry AI Review"
                                      >
                                        <RefreshCw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">Waiting...</span>
                                    {actionTarget && (
                                      <button
                                        onClick={() => triggerLlm(actionTarget)}
                                        className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-slate-400 hover:text-emerald-600 transition-colors"
                                        disabled={isRegenerating}
                                        title="Retry AI Review"
                                      >
                                        <RefreshCw className={`h-3 w-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {tab === 'deleted' ? (
                                    <>
                                      <button
                                        onClick={() => setConfirmAction({ type: 'restore', item: it })}
                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                                        title="Restore"
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => setConfirmAction({ type: 'force-delete', item: it })}
                                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                                        title="Delete Permanently"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {tab === 'approved' ? (
                                        <button
                                          onClick={() => setConfirmAction({ type: 'refresh', item: it })}
                                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                          disabled={!actionTarget}
                                          title="Refresh"
                                        >
                                          <RefreshCw className="h-4 w-4" />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => setConfirmAction({ type: 'approve', item: it })}
                                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                                          disabled={!actionTarget}
                                          title="Approve"
                                        >
                                          <Check className="h-4 w-4" />
                                        </button>
                                      )}

                                      <button
                                        onClick={() => actionTarget && setRejectState({ item: it, reason: '' })}
                                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                                        disabled={!actionTarget}
                                        title="Reject"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>

                                      <button
                                        onClick={() => detailId && viewReport(detailId)}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                        disabled={!detailId}
                                        title="Details"
                                      >
                                        <FileText className="h-4 w-4" />
                                      </button>

                                      <button
                                        onClick={() => setConfirmAction({ type: 'delete', item: it })}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="h-4 w-4" />
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
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                          title="Play"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {nextCursor && (
                    <div className="text-center pt-4">
                      <button
                        onClick={() => load(nextCursor)}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                      >
                        {tAdmin('pagination.loadMore')}
                      </button>
                    </div>
                  )}
                </div>

              )}
              {adminTab === 'users' && <UserManagement />}
              {adminTab === 'ambassador' && <AmbassadorProgram />}
              {adminTab === 'admins' && (
                <section className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tAdmin('adminSettings.heading')}</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {tAdmin('adminSettings.description')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRefreshAllowed}
                      disabled={adminSettingsLoading}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${adminSettingsLoading ? 'animate-spin' : ''}`} />
                      {tAdmin('adminSettings.refresh')}
                    </button>
                  </div>

                  <div className="p-6">
                    {adminSettingsError && (
                      <div className="mb-6 rounded-lg border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {adminSettingsError}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <label className="sr-only">{tAdmin('adminSettings.addPlaceholder')}</label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                              type="email"
                              value={newAdminEmail}
                              onChange={(event) => {
                                setNewAdminEmail(event.target.value);
                                if (adminSettingsError) setAdminSettingsError(null);
                              }}
                              placeholder={tAdmin('adminSettings.addPlaceholder')}
                              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            />
                          </div>
                        </div>
                        <button
                          onClick={(e: any) => handleAddAdminEmail(e)}
                          disabled={adminSettingsSaving || adminSettingsLoading || !newAdminEmail}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {adminSettingsSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {tAdmin('adminSettings.addButton')}
                        </button>
                      </div>

                      <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
                        {adminSettingsLoading ? (
                          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
                            {tAdmin('adminSettings.loading')}
                          </div>
                        ) : allowedEmails.length === 0 ? (
                          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            {tAdmin('adminSettings.empty')}
                          </div>
                        ) : (
                          <ul className="divide-y divide-slate-200 dark:divide-zinc-700">
                            {allowedEmails.map((email) => (
                              <li
                                key={email}
                                className="flex items-center justify-between px-4 py-3 hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-medium text-xs shrink-0">
                                    {email.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{email}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setPendingAdminRemoval(email)}
                                  disabled={adminSettingsSaving}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors disabled:opacity-50"
                                  title={tAdmin('adminSettings.remove')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {adminTab === 'emailTemplates' && (
                <section className="space-y-6">
                  <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tAdmin('emailTemplates.heading')}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{tAdmin('emailTemplates.description')}</p>
                      </div>
                      <button
                        onClick={async () => {
                          setTemplatesError(null);
                          setTemplatesLoading(true);
                          try {
                            const resp = await apiGet<any>('/admin/email-templates', { auth: true });
                            setTemplates(resp.items || []);
                          } catch (err) {
                            console.error('Failed to load templates', err);
                            setTemplatesError(tAdmin('emailTemplates.loadFailed'));
                          } finally {
                            setTemplatesLoading(false);
                          }
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <RefreshCw className={`h-4 w-4 ${templatesLoading ? 'animate-spin' : ''}`} />
                        {tAdmin('emailTemplates.refresh')}
                      </button>
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-zinc-800/30 border-b border-slate-200 dark:border-zinc-800">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                            {tAdmin('emailTemplates.scenarioLabel')}
                          </label>
                          <div className="relative">
                            <select
                              className="w-full appearance-none bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                              value={newTemplateId}
                              onChange={(e) => {
                                setNewTemplateId(e.target.value);
                                setNewTemplateSubject('');
                                setNewTemplateBody('');
                              }}
                            >
                              <option value="">{tAdmin('emailTemplates.scenarioPlaceholder')}</option>
                              <option value="welcome">{tAdmin('emailTemplates.scenarios.welcome')}</option>
                              <option value="review:approval_notification">{tAdmin('emailTemplates.scenarios.reviewApproval')}</option>
                              <option value="review:reject_notification">{tAdmin('emailTemplates.scenarios.reviewReject')}</option>
                              <option value="publish:pending_notification">{tAdmin('emailTemplates.scenarios.publishPending')}</option>
                            </select>
                            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 rotate-90 pointer-events-none" />
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              onClick={async () => {
                                const id = (newTemplateId || '').trim();
                                if (!id) {
                                  showAdminAlert('emailTemplates.scenarioDropdownHint');
                                  return;
                                }
                                setTemplatesError(null);
                                setTemplatesLoading(true);
                                try {
                                  try {
                                    const stored = await apiGet<any>(`/admin/email-templates/${encodeURIComponent(id)}`, { auth: true });
                                    setNewTemplateSubject(stored.subject || '');
                                    setNewTemplateBody(stored.body || '');
                                  } catch (err: any) {
                                    try {
                                      const fb = await apiGet<any>(`/admin/email-templates/${encodeURIComponent(id)}/fallback`, { auth: true });
                                      setNewTemplateSubject(fb.subject || '');
                                      setNewTemplateBody(fb.body || '');
                                    } catch (fbErr) {
                                      console.error('Failed to load fallback', fbErr);
                                      showAdminAlert('emailTemplates.scenarioLoadFailed');
                                    }
                                  }
                                } finally {
                                  setTemplatesLoading(false);
                                }
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium transition-colors"
                            >
                              <Download className="h-3 w-3" />
                              {tAdmin('emailTemplates.load')}
                            </button>
                            <button
                              onClick={async () => {
                                const id = (newTemplateId || '').trim();
                                if (!id) {
                                  showAdminAlert('emailTemplates.scenarioRequired');
                                  return;
                                }
                                try {
                                  await apiPost(`/admin/email-templates/${encodeURIComponent(id)}`, { subject: newTemplateSubject, body: newTemplateBody }, { auth: true });
                                  showAdminAlert('alerts.saveSuccess');
                                  const resp = await apiGet<any>('/admin/email-templates', { auth: true });
                                  setTemplates(resp.items || []);
                                } catch (err) {
                                  console.error(err);
                                  showAdminAlert('alerts.saveFailed');
                                }
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-700 rounded-md text-xs font-medium transition-colors"
                            >
                              <Check className="h-3 w-3" />
                              {tAdmin('emailTemplates.save')}
                            </button>
                            <button
                              onClick={async () => {
                                const id = (newTemplateId || '').trim();
                                if (!id) {
                                  showAdminAlert('emailTemplates.scenarioRequired');
                                  return;
                                }
                                try {
                                  const fb = await apiGet<any>(`/admin/email-templates/${encodeURIComponent(id)}/fallback`, { auth: true });
                                  setNewTemplateSubject(fb.subject || '');
                                  setNewTemplateBody(fb.body || '');
                                  showAdminAlert('emailTemplates.restoreInfo');
                                } catch (err) {
                                  console.error(err);
                                  showAdminAlert('emailTemplates.restoreFailed');
                                }
                              }}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-700 rounded-md text-xs font-medium transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" />
                              {tAdmin('emailTemplates.restoreFallback')}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                              {tAdmin('emailTemplates.subjectLabel')}
                            </label>
                            <input
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                              value={newTemplateSubject}
                              onChange={(e) => setNewTemplateSubject(e.target.value)}
                              placeholder="Email subject..."
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                              {tAdmin('emailTemplates.bodyLabel')}
                            </label>
                            <textarea
                              rows={6}
                              className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                              value={newTemplateBody}
                              onChange={(e) => setNewTemplateBody(e.target.value)}
                              placeholder="Email body (HTML supported)..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6">
                      {templatesError && (
                        <div className="mb-6 rounded-lg border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {templatesError}
                        </div>
                      )}

                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                        {tAdmin('emailTemplates.createTitle')}
                      </h3>

                      {templatesLoading ? (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
                          {tAdmin('emailTemplates.loading')}
                        </div>
                      ) : templates.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg">
                          {tAdmin('emailTemplates.empty')}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {templates.map((t) => (
                            <div key={t.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 hover:border-emerald-500/50 transition-colors group">
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded text-slate-600 dark:text-slate-400">
                                      {t.id}
                                    </span>
                                    {t.description && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400">{t.description}</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={async () => {
                                    try {
                                      await apiPost(`/admin/email-templates/${t.id}`, { subject: t.subject || '', body: t.body || '' }, { auth: true });
                                      showAdminAlert('alerts.saveSuccess');
                                    } catch (err) {
                                      console.error(err);
                                      showAdminAlert('alerts.saveFailed');
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-md text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all"
                                >
                                  <Check className="h-3 w-3" />
                                  {tAdmin('emailTemplates.save')}
                                </button>
                              </div>

                              <div className="space-y-3">
                                <input
                                  className="w-full bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded px-3 py-2 text-sm focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                  value={t.subject || ''}
                                  onChange={(e) =>
                                    setTemplates((prev) =>
                                      prev.map((x) => (x.id === t.id ? { ...x, subject: e.target.value } : x)),
                                    )
                                  }
                                  placeholder="Subject"
                                />
                                <textarea
                                  rows={3}
                                  className="w-full bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                  value={t.body || ''}
                                  onChange={(e) =>
                                    setTemplates((prev) =>
                                      prev.map((x) => (x.id === t.id ? { ...x, body: e.target.value } : x)),
                                    )
                                  }
                                  placeholder="Body"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-6 bg-slate-50 dark:bg-zinc-800/30 border-t border-slate-200 dark:border-zinc-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{tAdmin('emailTemplates.createTitle')}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{tAdmin('emailTemplates.createDescription')}</p>

                      <div className="grid grid-cols-1 gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input
                            placeholder={tAdmin('emailTemplates.placeholderId')}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            value={newTemplateId}
                            onChange={(e) => setNewTemplateId(e.target.value)}
                          />
                          <input
                            placeholder={tAdmin('emailTemplates.placeholderSubject')}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            value={newTemplateSubject}
                            onChange={(e) => setNewTemplateSubject(e.target.value)}
                          />
                        </div>
                        <textarea
                          placeholder={tAdmin('emailTemplates.placeholderBody')}
                          rows={4}
                          className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          value={newTemplateBody}
                          onChange={(e) => setNewTemplateBody(e.target.value)}
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={async () => {
                              const id = (newTemplateId || '').trim();
                              if (!id) {
                                showAdminAlert('emailTemplates.templateIdRequired');
                                return;
                              }
                              try {
                                await apiPost(`/admin/email-templates/${id}`, { subject: newTemplateSubject, body: newTemplateBody }, { auth: true });
                                const resp = await apiGet<any>('/admin/email-templates', { auth: true });
                                setTemplates(resp.items || []);
                                setNewTemplateId('');
                                setNewTemplateSubject('');
                                setNewTemplateBody('');
                                showAdminAlert('alerts.createSuccess');
                              } catch (err) {
                                console.error(err);
                                showAdminAlert('alerts.createFailed');
                              }
                            }}

                            className="px-3 py-1 bg-emerald-600 text-white rounded text-sm"
                          >
                            {tAdmin('emailTemplates.createButton')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}
              {adminTab === 'storage' && (
                <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Storage Management</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Manage build artifacts and reclaim disk space.</p>
                      </div>
                      <button
                        onClick={loadStorageStats}
                        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <RefreshCw className={`h-4 w-4 ${storageLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    <div className="p-6">
                      {storageError && (
                        <div className="mb-6 rounded-lg border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-900/20 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {storageError}
                        </div>
                      )}

                      {storageLoading && !storageStats && (
                        <div className="py-12 flex justify-center text-slate-500">
                          <RefreshCw className="h-6 w-6 animate-spin" />
                        </div>
                      )}

                      {storageStats && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                          <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-slate-200 dark:border-zinc-700">
                            <label className="text-xs text-slate-500 uppercase font-semibold">Total Builds</label>
                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{storageStats.totalBuilds}</div>
                          </div>
                          <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-4 border border-emerald-100 dark:border-emerald-900/30">
                            <label className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Active Builds</label>
                            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{storageStats.activeBuilds}</div>
                          </div>
                          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg p-4 border border-amber-100 dark:border-amber-900/30">
                            <label className="text-xs text-amber-600 dark:text-amber-400 uppercase font-semibold">Orphaned Builds</label>
                            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{storageStats.orphanedBuilds}</div>
                          </div>
                          <div className="bg-rose-50 dark:bg-rose-900/10 rounded-lg p-4 border border-rose-100 dark:border-rose-900/30">
                            <label className="text-xs text-rose-600 dark:text-rose-400 uppercase font-semibold">Reclaimable Space</label>
                            <div className="text-2xl font-bold text-rose-700 dark:text-rose-400">
                              {(storageStats.reclaimableBytes / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                        </div>
                      )}

                      {storageStats && storageStats.orphanedBuilds > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4 flex items-start justify-between gap-4">
                          <div className="text-sm text-amber-800 dark:text-amber-200">
                            <p className="font-semibold mb-1">Ready to Cleanup?</p>
                            <p>Found <strong>{storageStats.orphanedBuilds}</strong> orphaned builds older than 7 days. Pruning will delete these folders permanently.</p>
                          </div>
                          <button
                            onClick={handlePruneStorage}
                            disabled={storageLoading}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap"
                          >
                            <Trash2 className="h-4 w-4" />
                            Prune Builds
                          </button>
                        </div>
                      )}

                      {storageStats && storageStats.orphanedBuilds === 0 && (
                        <div className="text-center py-8 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-zinc-800/20 rounded-lg border border-slate-200 dark:border-zinc-800 border-dashed">
                          <Check className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                          <p>Storage is optimized. No orphaned builds found.</p>
                        </div>
                      )}

                      {storageStats?.details && (
                        <div className="mt-8">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Build Details</h3>
                          <div className="rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                              <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-500 dark:text-slate-400 font-medium">
                                <tr>
                                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                                  <th className="px-4 py-3 whitespace-nowrap">App</th>
                                  <th className="px-4 py-3 whitespace-nowrap">Build ID</th>
                                  <th className="px-4 py-3 whitespace-nowrap">Size</th>
                                  <th className="px-4 py-3 whitespace-nowrap">Last Modified</th>
                                  <th className="px-4 py-3 whitespace-nowrap">Note</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
                                {storageStats.details.map((detail: any) => (
                                  <tr key={detail.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase
                                        ${detail.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                          detail.status === 'orphaned' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' :
                                            'bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-slate-400'
                                        }`}>
                                        {detail.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      {detail.appName ? (
                                        <div className="flex flex-col">
                                          <span className="font-medium text-slate-900 dark:text-slate-100">{detail.appName}</span>
                                          <span className="text-xs text-slate-500 font-mono">{detail.appId}</span>
                                        </div>
                                      ) : (
                                        <span className="text-slate-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                      {detail.id}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono">
                                      {(detail.size / 1024 / 1024).toFixed(2)} MB
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                      {new Date(detail.mtime).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 italic">
                                      {detail.orphanedReason || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </section>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={closeDetails} />
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col animate-in fade-in zoom-in-95 duration-200">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 z-10">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {currentItem?.title || 'App Details'}
              </h2>
              <button
                onClick={closeDetails}
                className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full text-slate-500 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="aspect-video bg-slate-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 flex items-center justify-center relative group">
                    {previewSrc ? (
                      <Image src={previewSrc} alt="Preview" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="text-slate-400 flex flex-col items-center gap-2">
                        <div className="h-12 w-12 bg-slate-200 dark:bg-zinc-700 rounded-lg" />
                        <span className="text-xs font-medium">No Preview</span>
                      </div>
                    )}
                  </div>

                  {currentItem && (
                    <div className="bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-4 border border-slate-200 dark:border-zinc-700 text-sm">
                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Description</label>
                        <p className="mt-1 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{currentItem.description || '-'}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">App ID</label>
                          <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300 break-all">{currentItem.appId}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Version</label>
                          <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">{currentItem.version ?? '-'}</p>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Owner</label>
                        <p className="mt-1 text-slate-700 dark:text-slate-300 break-all">{currentItem.ownerEmail}</p>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Author</label>
                        <p className="mt-1 text-slate-700 dark:text-slate-300">{currentItem.author?.name || currentItem.author?.handle || '-'}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Visibility</label>
                          <p className="mt-1 text-slate-700 dark:text-slate-300 capitalize">{currentItem.visibility}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Access</label>
                          <p className="mt-1 text-slate-700 dark:text-slate-300 capitalize">{currentItem.accessMode}</p>
                        </div>
                      </div>

                      {currentItem.playUrl && (
                        <div className="pt-2">
                          <a
                            href={currentItem.playUrl}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                          >
                            Open App <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 space-y-6">
                  {currentBuildId && (
                    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
                        <Settings className="h-4 w-4" />
                        Build Artifacts
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => downloadCode()} className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-md text-sm font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                          <Download className="h-4 w-4" />
                          Download Bundle
                        </button>
                        {buildPreviewLink && (
                          <a href={buildPreviewLink} target="_blank" className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                            <ExternalLink className="h-4 w-4" />
                            Preview (build)
                          </a>
                        )}
                        {bundlePreviewLink && (
                          <a href={bundlePreviewLink} target="_blank" className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                            <ExternalLink className="h-4 w-4" />
                            Bundle HTML
                          </a>
                        )}
                        {manifestLink && (
                          <a href={manifestLink} target="_blank" className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                            <FileText className="h-4 w-4" />
                            Manifest
                          </a>
                        )}
                      </div>
                      {!zipReady && (
                        <p className="text-xs text-slate-500 mt-2">
                          Bundle is preparing...
                        </p>
                      )}
                    </div>
                  )}

                  {timeline.length > 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 p-4">
                      <h3 className="font-medium mb-3 text-slate-900 dark:text-slate-100">Build Timeline</h3>
                      <BuildTimeline buildId={currentBuildId!} />
                    </div>
                  )}

                  {report && (
                    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 p-4">
                      <h3 className="font-medium mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
                        <Shield className="h-4 w-4" />
                        AI Review Report
                      </h3>

                      {report.status === 'generating' && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Generating report...
                        </div>
                      )}

                      {report.status === 'complete' && report.data && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${report.data.publishRecommendation === 'approve' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              report.data.publishRecommendation === 'reject' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' :
                                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}>
                              {report.data.publishRecommendation}
                            </span>
                            <span className="text-sm text-slate-500">Confidence: {Math.round((report.data.confidence || 0) * 100)}%</span>
                          </div>

                          <p className="text-sm text-slate-700 dark:text-slate-300">{report.data.summary}</p>

                          {report.data.risks && report.data.risks.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-xs font-medium text-slate-500 uppercase">Risks</h4>
                              <div className="flex flex-wrap gap-2">
                                {report.data.risks.map((r, i) => (
                                  <span key={i} className="px-2 py-1 bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 rounded text-xs border border-rose-100 dark:border-rose-900/30">
                                    {r.title}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            className="text-xs text-emerald-600 hover:underline"
                            onClick={() => setShowRaw((s) => !s)}
                          >
                            {showRaw ? 'Hide Raw JSON' : 'Show Raw JSON'}
                          </button>
                          {showRaw && (
                            <pre className="text-xs bg-slate-50 dark:bg-zinc-800 p-2 rounded overflow-x-auto border border-slate-200 dark:border-zinc-700">
                              {JSON.stringify(report, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingAdminRemoval && (
        <ConfirmDialog
          open
          title={tAdmin('adminSettings.remove')}
          message={tAdmin('adminSettings.removeConfirm', { email: pendingAdminRemoval })}
          confirmLabel={tAdmin('adminSettings.remove')}
          cancelLabel={tAdmin('buttons.close')}
          confirmTone="danger"
          onConfirm={() => {
            const email = pendingAdminRemoval;
            setPendingAdminRemoval(null);
            if (email) {
              void handleRemoveAdminEmail(email);
            }
          }}
          onClose={() => setPendingAdminRemoval(null)}
        />
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
                className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
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
    </div>
  );
}
