'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import AdSlot from '@/components/AdSlot';
import { PUBLIC_API_URL } from '@/lib/config';
import type { User as FirebaseUser } from 'firebase/auth';

const cx = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(' ');

type Recenzija = {
  korisnik: string;
  ocjena: number;
  komentar: string;
  datum: string;
};

interface AuthorInfo {
  uid?: string;
  name?: string;
  photo?: string;
}

interface PublicListing {
  id?: string | number;
  title: string;
  description?: string;
  longDescription?: string;
  screenshotUrls?: string[];
  price?: number;
  playsCount?: number;
  author?: AuthorInfo;
  previewUrl?: string | null;
}

interface PublicAppViewProps {
  item: PublicListing;
  authorHandle?: string;
  relativeCreated?: string;
  isNew: boolean;
  showStatusNotice: boolean;
  canViewUnpublished: boolean;
  appState: 'active' | 'inactive';
  visibility: 'public' | 'unlisted';
  formattedPrice: string;
  playsDisplay: string;
  likeCount: number;
  liked: boolean;
  likeBusy: boolean;
  copySuccess: boolean;
  buildBadgesSlot: React.ReactNode;
  previewSrc?: string | null;
  onPreviewError: () => void;
  playButtonState: 'login' | 'pay' | 'play';
  onPlay: () => void;
  onRequireLogin: () => void;
  onRequirePurchase: () => void;
  toggleLike: () => void;
  copyLink: () => void;
  adHeaderSlot?: string;
  adInlineSlot?: string;
  tApp: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  showContentReport: boolean;
  setShowContentReport: Dispatch<SetStateAction<boolean>>;
  contentReportText: string;
  setContentReportText: (value: string) => void;
  contentReportBusy: boolean;
  submitContentReport: () => void;
  viewerIdentity: string;
  descriptionFallback: string;
  user: FirebaseUser | null;
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={cx('text-xs', index < Math.round(value) ? 'opacity-100' : 'opacity-30')}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function PublicAppViewComponent({
  item,
  authorHandle,
  relativeCreated,
  isNew,
  showStatusNotice,
  canViewUnpublished,
  appState,
  visibility,
  formattedPrice,
  playsDisplay,
  likeCount,
  liked,
  likeBusy,
  copySuccess,
  buildBadgesSlot,
  previewSrc,
  onPreviewError,
  playButtonState,
  onPlay,
  onRequireLogin,
  onRequirePurchase,
  toggleLike,
  copyLink,
  adHeaderSlot,
  adInlineSlot,
  tApp,
  showContentReport,
  setShowContentReport,
  contentReportText,
  setContentReportText,
  contentReportBusy,
  submitContentReport,
  viewerIdentity,
  descriptionFallback,
  user,
}: PublicAppViewProps) {
  const heroDescription = item.description?.trim() || descriptionFallback;
  const detailedDescription = (item.longDescription ?? '').trim() || heroDescription;
  const listingNumericId = Number(item.id ?? 0);

  const [reviews, setReviews] = useState<Recenzija[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const gallery = useMemo(() => {
    const raw = Array.isArray(item.screenshotUrls) ? item.screenshotUrls : [];
    const sanitized = raw.map((url) => url?.trim()).filter(Boolean);
    return sanitized.slice(0, 2);
  }, [item.screenshotUrls]);

  const handlePrimaryAction = useCallback(() => {
    if (playButtonState === 'login') {
      onRequireLogin();
    } else if (playButtonState === 'pay') {
      onRequirePurchase();
    } else {
      onPlay();
    }
  }, [playButtonState, onRequireLogin, onRequirePurchase, onPlay]);

  const playButtonLabel = useMemo(() => {
    if (playButtonState === 'login') {
      return tApp('viewer.play.login', undefined, 'Prijavi se i pokreni');
    }
    if (playButtonState === 'pay') {
      return tApp('viewer.play.pay', undefined, 'Otključaj za igranje');
    }
    return tApp('viewer.play.default', undefined, 'Pokreni aplikaciju');
  }, [playButtonState, tApp]);

  const renderPlayButton = () => (
    <button
      type="button"
      onClick={handlePrimaryAction}
      className={cx(
        'flex h-12 w-full items-center justify-center gap-3 rounded-2xl px-6 text-base font-semibold text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
        playButtonState === 'pay'
          ? 'bg-slate-900 hover:bg-slate-800'
          : playButtonState === 'login'
            ? 'bg-gray-900 hover:bg-gray-800'
            : 'bg-emerald-600 hover:bg-emerald-700',
      )}
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      {playButtonLabel}
    </button>
  );

  const loadReviews = useCallback(async () => {
    if (!listingNumericId) return;
    setIsLoadingReviews(true);
    try {
      const token = user ? await user.getIdToken() : undefined;
      const res = await fetch(`${PUBLIC_API_URL}/recenzije/${listingNumericId}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const data = await res.json();
      setReviews(Array.isArray(data?.recenzije) ? data.recenzije : []);
      setAverageRating(typeof data?.prosjek === 'number' ? data.prosjek : 0);
      setCanReview(Boolean(data?.canReview));
    } finally {
      setIsLoadingReviews(false);
    }
  }, [listingNumericId, user]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const ratingDistribution = useMemo(() => {
    const buckets = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      const idx = Math.max(1, Math.min(5, Math.round(r.ocjena))) - 1;
      buckets[idx] += 1;
    });
    const total = buckets.reduce((acc, count) => acc + count, 0) || 1;
    return buckets.map((count, idx) => ({
      star: idx + 1,
      count,
      percentage: Math.round((count / total) * 100),
    }));
  }, [reviews]);

  const formattedAverage = averageRating > 0 ? averageRating.toFixed(1) : '—';

  const handleReviewSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!listingNumericId) return;
      if (!user) {
        setReviewStatus({ type: 'error', text: tApp('reviews.loginRequired', undefined, 'Prijavi se da ostaviš recenziju.') });
        return;
      }
      if (!canReview) {
        setReviewStatus({
          type: 'error',
          text: tApp('reviews.requirePurchase', undefined, 'Recenzije mogu ostaviti samo korisnici koji su isprobali aplikaciju.'),
        });
        return;
      }
      if (reviewComment.trim().length < 10) {
        setReviewStatus({
          type: 'error',
          text: tApp('reviews.tooShort', undefined, 'Poruka treba imati barem 10 znakova.'),
        });
        return;
      }
      setReviewStatus(null);
      setReviewSubmitting(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${PUBLIC_API_URL}/recenzije`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            oglas: listingNumericId,
            ocjena: reviewRating,
            komentar: reviewComment.trim(),
          }),
        });
        if (!res.ok) {
          throw new Error(`post_failed_${res.status}`);
        }
        setReviewComment('');
        setReviewRating(5);
        setReviewStatus({
          type: 'success',
          text: tApp('reviews.sent', undefined, 'Hvala! Tvoja recenzija je zaprimljena.'),
        });
        loadReviews();
      } catch (error) {
        console.error(error);
        setReviewStatus({
          type: 'error',
          text: tApp('reviews.error', undefined, 'Ne možemo spremiti recenziju. Pokušaj ponovno.'),
        });
      } finally {
        setReviewSubmitting(false);
      }
    },
    [listingNumericId, user, canReview, reviewComment, reviewRating, loadReviews, tApp],
  );

  const formatReviewDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat('hr-HR', { dateStyle: 'medium' }).format(new Date(value));
    } catch {
      return value;
    }
  };

  const handlePreviewError = useCallback(() => {
    setPreviewFailed(true);
    onPreviewError();
  }, [onPreviewError]);

  const likeDisplay = typeof likeCount === 'number' ? likeCount.toLocaleString('hr-HR') : '—';
  const statusLabel =
    appState === 'inactive'
      ? tApp('viewer.status.inactive', undefined, 'Pauzirano')
      : tApp('viewer.status.active', undefined, 'Aktivno');
  const visibilityBadge =
    visibility === 'unlisted'
      ? tApp('viewer.badges.unlisted', undefined, 'Skriveno')
      : tApp('viewer.badges.public', undefined, 'Javno');
  const stats = useMemo(
    () => [
      { key: 'likes', label: tApp('viewer.stats.likes', undefined, 'Sviđanja'), value: likeDisplay },
      { key: 'plays', label: tApp('viewer.stats.plays', undefined, 'Pokretanja'), value: playsDisplay },
      { key: 'status', label: tApp('viewer.stats.status', undefined, 'Status'), value: statusLabel },
      { key: 'price', label: tApp('viewer.stats.price', undefined, 'Cijena'), value: formattedPrice },
    ],
    [formattedPrice, likeDisplay, playsDisplay, statusLabel, tApp],
  );
  const shareLabel = copySuccess
    ? tApp('viewer.actions.copied', undefined, 'Link je kopiran')
    : tApp('viewer.actions.copy', undefined, 'Kopiraj link');
  const likeButtonLabel = liked
    ? tApp('viewer.actions.liked', undefined, 'Spremljeno')
    : tApp('viewer.actions.like', undefined, 'Sviđa mi se');

  const descriptionParagraphs = useMemo(() => {
    return detailedDescription
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }, [detailedDescription]);

  const canReportContent = Boolean(user && item.author?.uid !== user?.uid);
  const viewerLabel = viewerIdentity || tApp('viewer.identity.missing', undefined, 'Gost korisnik');

  const galleryTitle = tApp('viewer.gallery.title', undefined, 'Snimke zaslona');
  const galleryEmpty = tApp('viewer.gallery.empty', undefined, 'Snimke će se pojaviti kada ih kreator doda.');
  const galleryAlt = (index: number) =>
    tApp('viewer.gallery.alt', { index: index + 1 }, `Screenshot ${index + 1}`);
  const descriptionTitle = tApp('viewer.description.title', undefined, 'Što dobivaš');
  const descriptionEmpty = tApp('viewer.description.empty', undefined, 'Autor će uskoro dodati detaljniji opis.');

  const reviewsTitle = tApp('reviews.title', undefined, 'Recenzije');
  const reviewsSubtitle = tApp('reviews.subtitle', { count: reviews.length }, `${reviews.length} recenzija`);
  const reviewsAverageLabel = tApp('reviews.averageLabel', { count: reviews.length }, 'Prosjek ocjena');
  const reviewsBreakdown = tApp('reviews.breakdown', undefined, 'Raspodjela ocjena');
  const reviewsLoading = tApp('reviews.loading', undefined, 'Učitavanje recenzija...');
  const reviewsEmpty = tApp('reviews.empty', undefined, 'Još nema recenzija.');
  const reviewsFormTitle = tApp('reviews.leaveReview', undefined, 'Podijeli svoje iskustvo');
  const reviewsRatingLabel = tApp('reviews.ratingLabel', undefined, 'Ocjena');
  const reviewsCommentLabel = tApp('reviews.commentLabel', undefined, 'Komentar');
  const reviewsPlaceholder = tApp('reviews.commentPlaceholder', undefined, 'Što ti se svidjelo? Što bismo mogli poboljšati?');
  const previewTitle = tApp('viewer.preview.title', undefined, 'Live prikaz');
  const previewFallback = tApp('viewer.preview.fallback', undefined, 'Prikaz će se pojaviti nakon što kreator doda vlastitu ilustraciju.');
  const bannerTagline = tApp('viewer.tagline', undefined, 'Istaknuta aplikacija');
  const newBadge = tApp('viewer.badges.new', undefined, 'Novo');
  const securityTitle = tApp('viewer.securityTitle', undefined, 'Sigurnosne oznake');

  const reportTitle = tApp('viewer.report.title', undefined, 'Prijavi sadržaj');
  const reportIdentityLabel = tApp('viewer.report.identityLabel', undefined, 'Tvoj profil');
  const reportIdentityHint = tApp('viewer.report.identityHint', undefined, 'Podatak se popunjava automatski i služi moderatorima za povratnu informaciju.');
  const reportReasonLabel = tApp('viewer.report.reasonLabel', undefined, 'Razlog prijave');
  const reportReasonPlaceholder = tApp('viewer.report.reasonPlaceholder', undefined, 'Objasni što je sporno…');
  const reportReasonHint = tApp('viewer.report.reasonHint', undefined, 'Minimalno 10 znakova. Poruke idu direktno moderatorskom timu.');
  const reportCancel = tApp('viewer.report.cancel', undefined, 'Odustani');
  const reportSubmit = contentReportBusy
    ? tApp('viewer.report.busy', undefined, 'Slanje…')
    : tApp('viewer.report.submit', undefined, 'Pošalji prijavu');
  const reportLinkLabel = tApp('viewer.report.link', undefined, 'Prijavi sadržaj');
  const ctaBannerAlt = tApp('viewer.ctaBanner.alt', undefined, 'Thesara promo banner');
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 lg:py-16">
        {adHeaderSlot && (
          <AdSlot
            slotId={adHeaderSlot}
            slotKey="appDetailHeader"
            placement="app.detail.header"
            className="rounded-3xl border border-gray-100 bg-white/80 p-3"
          />
        )}

        {showStatusNotice && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-amber-900">
            {canViewUnpublished
              ? tApp('viewer.banner.private', undefined, 'Ovaj oglas još nije javan. Vidiš ga jer imaš povišena prava.')
              : tApp('viewer.banner.pending', undefined, 'Aplikacija je u postupku odobravanja.')}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-500">
                {bannerTagline}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black text-gray-900 md:text-4xl">{item.title}</h1>
                {isNew && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {newBadge}
                  </span>
                )}
                {visibility === 'unlisted' && (
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">{visibilityBadge}</span>
                )}
                {appState === 'inactive' && (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                    {tApp('viewer.badges.paused', undefined, 'Pauzirano')}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
                {item.author && (
                  <div className="flex items-center gap-2">
                    {item.author.photo && (
                      authorHandle ? (
                        <Link href={`/u/${authorHandle}`}>
                          <Avatar uid={item.author.uid} src={item.author.photo} name={item.author.name} size={28} />
                        </Link>
                      ) : (
                        <Avatar uid={item.author.uid} src={item.author.photo} name={item.author.name} size={28} />
                      )
                    )}
                    <span>
                      {tApp(
                        'viewer.byLine',
                        { name: authorHandle ? `@${authorHandle}` : item.author.name || tApp('viewer.author.unknown', undefined, 'Nepoznati autor') },
                        authorHandle ? `@${authorHandle}` : item.author.name || 'Creator',
                      )}
                    </span>
                  </div>
                )}
                {relativeCreated && (
                  <>
                    <span>•</span>
                    <span>{tApp('viewer.added', { time: relativeCreated }, relativeCreated)}</span>
                  </>
                )}
                <span>•</span>
                <span>{statusLabel}</span>
              </div>
              <p className="mt-6 text-lg leading-relaxed text-gray-700">{heroDescription}</p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">{renderPlayButton()}</div>
                <button
                  type="button"
                  onClick={toggleLike}
                  disabled={likeBusy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                >
                  <span aria-hidden className={cx('text-lg', liked ? 'text-rose-500' : 'text-gray-400')}>♥</span>
                  {likeButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:border-emerald-300 hover:text-emerald-700 sm:flex-none"
                >
                  <span aria-hidden className="text-lg text-gray-400">⧉</span>
                  {shareLabel}
                </button>
              </div>

              {buildBadgesSlot && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gray-500">{securityTitle}</p>
                  <div className="mt-2">{buildBadgesSlot}</div>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                {stats.map((stat) => (
                  <div key={stat.key} className="rounded-2xl border border-gray-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{stat.label}</p>
                    <p className="mt-1 text-2xl font-black text-gray-900">{stat.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-gray-900">{descriptionTitle}</h2>
              </div>
              <div className="mt-4 space-y-4 text-gray-700">
                {descriptionParagraphs.length > 0 ? (
                  descriptionParagraphs.map((paragraph, index) => (
                    <p key={index} className="leading-relaxed">
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <p className="text-sm italic text-gray-500">{descriptionEmpty}</p>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold text-gray-900">{galleryTitle}</h2>
              </div>
              {gallery.length ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {gallery.map((url, index) => (
                    <figure key={url + index} className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                      <img src={url} alt={galleryAlt(index)} loading="lazy" className="h-60 w-full object-cover" />
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm italic text-gray-500">{galleryEmpty}</p>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{reviewsTitle}</h2>
                  <p className="text-sm text-gray-500">{reviewsSubtitle}</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black text-gray-900">{formattedAverage}</div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{reviewsAverageLabel}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{reviewsBreakdown}</p>
                  <div className="mt-3 space-y-3">
                    {[...ratingDistribution].reverse().map((row) => (
                      <div key={row.star}>
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>{row.star} ★</span>
                          <span>{row.percentage}%</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${row.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white/90 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{reviewsFormTitle}</h3>
                  {!user && <p className="mt-2 text-xs text-gray-500">{tApp('reviews.loginHint', undefined, 'Prijavi se kako bi ostavio recenziju.')}</p>}
                  {user && !canReview && <p className="mt-2 text-xs text-gray-500">{tApp('reviews.requirePurchaseHint', undefined, 'Recenzije mogu ostaviti samo korisnici koji su isprobali aplikaciju.')}</p>}
                  <form className="mt-3 space-y-3" onSubmit={handleReviewSubmit}>
                    <label className="block text-xs font-semibold text-gray-600">
                      {reviewsRatingLabel}
                      <select
                        value={reviewRating}
                        onChange={(event) => setReviewRating(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      >
                        {[5, 4, 3, 2, 1].map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-gray-600">
                      {reviewsCommentLabel}
                      <textarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        placeholder={reviewsPlaceholder}
                        rows={4}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </label>
                    {reviewStatus && (
                      <p
                        className={cx(
                          'text-xs font-semibold',
                          reviewStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600',
                        )}
                      >
                        {reviewStatus.text}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={reviewSubmitting}
                      className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reviewSubmitting ? tApp('reviews.submitting', undefined, 'Slanje…') : tApp('reviews.submit', undefined, 'Pošalji recenziju')}
                    </button>
                  </form>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                {isLoadingReviews ? (
                  <p className="text-sm text-gray-500">{reviewsLoading}</p>
                ) : reviews.length === 0 ? (
                  <p className="text-sm text-gray-500">{reviewsEmpty}</p>
                ) : (
                  reviews.map((review) => (
                    <div key={`${review.korisnik}-${review.datum}`} className="rounded-2xl border border-gray-100 bg-white/90 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{review.korisnik}</p>
                          <p className="text-xs text-gray-500">{formatReviewDate(review.datum)}</p>
                        </div>
                        <RatingStars value={review.ocjena} />
                      </div>
                      <p className="mt-3 text-sm text-gray-700">{review.komentar}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            {adInlineSlot && (
              <AdSlot
                slotId={adInlineSlot}
                slotKey="appDetailInline"
                placement="app.detail.inline"
                className="rounded-3xl border border-gray-100 bg-white/80 p-3"
              />
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-500">
                  {previewTitle}
                </h2>
                <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
                  {formattedPrice}
                </span>
              </div>
              {previewSrc && !previewFailed ? (
                <img
                  src={previewSrc}
                  alt={item.title}
                  className="mt-4 h-64 w-full rounded-2xl object-cover"
                  onError={handlePreviewError}
                />
              ) : (
                <div className="mt-4 flex h-64 items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-500">
                  {previewFallback}
                </div>
              )}
              <dl className="mt-5 space-y-2 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <dt>{tApp('viewer.stats.plays', undefined, 'Pokretanja')}</dt>
                  <dd className="font-semibold text-gray-900">{playsDisplay}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>{tApp('viewer.stats.likes', undefined, 'Sviđanja')}</dt>
                  <dd className="font-semibold text-gray-900">{likeDisplay}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>{tApp('viewer.stats.status', undefined, 'Status')}</dt>
                  <dd className="font-semibold text-gray-900">{statusLabel}</dd>
                </div>
              </dl>
            </section>

            {canReportContent && (
              <section className="rounded-3xl border border-gray-100 bg-white/95 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-500">
                    {reportTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowContentReport((prev) => !prev)}
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                  >
                    {showContentReport
                      ? tApp('viewer.report.hide', undefined, 'Sakrij obrazac')
                      : reportLinkLabel}
                  </button>
                </div>
                {showContentReport && (
                  <form
                    className="mt-4 space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!contentReportBusy) submitContentReport();
                    }}
                  >
                    <label className="block text-xs font-semibold text-gray-600">
                      {reportIdentityLabel}
                      <input
                        type="text"
                        readOnly
                        value={viewerLabel}
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900"
                      />
                      <span className="mt-1 block text-[11px] text-gray-500">{reportIdentityHint}</span>
                    </label>
                    <label className="block text-xs font-semibold text-gray-600">
                      {reportReasonLabel}
                      <textarea
                        value={contentReportText}
                        onChange={(event) => setContentReportText(event.target.value)}
                        placeholder={reportReasonPlaceholder}
                        rows={4}
                        maxLength={2000}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <span className="mt-1 block text-[11px] text-gray-500">{reportReasonHint}</span>
                    </label>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowContentReport(false);
                          setContentReportText('');
                        }}
                        className="text-sm text-gray-500 hover:text-gray-700"
                        disabled={contentReportBusy}
                      >
                        {reportCancel}
                      </button>
                      <button
                        type="submit"
                        disabled={contentReportBusy || contentReportText.trim().length < 10}
                        className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {reportSubmit}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default memo(PublicAppViewComponent);
