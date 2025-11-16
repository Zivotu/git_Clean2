"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import Logo from "@/components/Logo";
import AuthLinks from "@/components/AuthLinks";
import FeedbackModal from "@/components/FeedbackModal";
import { useI18n } from "@/lib/i18n-provider";
import { GOLDEN_BOOK, getGoldenBookCountdown, isGoldenBookCampaignActive } from "@/lib/config";
import GoldenBookIcon from "../../../assets/GoldenBook_Icon_1.png";
import { useEarlyAccessCampaign } from "@/hooks/useEarlyAccessCampaign";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useAuth } from "@/lib/auth";
import { apiPost } from "@/lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function SiteHeader() {
  const router = useRouter();
  const [showFeedback, setShowFeedback] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [subscribeMessage, setSubscribeMessage] = useState<string | null>(null);
  const { messages } = useI18n();
  const { user } = useAuth();
  const { data: entitlements } = useEntitlements();
  const { data: campaign } = useEarlyAccessCampaign();
  const feedbackLabel = messages["Nav.feedback"] ?? "Feedback";
  const donateLabel = messages["Nav.donate"] ?? "Donate";
  const donateLink = GOLDEN_BOOK.paymentLink;
  const donateEnabled = GOLDEN_BOOK.enabled && Boolean(donateLink);
  const donateActive = donateEnabled && isGoldenBookCampaignActive();
  const countdown = getGoldenBookCountdown();
  const donateCountdownLabel =
    countdown && countdown.daysRemaining > 0
      ? (messages["Nav.donateCountdown"] || "{days} days left").replace(
          "{days}",
          String(countdown.daysRemaining),
        )
      : null;
  const earlyAccessRemainingDays = useMemo(() => {
    if (!campaign?.isActive) return null;
    const duration = campaign.durationDays ?? campaign.perUserDurationDays;
    if (!duration || duration <= 0) return null;
    const start =
      typeof campaign.startsAt === "number" && campaign.startsAt > 0 ? campaign.startsAt : Date.now();
    const end = start + duration * DAY_MS;
    const remaining = end - Date.now();
    return remaining > 0 ? Math.max(0, Math.ceil(remaining / DAY_MS)) : 0;
  }, [campaign?.durationDays, campaign?.perUserDurationDays, campaign?.isActive, campaign?.startsAt]);
  const earlyAccessBadgeText =
    messages["Nav.earlyAccessBadge"] ?? "30 dana potpuno besplatnih usluga!";
  const earlyAccessDaysText = messages["Nav.earlyAccessDays"] ?? "{days} days left";
  const earlyAccessRibbonLabel = messages["Nav.earlyAccessRibbon"] ?? "EARLY ACCESS";
  const earlyAccessCountdownLabel = messages["Nav.earlyAccessCountdownLabel"] ?? "Countdown";
  const formatEarlyAccessDays = (value: number) => {
    if (!Number.isFinite(value)) return "";
    if (earlyAccessDaysText.includes("{days}")) {
      return earlyAccessDaysText.replace("{days}", String(value));
    }
    return `${value} ${earlyAccessDaysText}`.trim();
  };
  const showEarlyAccessBadge = campaign?.isActive && earlyAccessRemainingDays !== null;
  const badgeImages = useMemo(() => {
    const results: Array<{ key: string; src: string; alt: string }> = [];
    if (campaign?.isActive || entitlements?.gold) {
      results.push({
        key: "gold",
        src: "/assets/GoldUser_Badge.png",
        alt: messages["Nav.goldBadge"] ?? "Gold member",
      });
    }
    if (campaign?.isActive || entitlements?.noAds) {
      results.push({
        key: "noads",
        src: "/assets/NoAds_Badge.png",
        alt: messages["Nav.noAdsBadge"] ?? "No Ads",
      });
    }
    return results;
  }, [campaign?.isActive, entitlements?.gold, entitlements?.noAds, messages]);
  const alreadySubscribed = Boolean(entitlements?.earlyAccess?.subscribedAt);
  const showSubscribeButton = Boolean(
    campaign?.isActive && user && !alreadySubscribed && subscribeStatus !== "success",
  );

  const handleSubscribe = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setSubscribeStatus("loading");
    setSubscribeMessage(null);
    try {
      await apiPost("/me/early-access/subscribe");
      setSubscribeStatus("success");
      setSubscribeMessage(
        messages["Nav.earlyAccessSubscribed"] ?? "You’ll get 50% off the first month.",
      );
    } catch (err: any) {
      const msg =
        err?.message || messages["Nav.earlyAccessSubscribeError"] || "Subscription failed.";
      setSubscribeStatus("error");
      setSubscribeMessage(msg);
    }
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-lg supports-[backdrop-filter]:bg-white/75 border-b border-gray-200/50 shadow-sm">
      <div className="flex items-center gap-6 mx-auto w-[90%] p-4">
        <Logo className="shrink-0" />
        <nav className="flex items-center gap-4 text-sm flex-1 justify-start whitespace-nowrap">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-600 hover:underline"
          >
            Back
          </button>

          <Link href="/faq" className="text-gray-600 hover:underline">
            FAQ
          </Link>

          {showEarlyAccessBadge && (
            <div className="inline-flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100/80 px-3 py-2 text-amber-900 shadow-inner sm:flex-nowrap">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-amber-500 shadow">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="h-4 w-4"
                >
                  <path d="M12 2.75l1.9 5.84h6.15l-4.98 3.62 1.9 5.84L12 14.43l-4.97 3.62 1.9-5.84-4.98-3.62H10.1L12 2.75z" />
                </svg>
              </span>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold sm:flex-nowrap">
                <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
                  {earlyAccessRibbonLabel}
                </span>
                <span className="text-sm font-semibold whitespace-nowrap">{earlyAccessBadgeText}</span>
              </div>
              {earlyAccessRemainingDays !== null && (
                <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-600">
                    {earlyAccessCountdownLabel}
                  </span>
                  <span className="text-xl font-black tracking-tight text-amber-900">
                    {earlyAccessRemainingDays}
                  </span>
                  <span className="text-[11px] font-medium text-amber-700">
                    {formatEarlyAccessDays(earlyAccessRemainingDays)}
                  </span>
                </span>
              )}
            </div>
          )}

          <Link
            href="/golden-book"
            className="p-2 rounded-lg hover:bg-gray-100 transition inline-flex items-center justify-center"
            aria-label={messages["Nav.goldenBook"] ?? "Golden Book"}
          >
            <Image
              src={GoldenBookIcon}
              alt={messages["Nav.goldenBook"] ?? "Golden Book"}
              width={64}
              height={64}
              style={{ height: 64, width: "auto" }}
              className="object-contain"
            />
            <span className="sr-only">{messages["Nav.goldenBook"] ?? "Golden Book"}</span>
          </Link>

          {donateEnabled && (
            donateActive ? (
              <a
                href={donateLink as string}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 inline-flex items-center gap-2"
              >
                {donateLabel}
                {donateCountdownLabel && (
                  <span className="text-[10px] bg-white/25 rounded-full px-2 py-0.5">
                    {donateCountdownLabel}
                  </span>
                )}
              </a>
            ) : (
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-400 text-sm font-semibold">
                {donateLabel}
              </span>
            )
          )}

          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="text-gray-700 hover:text-gray-900 hover:underline px-2 py-1 rounded-md transition font-medium"
            aria-label={feedbackLabel}
          >
            {feedbackLabel}
          </button>

          {showSubscribeButton && (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={subscribeStatus === "loading"}
              className="px-3 py-1 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
            >
              {messages["Nav.subscribeEarlyAccess"] ?? "Subscribe for early access"}
            </button>
          )}

          {subscribeMessage && (
            <span
              className={`text-xs ${
                subscribeStatus === "error" ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {subscribeMessage}
            </span>
          )}

          <div className="flex items-center gap-3">
            {badgeImages.length > 0 && (
              <div className="flex items-center gap-2 max-w-[150px]">
                {badgeImages.map((badge) => (
                  <Image
                    key={badge.key}
                    src={badge.src}
                    alt={badge.alt}
                    width={64}
                    height={40}
                    className="object-contain max-h-8 w-auto"
                  />
                ))}
              </div>
            )}
            <AuthLinks />
          </div>
        </nav>
      </div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </header>
  );
}
