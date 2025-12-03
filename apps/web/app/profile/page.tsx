'use client';

import { useT } from '@/lib/i18n-provider';
import { useAuth, getDisplayName } from '@/lib/auth';
import { PUBLIC_API_URL } from '@/lib/config';
import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Avatar from '@/components/Avatar';
import { useLoginHref } from '@/hooks/useLoginHref';
// Using global header from layout; no local header
import { type Listing } from '@/components/AppCard';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  listEntitlements,
  EntitlementsList,
  type EntitlementDisplay,
} from '@/lib/entitlements';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  useConnectStatus,
  startStripeOnboarding,
  openStripeDashboard,
} from '@/hooks/useConnectStatus';
import AmbassadorSection from '@/components/AmbassadorSection';
import { playHref, appDetailsHref } from '@/lib/urls';
import {
  User,
  Settings,
  Globe,
  Camera,
  CreditCard,
  Star,
  BarChart3,
  HardDrive,
  History,
  Receipt,
  LayoutGrid,
  AppWindow,
  Edit3,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface ProfileData {
  items: Listing[];
  stats: { likes: number; plays: number; apps: number };
}

interface SubscriptionInfo {
  id?: string;
  status: 'active' | 'trial' | 'expired' | 'loading' | 'processing';
  renewalDate?: string;
}

interface UsageInfo {
  plan: string;
  apps: { used: number; limit: number; remaining: number };
  storage: { used: number; limit: number; remaining: number };
}

interface BillingEvent {
  eventType: string;
  amount?: number;
  ts: number;
}

function renderBillingEvent(ev: BillingEvent): string {
  try {
    const amount = typeof ev.amount === 'number' ? `$${(ev.amount / 100).toFixed(2)}` : '';
    const date = new Date(ev.ts).toLocaleDateString();
    const data: any = (ev as any).data || {};
    if (data.appTitle || data.appId) {
      return `${date} – App subscription: ${data.appTitle || data.appId} ${amount}`;
    }
    if (data.creatorName || data.creatorId) {
      return `${date} – Creator all-access: ${data.creatorName || data.creatorId} ${amount}`;
    }
    if (data.plan === 'gold') {
      return `${date} – Gold plan ${amount}`;
    }
    return `${date} – ${ev.eventType}${amount ? ` (${amount})` : ''}`;
  } catch {
    return `${new Date(ev.ts).toLocaleDateString()} – ${ev.eventType}`;
  }
}

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

export default function ProfilePage() {
  const t = useT('Profile');
  const { user, loading } = useAuth();
  const loginHref = useLoginHref();
  const [data, setData] = useState<ProfileData | null>(null);
  const [busy, setBusy] = useState(false);
  const [userInfo, setUserInfo] = useState<any | null>(null);
  const [subscription, setSubscription] =
    useState<SubscriptionInfo>({ status: 'loading' });
  const [activeSubs, setActiveSubs] = useState<{
    id: string;
    feature: EntitlementDisplay['feature'];
    label: string;
    // For creator all-access
    creatorUid?: string;
    creatorHandle?: string;
    creatorName?: string;
    creatorAppCount?: number;
    // For app-subscription
    appId?: number;
  }[]>([]);
  const [entitlementsError, setEntitlementsError] = useState(false);
  const [entitlementsAttempts, setEntitlementsAttempts] = useState(0);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [billingHistory, setBillingHistory] = useState<BillingEvent[]>([]);
  const [resolvingTitles, setResolvingTitles] = useState(false);
  const [resolvedTitleIds, setResolvedTitleIds] = useState<Set<string>>(new Set());
  const [autoCanceledIds, setAutoCanceledIds] = useState<Set<string>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState<{ id: string; label?: string } | null>(null);
  const [resolvedCreators, setResolvedCreators] = useState<Set<string>>(new Set());
  const [resolvedCreatorNames, setResolvedCreatorNames] = useState<Set<string>>(new Set());
  const {
    data: entitlementsData,
    loading: entitlementsLoading,
  } = useEntitlements();
  const connect = useConnectStatus();
  const canMonetize =
    connect?.payouts_enabled && (connect.requirements_due ?? 0) === 0;
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    phone: '',
    bio: '',
    website: '',
    twitter: '',
    github: '',
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<'cancel' | null>(null);
  const [publicProfile, setPublicProfile] = useState({ displayName: '', photoURL: '' });
  const [publicPhotoFile, setPublicPhotoFile] = useState<File | null>(null);
  const [publicPhotoPreview, setPublicPhotoPreview] = useState('');
  const [publicSaving, setPublicSaving] = useState(false);
  const [publicStatus, setPublicStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [repositoryName, setRepositoryName] = useState('');
  const [initialRepositoryName, setInitialRepositoryName] = useState('');
  const [lastChangeTimestamp, setLastChangeTimestamp] = useState<number | null>(null);
  // Compute stable values before any early returns to keep hooks order consistent
  const handle = userInfo?.username || '';
  const joined = useMemo(() => {
    try {
      const t = (user as any)?.metadata?.creationTime;
      return t ? new Date(t).toLocaleDateString() : '';
    } catch {
      return '';
    }
  }, [user]);

  const entitlementItems: EntitlementDisplay[] = useMemo(
    () => [
      {
        feature: 'isGold',
        owned: entitlementsData?.gold ?? false,
        upgradeHref: '/pro/checkout/gold',
      },
      {
        feature: 'noAds',
        owned: entitlementsData?.noAds ?? false,
        upgradeHref: '/pro/checkout/noads',
      },
    ],
    [entitlementsData],
  );

  const loadSubscription = useCallback(
    async (subId: string) => {
      try {
        const res = await fetch(
          `${PUBLIC_API_URL}/billing/subscription-status?sub_id=${subId}`,
          {
            headers: await buildHeaders(false),
            credentials: 'include',
          },
        );
        if (res.ok) {
          const json = await res.json();
          if (json.exists) {
            const status: SubscriptionInfo['status'] =
              json.status === 'active'
                ? 'active'
                : json.status === 'trialing'
                  ? 'trial'
                  : 'expired';
            const renewal = json.currentPeriodEnd
              ? new Date(json.currentPeriodEnd).toLocaleDateString()
              : undefined;
            setSubscription({ id: subId, status, renewalDate: renewal });
          } else {
            setSubscription({ id: subId, status: 'processing' });
          }
        } else {
          setSubscription({ id: subId, status: 'processing' });
        }
      } catch (err) {
        console.error('Failed to load subscription', err);
        setSubscription({ id: subId, status: 'processing' });
      }
    },
    [],
  );

  const loadEntitlements = useCallback(async () => {
    if (!user) return;
    try {
      const ents = await listEntitlements(user.uid);
      const subEnts = ents.filter((e) => e.data?.stripeSubscriptionId);
      const mapped = subEnts.map((e) => {
        const d: any = e.data || {};
        let label: string;
        if (e.feature === 'isGold') label = 'Gold plan';
        else if (e.feature === 'noAds') label = 'No ads';
        else if (e.feature === 'creator-all-access') label = d.creatorName ? `${d.creatorName}` : 'Creator all‑access';
        else if (e.feature === 'app-subscription') label = d.appTitle ? d.appTitle : (d.appId ? `Pretplata na aplikaciju #${d.appId}` : 'Pretplata na aplikaciju');
        else label = String(e.feature);
        return {
          id: String(d.stripeSubscriptionId || e.id),
          feature: e.feature,
          label,
          creatorUid: d.creatorId || d.creatorUid || undefined,
          creatorHandle: d.creatorHandle || undefined,
          creatorName: d.creatorName || undefined,
          appId: typeof d.appId === 'number' ? d.appId : (typeof d.appId === 'string' && /^\d+$/.test(d.appId) ? Number(d.appId) : undefined),
        };
      });
      // De‑duplicate: keep one per feature, except keep per‑creator for creator‑all‑access, and per‑app for app‑subscription
      const seen = new Set<string>();
      const deduped: { id: string; feature: EntitlementDisplay['feature']; label: string; creatorUid?: string; creatorHandle?: string; creatorName?: string; appId?: number }[] = [];
      for (const item of mapped) {
        const key = item.feature === 'app-subscription'
          ? `${item.feature}:${item.id}`
          : item.feature === 'creator-all-access'
            ? `${item.feature}:${item.creatorUid || item.id}`
            : String(item.feature);
        if (seen.has(key as string)) continue;
        seen.add(key as string);
        deduped.push(item);
      }
      setActiveSubs(deduped);
      if (subEnts[0]?.data?.stripeSubscriptionId) {
        const subId = subEnts[0].data!.stripeSubscriptionId as string;
        setSubscription({ id: subId, status: 'loading' });
        await loadSubscription(subId);
      } else {
        setSubscription({ status: 'expired' });
      }
      setEntitlementsError(false);
      setEntitlementsAttempts(0);
    } catch (err) {
      console.error('Failed to load entitlements', err);
      setSubscription({ status: 'processing' });
      setEntitlementsError(true);
      setEntitlementsAttempts((n) => n + 1);
    }
  }, [user, loadSubscription]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${PUBLIC_API_URL}/listings?owner=${encodeURIComponent(user.uid)}`,
        {
          cache: 'no-store',
          credentials: 'include',
          headers: await buildHeaders(false),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const items: Listing[] = json.items ?? [];
        const stats = {
          likes: items.reduce((s, it) => s + (it.likesCount ?? 0), 0),
          plays: items.reduce(
            (s, it) => s + ((it as any).playCount ?? it.playsCount ?? 0),
            0,
          ),
          apps: items.length,
        };
        setData({ items, stats });
      } else {
        setData({ items: [], stats: { likes: 0, plays: 0, apps: 0 } });
      }
      if (!db) return;
      const userDocRef = doc(db, 'users', user.uid);
      const creatorDocRef = doc(db, 'creators', user.uid);
      const [userSnap, creatorSnap] = await Promise.all([getDoc(userDocRef), getDoc(creatorDocRef)]);
      let fallbackPublicName =
        getDisplayName(user) ||
        user.displayName ||
        user.email ||
        '';
      let fallbackPublicPhoto = user.photoURL || '';
      let fallbackHandle = '';
      if (userSnap.exists()) {
        const d = userSnap.data() as any;
        setUserInfo(d);
        setForm({
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          username: d.username || '',
          phone: d.phone || '',
          bio: d.bio || '',
          website: d.website || '',
          twitter: d.twitter || '',
          github: d.github || '',
        });
        const docDisplayName =
          typeof d.displayName === 'string' ? d.displayName.trim() : '';
        const docFullName = [d.firstName, d.lastName]
          .map((part: any) => (typeof part === 'string' ? part.trim() : ''))
          .filter(Boolean)
          .join(' ')
          .trim();
        const docUsername = typeof d.username === 'string' ? d.username.trim() : '';
        const bestName = docDisplayName || docFullName || docUsername;
        if (bestName) fallbackPublicName = bestName;
        if (docUsername) fallbackHandle = docUsername;
        if (typeof d.photoURL === 'string' && d.photoURL.trim()) {
          fallbackPublicPhoto = d.photoURL.trim();
        }
      }
      if (creatorSnap.exists()) {
        const c = creatorSnap.data() as any;
        const creatorDisplay =
          typeof c.displayName === 'string' && c.displayName.trim()
            ? c.displayName.trim()
            : '';
        const photoCandidates = [
          typeof c.photoURL === 'string' ? c.photoURL.trim() : '',
          typeof c.photo === 'string' ? c.photo.trim() : '',
          typeof c.avatarUrl === 'string' ? c.avatarUrl.trim() : '',
        ].filter(Boolean);
        setPublicProfile({
          displayName: creatorDisplay || fallbackPublicName || '',
          photoURL: photoCandidates[0] || fallbackPublicPhoto || '',
        });
        const creatorRepositoryName =
          typeof c.customRepositoryName === 'string' && c.customRepositoryName.trim()
            ? c.customRepositoryName.trim()
            : typeof c.handle === 'string' && c.handle.trim()
              ? c.handle.trim()
              : '';
        const resolvedRepositoryName = creatorRepositoryName || fallbackHandle;
        setRepositoryName(resolvedRepositoryName);
        setInitialRepositoryName(resolvedRepositoryName);
        setLastChangeTimestamp(
          typeof c.lastRepositoryNameChangeTimestamp === 'number'
            ? c.lastRepositoryNameChangeTimestamp
            : null,
        );
      } else {
        setPublicProfile({
          displayName: fallbackPublicName || '',
          photoURL: fallbackPublicPhoto || '',
        });
        setRepositoryName(fallbackHandle);
        setInitialRepositoryName(fallbackHandle);
        setLastChangeTimestamp(null);
      }
      await loadEntitlements();
    } catch (e) {
      console.error('Failed to load profile', e);
    } finally {
      setBusy(false);
    }
  }, [user, loadEntitlements]);

  const loadUsage = useCallback(async () => {
    if (!user) return;
    setUsageBusy(true);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/me/usage`, {
        cache: 'no-store',
        credentials: 'include',
        headers: await buildHeaders(false),
      });
      if (res.ok) {
        setUsage(await res.json());
      }
    } catch (err) {
      console.error('Failed to load usage', err);
    } finally {
      setUsageBusy(false);
    }
  }, [user]);

  const loadBillingHistory = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${PUBLIC_API_URL}/billing/history`, {
        cache: 'no-store',
        credentials: 'include',
        headers: await buildHeaders(false),
      });
      if (res.ok) {
        setBillingHistory(await res.json());
      }
    } catch (err) {
      console.error('Failed to load billing history', err);
    }
  }, [user]);

  // Cancel subscription helper (memoized) — declared before effects that reference it

  const cancelSubscription = useCallback(
    async (id?: string, opts?: { silent?: boolean }) => {
      const subId = id ?? subscription.id;
      if (!user || !subId) return;
      try {
        const res = await fetch(`${PUBLIC_API_URL}/billing/subscriptions/cancel`, {
          method: 'POST',
          headers: await buildHeaders(true),
          credentials: 'include',
          body: JSON.stringify({ subscriptionId: subId }),
        });
        if (res.status === 200) {
          setErrorMessage('');
          if (opts?.silent) {
            setActiveSubs((arr) => arr.filter((x) => x.id !== subId));
          } else {
            await loadProfile();
          }
        } else {
          setErrorMessage('Cancel failed');
        }
      } catch (err) {
        console.error('Cancel failed', err);
        setErrorMessage('Cancel failed');
      }
    },
    [user, subscription?.id, loadProfile],
  );

  // Try to resolve app titles for app-subscription entries missing a friendly label
  useEffect(() => {
    (async () => {
      if (!activeSubs.length || resolvingTitles) return;
      const needs = activeSubs.filter(
        (s) =>
          s.feature === 'app-subscription' &&
          /#\d+$/.test(s.label) &&
          !resolvedTitleIds.has(s.id) &&
          !autoCanceledIds.has(s.id),
      );
      if (!needs.length) return;
      setResolvingTitles(true);
      try {
        const updated: Record<string, string> = {};
        const autoCancel: string[] = [];
        for (const s of needs) {
          const m = s.label.match(/#(\d+)$/);
          const id = m ? m[1] : undefined;
          if (!id) continue;
          try {
            let ok = false;
            let title: string | undefined;
            let res = await fetch(`${PUBLIC_API_URL}/listing/${encodeURIComponent(id)}`);
            if (res.ok) {
              const j = await res.json();
              title = j?.item?.title as string | undefined;
              ok = !!title;
            } else if ((res as any)?.status === 404) {
              autoCancel.push(s.id);
            }
            if (!ok) {
              res = await fetch(`${PUBLIC_API_URL}/app/${encodeURIComponent(id)}`);
              if (res.ok) {
                const j2 = await res.json();
                title = (j2?.title || j2?.item?.title) as string | undefined;
                ok = !!title;
              } else if ((res as any)?.status === 404) {
                if (!autoCancel.includes(s.id)) autoCancel.push(s.id);
              }
            }
            if (ok && title) updated[s.id] = title;
          } catch { }
        }
        if (Object.keys(updated).length) {
          setActiveSubs((arr) => arr.map((x) => (updated[x.id] ? { ...x, label: updated[x.id] } : x)));
          setResolvedTitleIds((prev) => {
            const next = new Set(prev);
            for (const id of Object.keys(updated)) next.add(id);
            return next;
          });
        }
        for (const subId of autoCancel) {
          try {
            await cancelSubscription(subId, { silent: true });
            setAutoCanceledIds((prev) => new Set(prev).add(subId));
            setErrorMessage('Pretplata je automatski otkazana jer je aplikacija obrisana.');
          } catch { }
        }
      } finally {
        setResolvingTitles(false);
      }
    })();
  }, [activeSubs, resolvingTitles, resolvedTitleIds, autoCanceledIds, cancelSubscription]);

  // Enrich creator-all-access with app count for each creator
  useEffect(() => {
    (async () => {
      const pending = activeSubs.filter(
        (s) =>
          s.feature === 'creator-all-access' &&
          !!s.creatorUid &&
          !resolvedCreators.has(s.creatorUid!),
      );
      if (!pending.length) return;
      const byCreator = Array.from(new Set(pending.map((p) => p.creatorUid!)));
      const counts: Record<string, number> = {};
      for (const uid of byCreator) {
        try {
          const res = await fetch(`${PUBLIC_API_URL}/listings?owner=${encodeURIComponent(uid)}`, { cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            counts[uid] = Array.isArray(j?.items) ? j.items.length : 0;
          } else {
            counts[uid] = 0;
          }
        } catch {
          counts[uid] = 0;
        }
      }
      setActiveSubs((arr) =>
        arr.map((x) => {
          if (x.feature === 'creator-all-access' && x.creatorUid && counts[x.creatorUid] != null) {
            const n = counts[x.creatorUid];
            return { ...x, creatorAppCount: n };
          }
          return x;
        }),
      );
      setResolvedCreators((prev) => {
        const next = new Set(prev);
        for (const uid of byCreator) next.add(uid);
        return next;
      });
    })();
  }, [activeSubs, resolvedCreators]);

  // Ensure creator name and handle are present on creator-all-access entries
  useEffect(() => {
    (async () => {
      const missingName = activeSubs.filter(
        (s) =>
          s.feature === 'creator-all-access' &&
          !!s.creatorUid &&
          (!s.creatorName || !s.creatorHandle) &&
          !resolvedCreatorNames.has(s.creatorUid!),
      );
      if (!missingName.length) return;
      const byCreator = Array.from(new Set(missingName.map((p) => p.creatorUid!)));
      const names: Record<string, { name?: string; handle?: string }> = {};
      for (const uid of byCreator) {
        try {
          const res = await fetch(`${PUBLIC_API_URL}/creators/id/${encodeURIComponent(uid)}`, { cache: 'no-store' });
          if (res.ok) {
            const j = await res.json();
            names[uid] = { name: j?.displayName || j?.name || j?.handle || undefined, handle: j?.handle };
          }
        } catch { }
      }
      setActiveSubs((arr) =>
        arr.map((x) => {
          if (x.feature === 'creator-all-access' && x.creatorUid && names[x.creatorUid]) {
            const baseName = names[x.creatorUid].name || x.creatorName || x.label;
            return { ...x, creatorName: baseName, creatorHandle: names[x.creatorUid].handle || x.creatorHandle };
          }
          return x;
        }),
      );
      setResolvedCreatorNames((prev) => {
        const next = new Set(prev);
        for (const uid of byCreator) next.add(uid);
        return next;
      });
    })();
  }, [activeSubs, resolvedCreatorNames]);

  useEffect(() => {
    return () => {
      if (publicPhotoPreview) {
        URL.revokeObjectURL(publicPhotoPreview);
      }
    };
  }, [publicPhotoPreview]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadUsage();
    const t = setInterval(loadUsage, 60000);
    return () => clearInterval(t);
  }, [loadUsage]);

  useEffect(() => {
    loadBillingHistory();
  }, [loadBillingHistory]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handlePublicNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPublicProfile((prev) => ({ ...prev, displayName: e.target.value }));
    setPublicStatus(null);
  };

  const handlePublicPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPublicPhotoFile(file);
    setPublicStatus(null);
    setPublicPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  const handlePublicProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !db) return;
    const displayName = publicProfile.displayName.trim();
    if (!displayName) {
      setPublicStatus({ type: 'error', text: 'Unesi ime za javni profil.' });
      return;
    }
    setPublicSaving(true);
    setPublicStatus(null);
    try {
      let photoURL = publicProfile.photoURL;
      if (publicPhotoFile && storage) {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        await uploadBytes(storageRef, publicPhotoFile);
        photoURL = await getDownloadURL(storageRef);
        setPublicPhotoFile(null);
        setPublicPhotoPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return '';
        });
      }
      const handleValue = (form.username || userInfo?.username || '').trim();
      const payload: Record<string, any> = {
        id: user.uid,
        displayName,
        photoURL: photoURL || null,
        updatedAt: Date.now(),
      };
      if (handleValue) payload.handle = handleValue;

      // Repository Name Logic
      const repositoryNameTrimmed = repositoryName.trim();
      const initialRepositoryNameTrimmed = initialRepositoryName.trim();
      const repoChanged = repositoryNameTrimmed !== initialRepositoryNameTrimmed;
      if (repositoryNameTrimmed && repoChanged) {
        if (!/^[a-zA-Z0-9_-]+$/.test(repositoryNameTrimmed)) {
          setPublicStatus({ type: 'error', text: 'Ime repozitorija može sadržavati samo slova, brojeve, crtice i donje crte.' });
          setPublicSaving(false);
          return;
        }
        const now = Date.now();
        const THREE_MONTHS = 90 * 24 * 60 * 60 * 1000;
        if (lastChangeTimestamp && (now - lastChangeTimestamp < THREE_MONTHS)) {
          setPublicStatus({ type: 'error', text: 'Ime repozitorija možete mijenjati jednom u 3 mjeseca.' });
          setPublicSaving(false);
          return;
        }
        // Check uniqueness
        const q = query(collection(db, 'creators'), where('customRepositoryName', '==', repositoryNameTrimmed));
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0].id !== user.uid) {
          setPublicStatus({ type: 'error', text: 'Ovo ime repozitorija je već zauzeto.' });
          setPublicSaving(false);
          return;
        }
        payload.customRepositoryName = repositoryNameTrimmed;
        payload.lastRepositoryNameChangeTimestamp = now;
      }

      await setDoc(doc(db, 'creators', user.uid), payload, { merge: true });
      const updatedPhoto = photoURL || publicProfile.photoURL || '';
      setPublicProfile((prev) => ({
        ...prev,
        displayName,
        photoURL: updatedPhoto || prev.photoURL,
      }));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('creator-profile-updated', {
            detail: { displayName, photoURL: updatedPhoto || null },
          }),
        );
      }
      if (payload.customRepositoryName) {
        setInitialRepositoryName(payload.customRepositoryName);
        setLastChangeTimestamp(payload.lastRepositoryNameChangeTimestamp || lastChangeTimestamp);
      }
      setPublicStatus({ type: 'success', text: 'Javni profil je spremljen.' });
    } catch (err) {
      console.error('Failed to save public profile', err);
      setPublicStatus({ type: 'error', text: 'Spremanje nije uspjelo. Pokušaj ponovno.' });
    } finally {
      setPublicSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      if (!db) return;
      await updateDoc(doc(db, 'users', user.uid), {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        phone: form.phone || null,
        bio: form.bio || null,
        website: form.website || null,
        twitter: form.twitter || null,
        github: form.github || null,
      });
      await updateProfile(user, {
        displayName: `${form.firstName} ${form.lastName}`.trim(),
      });
      setUserInfo((prev: any) => ({ ...(prev ?? {}), ...form }));
    } finally {
      setSaving(false);
    }
  };

  async function manageBilling() {
    try {
      const res = await fetch(`${PUBLIC_API_URL}/billing/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('bad_response');
      const session = await res.json();
      if (session?.url) {
        window.location.href = session.url as string;
        return;
      }
      setErrorMessage('Neispravan odgovor poslužitelja');
    } catch (err) {
      console.error('Manage billing failed', err);
      setErrorMessage('Greška pri komunikaciji s API-jem');
    }
  }



  if (loading || busy) {
    return (
      <main className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-600">Sign in to view profile</p>
        <Link href={loginHref} className={buttonVariants({})}>
          Sign In
        </Link>
      </main>
    );
  }

  const apps = data?.items ?? [];
  const stats = data?.stats ?? { likes: 0, plays: 0, apps: 0 };
  const publicDisplayName = (publicProfile.displayName || '').trim();
  const personalFullName =
    [userInfo?.firstName, userInfo?.lastName]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim() || '';
  const name =
    publicDisplayName ||
    personalFullName ||
    getDisplayName(user) ||
    userInfo?.username ||
    'User';
  const publicAvatarSrc =
    publicPhotoPreview || publicProfile.photoURL || user.photoURL || undefined;
  const publicProfileHref = handle ? `/u/${handle}` : '';
  const subscriptionStatusLabels: Record<SubscriptionInfo['status'], string> = {
    active: 'Aktivna',
    trial: 'Probna',
    expired: 'Istekla',
    loading: 'Učitavanje',
    processing: 'Obrada',
  };
  const subscriptionStatusTones: Record<SubscriptionInfo['status'], string> = {
    active: 'bg-emerald-100 text-emerald-700',
    trial: 'bg-yellow-100 text-yellow-800',
    expired: 'bg-red-100 text-red-700',
    loading: 'bg-gray-100 text-gray-600',
    processing: 'bg-gray-100 text-gray-600',
  };
  const subscriptionStatusLabel = subscriptionStatusLabels[subscription.status] ?? 'Status';
  const subscriptionStatusClass =
    subscriptionStatusTones[subscription.status] ?? 'bg-gray-100 text-gray-600';
  const featureDescriptions: Record<string, string> = {
    isGold: 'Gold paket',
    noAds: 'Bez oglasa',
    'creator-all-access': 'All-access kreator',
    'app-subscription': 'Pretplata na aplikaciju',
  };
  const ownedFeatureBadges = [
    entitlementsData?.gold ? { key: 'gold', label: 'Gold plan' } : null,
    entitlementsData?.noAds ? { key: 'noAds', label: 'Bez oglasa' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;
  const hasActiveStripeSubs = activeSubs.length > 0;
  const hasOwnedFeatures = ownedFeatureBadges.length > 0;
  const hasAnySubscription = hasActiveStripeSubs || hasOwnedFeatures;
  return (
    <>
      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
        {/* Header Section */}
        <div className="relative rounded-3xl overflow-hidden bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="h-32 bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-900 dark:to-teal-900 relative">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
          </div>
          <div className="px-6 pb-6 md:px-8 md:pb-8">
            <div className="relative -mt-12 flex flex-col md:flex-row gap-6 items-start md:items-end">
              <div className="relative rounded-full p-1.5 bg-white dark:bg-zinc-900">
                <Avatar uid={user.uid} src={user.photoURL ?? undefined} name={name} size={96} className="rounded-full" />
              </div>
              <div className="flex-1 pt-2 md:pt-0">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
                  {name}
                  {connect && (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${canMonetize
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                        }`}
                    >
                      {canMonetize ? 'Payouts Active' : 'Onboarding Required'}
                    </span>
                  )}
                </h1>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {user.email}
                  </span>
                  {handle && <span className="hidden md:inline">·</span>}
                  {handle && <span>@{handle}</span>}
                  {joined && <span className="hidden md:inline">·</span>}
                  {joined && <span>{t('header.joined', { date: joined })}</span>}
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                {handle && (
                  <Link
                    href={`/u/${handle}`}
                    className={buttonVariants({ variant: 'outline', className: 'flex-1 md:flex-none gap-2' })}
                  >
                    <Globe className="h-4 w-4" />
                    {t('header.publicProfile')}
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-100 dark:border-zinc-800 pt-6">
              <div className="text-center md:text-left">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.apps}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('stats.apps')}</div>
              </div>
              <div className="text-center md:text-left">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.likes}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('stats.likes')}</div>
              </div>
              <div className="text-center md:text-left">
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.plays}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('stats.plays')}</div>
              </div>
            </div>
          </div>
        </div>

        {connect && !canMonetize && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg text-blue-600 dark:text-blue-400">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">{t('payouts.setupTitle')}</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {t('payouts.setupDescription')}
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => startStripeOnboarding(user!.uid, handle)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {t('payouts.setupButton')}
              </button>
              {connect.onboarded && connect.payouts_enabled && (
                <button
                  onClick={() => openStripeDashboard(user!.uid)}
                  className="px-4 py-2 bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  {t('payouts.dashboardButton')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Settings */}
          <div className="lg:col-span-2 space-y-8">

            {/* Public Profile Settings */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2 bg-slate-50/50 dark:bg-zinc-800/50">
                <Globe className="h-5 w-5 text-slate-500" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('publicProfile.title')}</h2>
              </div>

              <div className="p-6 space-y-6">
                {!handle && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <p>{t('publicProfile.noHandle')}</p>
                  </div>
                )}

                <form onSubmit={handlePublicProfileSubmit} className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <div className="relative group">
                      <Avatar
                        uid={user.uid}
                        src={publicAvatarSrc}
                        name={publicProfile.displayName || name}
                        size={80}
                        className="ring-4 ring-slate-50 dark:ring-zinc-800"
                      />
                      <label className="absolute bottom-0 right-0 p-1.5 bg-emerald-600 text-white rounded-full cursor-pointer hover:bg-emerald-700 transition-colors shadow-sm">
                        <Camera className="h-4 w-4" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePublicPhotoChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="flex-1 space-y-4 w-full">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('publicProfile.displayNameLabel')}
                        </label>
                        <Input
                          value={publicProfile.displayName}
                          onChange={handlePublicNameChange}
                          placeholder={t('publicProfile.displayNamePlaceholder')}
                          className="bg-slate-50 dark:bg-zinc-800/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          {t('publicProfile.repoNameLabel')}
                        </label>
                        <Input
                          value={repositoryName}
                          onChange={(e) => setRepositoryName(e.target.value)}
                          placeholder={t('publicProfile.repoNamePlaceholder')}
                          className="bg-slate-50 dark:bg-zinc-800/50"
                        />
                      </div>
                    </div>
                  </div>

                  {publicStatus && (
                    <div className={`flex items-center gap-2 text-sm ${publicStatus.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {publicStatus.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {publicStatus.text}
                    </div>
                  )}

                  <div className="pt-2">
                    <Button type="submit" disabled={publicSaving} className="w-full sm:w-auto gap-2">
                      {publicSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {publicSaving ? t('publicProfile.savingButton') : t('publicProfile.saveButton')}
                    </Button>
                  </div>
                </form>
              </div>
            </section>

            {/* Personal Info Settings */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2 bg-slate-50/50 dark:bg-zinc-800/50">
                <User className="h-5 w-5 text-slate-500" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('personalInfo.title')}</h2>
              </div>

              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.firstName')}</label>
                      <Input
                        name="firstName"
                        value={form.firstName}
                        onChange={handleChange}
                        placeholder={t('personalInfo.firstName')}
                        className="bg-slate-50 dark:bg-zinc-800/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.lastName')}</label>
                      <Input
                        name="lastName"
                        value={form.lastName}
                        onChange={handleChange}
                        placeholder={t('personalInfo.lastName')}
                        className="bg-slate-50 dark:bg-zinc-800/50"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.username')}</label>
                      <Input
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        placeholder={t('personalInfo.username')}
                        className="bg-slate-50 dark:bg-zinc-800/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.phone')}</label>
                      <Input
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        className="bg-slate-50 dark:bg-zinc-800/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.bio')}</label>
                    <Textarea
                      name="bio"
                      value={form.bio}
                      onChange={handleChange}
                      placeholder={t('personalInfo.bioPlaceholder')}
                      className="bg-slate-50 dark:bg-zinc-800/50 min-h-[100px]"
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.website')}</label>
                      <Input name="website" value={form.website} onChange={handleChange} placeholder="https://example.com" className="bg-slate-50 dark:bg-zinc-800/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.twitter')}</label>
                      <Input name="twitter" value={form.twitter} onChange={handleChange} placeholder="@handle" className="bg-slate-50 dark:bg-zinc-800/50" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('personalInfo.github')}</label>
                      <Input name="github" value={form.github} onChange={handleChange} placeholder="username" className="bg-slate-50 dark:bg-zinc-800/50" />
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button type="submit" disabled={saving} className="w-full sm:w-auto gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? t('personalInfo.saving') : t('personalInfo.saveButton')}
                    </Button>
                  </div>
                </form>
              </div>
            </section>

            {/* My Projects */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-emerald-500" />
                  {t('projects.title')}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                    {apps.length}
                  </span>
                </h2>
              </div>

              {apps.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {apps.map((app) => (
                    <div key={app.id} className="group bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 transition-all shadow-sm hover:shadow-md">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {app.title}
                          </h3>
                          {app.description && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                              {app.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <a
                            href={playHref(app.id, { run: 1 })}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                            title="Run App"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          <Link
                            href={appDetailsHref(app.slug)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            title="Manage App"
                          >
                            <Settings className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5" />
                          {app.likesCount ?? 0} Likes
                        </span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3.5 w-3.5" />
                          {(app as any).playCount ?? app.playsCount ?? 0} Plays
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-zinc-800 mb-4 shadow-sm">
                    <AppWindow className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">No projects yet</h3>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">You haven&apos;t published any applications.</p>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Subscription & Usage */}
          <div className="space-y-8">

            {/* Subscription Card */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">Subscription</h2>
                </div>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${subscriptionStatusClass}`}>
                  {subscriptionStatusLabel}
                </span>
              </div>

              <div className="p-6 space-y-6">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {hasAnySubscription
                    ? 'Active benefits associated with your account.'
                    : 'No active subscriptions currently.'}
                </p>

                {subscription.renewalDate && (
                  <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Next billing: {subscription.renewalDate}
                  </div>
                )}

                {ownedFeatureBadges.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {ownedFeatureBadges.map((badge) => (
                      <span
                        key={badge.key}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {badge.label}
                      </span>
                    ))}
                  </div>
                )}

                {hasActiveStripeSubs && (
                  <div className="space-y-3">
                    {activeSubs.map((sub) => {
                      const detail =
                        sub.feature === 'creator-all-access' && sub.creatorHandle
                          ? `Creator @${sub.creatorHandle}`
                          : sub.feature === 'app-subscription' && sub.appId
                            ? `App #${sub.appId}`
                            : featureDescriptions[sub.feature] || 'Subscription';
                      return (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-zinc-700 p-3 bg-slate-50 dark:bg-zinc-800/30"
                        >
                          <div>
                            <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{sub.label}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfirmCancel({ id: sub.id, label: sub.label })}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            title="Cancel Subscription"
                          >
                            <LogOut className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-2">
                  {hasActiveStripeSubs && (
                    <Button type="button" variant="outline" onClick={manageBilling} className="w-full justify-center">
                      Manage Billing
                    </Button>
                  )}
                  {!hasAnySubscription && (
                    <Link
                      href="/pro/checkout/gold"
                      className={buttonVariants({ className: 'w-full justify-center bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 border-0' })}
                    >
                      Upgrade to Gold
                    </Link>
                  )}
                </div>
              </div>
            </section>

            <AmbassadorSection userInfo={userInfo} />

            {/* Usage Card */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">Usage Limits</h2>
                </div>
                <button
                  onClick={loadUsage}
                  disabled={usageBusy}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                >
                  <RefreshCw className={`h-4 w-4 ${usageBusy ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {usage ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                          <AppWindow className="h-4 w-4" /> Apps
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {usage.apps.used} / {usage.apps.limit}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min((usage.apps.used / usage.apps.limit) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                          <HardDrive className="h-4 w-4" /> Storage
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {usage.storage.used}MB / {usage.storage.limit}MB
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min((usage.storage.used / usage.storage.limit) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-500 dark:text-slate-400 text-sm">
                    No usage data available
                  </div>
                )}
              </div>
            </section>

            {/* Billing History */}
            <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">Billing History</h2>
                </div>
                <Link
                  href="/billing/history"
                  className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  View All
                </Link>
              </div>

              <div className="p-6">
                {billingHistory.length ? (
                  <ul className="space-y-4">
                    {billingHistory.slice(0, 5).map((ev, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5 p-1 bg-slate-100 dark:bg-zinc-800 rounded text-slate-500">
                          <History className="h-3 w-3" />
                        </div>
                        <span className="text-slate-600 dark:text-slate-300">{renderBillingEvent(ev)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">No billing history found</p>
                )}
              </div>
            </section>

          </div>
        </div>
      </main>

      <ConfirmDialog
        open={!!confirmCancel}
        title={'Cancel Subscription'}
        message={`Are you sure you want to cancel the subscription${confirmCancel?.label ? ` for "${confirmCancel.label}"` : ''}? It will remain active until the end of the current billing period.`}
        confirmLabel={'Yes, Cancel'}
        cancelLabel="No, Keep it"
        confirmTone={'danger'}
        onConfirm={() => {
          const id = confirmCancel?.id;
          setConfirmCancel(null);
          if (id) cancelSubscription(id);
        }}
        onClose={() => setConfirmCancel(null)}
      />
    </>
  );
}



