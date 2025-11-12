"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import Logo from "@/components/Logo";
import AuthLinks from "@/components/AuthLinks";
import FeedbackModal from "@/components/FeedbackModal";
import { useI18n } from "@/lib/i18n-provider";

export default function SiteHeader() {
  const router = useRouter();
  const [showFeedback, setShowFeedback] = useState(false);
  const { messages } = useI18n();
  const feedbackLabel = messages["Nav.feedback"] ?? "Feedback";

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
