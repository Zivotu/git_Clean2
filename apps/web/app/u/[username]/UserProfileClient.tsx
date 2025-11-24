'use client';

import { useT } from '@/lib/i18n-provider';
import { useAuth } from '@/lib/auth';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import AppCard, { Listing } from '@/components/AppCard';
import { PUBLIC_API_URL } from '@/lib/config';
import {
  ArrowLeft,
  Loader2,
  LayoutGrid,
  Share2,
  Edit,
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  MessageCircle,
  Link2,
  SendHorizontal,
} from 'lucide-react';
import { ToastProvider, useToasts } from '@/components/toasts';
import {
  FavoriteCreatorMeta,
  deleteFavorite,
  getLocalFavorite,
  isFavorite,
  persistFavorite,
} from '@/lib/favorites';

export default function UserProfileClient({ username }: { username: string }) {
  return (
    <ToastProvider>
      <ProfileContent username={username} />
    </ToastProvider>
  );
}

function ProfileContent({ username }: { username: string }) {
  const t = useT('UserProfile');
  const { user: currentUser } = useAuth();
  const { addToast } = useToasts();
  const [user, setUser] = useState<any>(null);
  const [userApps, setUserApps] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const [shareUrl, setShareUrl] = useState<string>(() => `/u/${encodeURIComponent(username)}`);

  useEffect(() => {
    const fetchUserAndApps = async () => {
      try {
        // 1. Fetch Creator Profile
        const resProfile = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(username)}`);

        if (!resProfile.ok) {
          console.warn('Creator profile not found via API');
          setLoading(false);
          setLoadingApps(false);
          return;
        }

        const userData = await resProfile.json();
        setUser(userData);
        setLoading(false);

        // 2. Fetch Creator Apps
        const resApps = await fetch(`${PUBLIC_API_URL}/creators/${encodeURIComponent(username)}/apps`);
        if (resApps.ok) {
          const jsonApps = await resApps.json();
          // The API returns { items: [], count: 0 }
          setUserApps(jsonApps.items || []);
        } else {
          console.warn('Failed to fetch apps');
        }

      } catch (err) {
        console.error('Error fetching user or apps:', err);
      } finally {
        setLoading(false);
        setLoadingApps(false);
      }
    };
    fetchUserAndApps();
  }, [username]);

  useEffect(() => {
    const handle = user?.handle || username;
    const slug = encodeURIComponent(handle);
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/u/${slug}`);
    } else {
      setShareUrl(`/u/${slug}`);
    }
  }, [user?.handle, username]);

  useEffect(() => {
    const profileId = user?.id ?? user?.uid ?? null;
    if (!profileId) {
      setIsFollowing(false);
      return;
    }
    const local = getLocalFavorite(profileId);
    if (local) {
      setIsFollowing(true);
    }
    let cancelled = false;
    (async () => {
      const already = await isFavorite(profileId, currentUser?.uid);
      if (!cancelled) setIsFollowing(already);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.uid, currentUser?.uid]);

  useEffect(() => {
    if (!shareMenuOpen) {
      setCopyState('idle');
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(target) &&
        shareButtonRef.current &&
        !shareButtonRef.current.contains(target)
      ) {
        setShareMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [shareMenuOpen]);

  const handleFollow = async () => {
    const profileId = user?.id ?? user?.uid;
    if (!profileId) return;
    if (!currentUser) {
      const handle = user?.handle || username;
      window.location.href = `/login?next=${encodeURIComponent(`/u/${handle}`)}`;
      return;
    }
    try {
      setFollowBusy(true);
      const payload: FavoriteCreatorMeta = {
        id: profileId,
        handle: user?.handle || username,
        displayName: user?.displayName || user?.handle || username,
        photoURL: user?.photoURL || null,
      };
      if (isFollowing) {
        await deleteFavorite(profileId, currentUser.uid);
        setIsFollowing(false);
        addToast({
          message: t('followToast.unfollowed', { name: payload.displayName || payload.handle }),
          type: 'info',
        });
      } else {
        await persistFavorite(payload, currentUser.uid);
        setIsFollowing(true);
        addToast({
          message: t('followToast.followed', { name: payload.displayName || payload.handle }),
          type: 'info',
        });
      }
    } catch (err) {
      console.error('Failed to toggle follow status', err);
      addToast({ message: t('followToast.error'), type: 'error' });
    } finally {
      setFollowBusy(false);
    }
  };

  const shareHandle = user?.handle || username;
  const shareName = user?.displayName || `@${shareHandle}`;
  const shareMessage = useMemo(
    () => t('share.dialog', { name: shareName }),
    [shareName, t]
  );
  const encodedShareUrl = useMemo(() => encodeURIComponent(shareUrl), [shareUrl]);
  const encodedMessage = useMemo(() => encodeURIComponent(shareMessage), [shareMessage]);
  const whatsappPayload = useMemo(
    () => encodeURIComponent(`${shareMessage} ${shareUrl}`),
    [shareMessage, shareUrl]
  );

  const shareTargets = useMemo(
    () => [
      {
        id: 'facebook',
        label: t('share.targets.facebook'),
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodedShareUrl}`,
        Icon: Facebook,
      },
      {
        id: 'instagram',
        label: t('share.targets.instagram'),
        href: `https://www.instagram.com/?url=${encodedShareUrl}`,
        Icon: Instagram,
      },
      {
        id: 'twitter',
        label: t('share.targets.twitter'),
        href: `https://twitter.com/intent/tweet?text=${encodedMessage}&url=${encodedShareUrl}`,
        Icon: Twitter,
      },
      {
        id: 'linkedin',
        label: t('share.targets.linkedin'),
        href: `https://www.linkedin.com/shareArticle?mini=true&url=${encodedShareUrl}&title=${encodedMessage}`,
        Icon: Linkedin,
      },
      {
        id: 'whatsapp',
        label: t('share.targets.whatsapp'),
        href: `https://wa.me/?text=${whatsappPayload}`,
        Icon: MessageCircle,
      },
    ],
    [encodedShareUrl, encodedMessage, whatsappPayload, t]
  );

  const handleNativeShare = async () => {
    if (!navigator.share) {
      setShareMenuOpen(false);
      await handleCopyLink();
      return;
    }
    try {
      await navigator.share({
        title: shareName,
        text: shareMessage,
        url: shareUrl,
      });
      addToast({ message: t('share.shared'), type: 'info' });
      setShareMenuOpen(false);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      console.error('Native share failed', err);
      addToast({ message: t('share.error'), type: 'error' });
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
      addToast({ message: t('share.copied'), type: 'info' });
    } catch (err) {
      console.error('Failed to copy link', err);
      setCopyState('error');
      addToast({ message: t('share.error'), type: 'error' });
    }
  };

  const handleTargetShare = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
    addToast({ message: t('share.shared'), type: 'info' });
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      );
    }

    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <div className="bg-slate-100 dark:bg-zinc-800 p-4 rounded-full mb-4">
            <LayoutGrid className="h-8 w-8 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t('notFound.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{t('notFound.message', { username })}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('notFound.backHome')}
          </Link>
        </div>
      );
    }

    const isOwnProfile = currentUser?.uid === user?.uid || currentUser?.uid === user?.id;
    const stats = user?.stats ?? {};
    const formatStat = (value: unknown) =>
      typeof value === 'number' ? value.toLocaleString() : '0';

    return (
      <div className="min-h-screen bg-slate-50/50 dark:bg-zinc-950/50">
      {/* Header Banner */}
      <div className="h-48 md:h-64 bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-900 dark:to-teal-900 relative">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative pb-12">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-200 dark:border-zinc-800 p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 md:items-start">
            {/* Avatar */}
            <div className="shrink-0 flex justify-center md:justify-start">
              <div className="relative h-32 w-32 rounded-full ring-4 ring-white dark:ring-zinc-900 bg-slate-100 dark:bg-zinc-800 overflow-hidden shadow-lg">
                {user.photoURL ? (
                  <Image
                    src={user.photoURL}
                    alt={user.displayName || username}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-4xl font-bold text-slate-300 dark:text-zinc-600">
                    {(user.displayName || username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {user.displayName || username}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium">@{user.handle || username}</p>
              </div>

              {user.bio && (
                <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto md:mx-0 leading-relaxed">
                  {user.bio}
                </p>
              )}

              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-100 dark:border-zinc-800 pt-6">
                <div className="text-center md:text-left">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatStat(stats.apps)}</div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('stats.apps')}</div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatStat(stats.likes)}</div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('stats.likes')}</div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatStat(stats.plays)}</div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('stats.plays')}</div>
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                {isOwnProfile ? (
                  <Link
                    href="/profile"
                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    {t('editProfile')}
                  </Link>
                ) : currentUser ? (
                  <button
                    onClick={handleFollow}
                    disabled={followBusy}
                    className={`flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isFollowing
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200'
                      }`}
                  >
                    {isFollowing ? t('following') : t('follow')}
                  </button>
                ) : (
                  <Link
                    href={`/login?next=${encodeURIComponent(`/u/${user.handle || username}`)}`}
                    className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                  >
                    {t('follow')}
                  </Link>
                )}
                <div className="relative">
                  <button
                    ref={shareButtonRef}
                    onClick={() => setShareMenuOpen((prev) => !prev)}
                    className="p-2 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-600 dark:text-slate-400"
                    title={t('share.label')}
                    aria-label={t('share.label')}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={shareMenuOpen}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  {shareMenuOpen && (
                    <div
                      ref={shareMenuRef}
                      className="absolute right-0 mt-2 w-60 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-3 text-sm space-y-2 z-20"
                    >
                      <button
                        type="button"
                        onClick={handleNativeShare}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
                      >
                        <SendHorizontal className="h-4 w-4 text-emerald-500" />
                        <span>{t('share.native')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
                      >
                        <Link2 className="h-4 w-4 text-emerald-500" />
                        <span>
                          {copyState === 'copied'
                            ? t('share.copied')
                            : copyState === 'error'
                              ? t('share.error')
                              : t('share.copy')}
                        </span>
                      </button>
                      <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                          {t('share.networks')}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {shareTargets.map(({ id, label, href, Icon }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => handleTargetShare(href)}
                              className="flex items-center gap-2 rounded-xl border border-slate-100 dark:border-zinc-800 px-2.5 py-2 text-left hover:border-emerald-200 dark:hover:border-emerald-600 transition"
                            >
                              <Icon className="h-4 w-4 text-emerald-500" />
                              <span className="text-sm">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Apps Grid */}
        <div className="mt-12 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-emerald-500" />
              {t('projects')}
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                {userApps.length}
              </span>
            </h2>
          </div>

          {loadingApps ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-slate-100 dark:bg-zinc-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : userApps.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userApps.map((app) => (
                <AppCard
                  key={app.id}
                  item={app}
                  viewMode="grid"
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 border-dashed">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 mb-4">
                <LayoutGrid className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t('noProjects.title')}</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1">{t('noProjects.message')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  };

  return renderContent();
}
