"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import Logo from "@/components/Logo";
import AuthLinks from "@/components/AuthLinks";
import FeedbackModal from "@/components/FeedbackModal";
import { useI18n } from "@/lib/i18n-provider";
import { GOLDEN_BOOK, getGoldenBookCountdown, isGoldenBookCampaignActive } from "@/lib/config";

export default function SiteHeader() {
  const router = useRouter();
  const [showFeedback, setShowFeedback] = useState(false);
  const { messages } = useI18n();
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

  return (
    <header className="sticky top-0 z-40 backdrop-blur-lg supports-[backdrop-filter]:bg-white/75 border-b border-gray-200/50 shadow-sm">
      <div className="flex items-center justify-between max-w-7xl mx-auto p-4">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
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

          <Link href="/golden-book" className="text-gray-600 hover:underline">
            {messages["Nav.goldenBook"] ?? "Golden Book"}
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

          {/* New feedback link - text only */}
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="text-gray-700 hover:text-gray-900 hover:underline px-2 py-1 rounded-md transition font-medium"
            aria-label={feedbackLabel}
          >
            {feedbackLabel}
          </button>

          <AuthLinks />
        </nav>
      </div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </header>
  );
}
