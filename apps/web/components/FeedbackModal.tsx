"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n-provider";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FeedbackModal({ open, onClose }: Props) {
  const { messages } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setSuccess(false);
    } else {
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!message || message.trim().length < 5) {
      setError(messages['Feedback.form.errorMinLength'] || "Molimo napišite kratak opis prijedloga (najmanje 5 znakova)");
      return;
    }

    setLoading(true);
    try {
      const page = typeof window !== "undefined" ? window.location.href : "";
      // Prefer explicit API base from env (NEXT_PUBLIC_API_URL) -- in dev this is usually http://127.0.0.1:8789
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
      const url = apiBase ? `${apiBase}/feedback` : '/api/feedback';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, page }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((j && j.error) || messages['Feedback.form.errorGeneric'] || 'Greška pri slanju. Pokušajte kasnije.');
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
      // close after short delay
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(messages['Feedback.form.errorGeneric'] || 'Greška pri slanju. Pokušajte kasnije.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <form
        onSubmit={onSubmit}
        className="relative bg-white dark:bg-zinc-900 w-full max-w-lg mx-4 rounded-lg shadow-lg p-6 ring-1 ring-gray-200 dark:ring-zinc-800"
        aria-modal
        role="dialog"
      >
        <button
          type="button"
          className="absolute right-3 top-3 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          onClick={onClose}
          aria-label={messages['Feedback.close'] || "Zatvori"}
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {messages['Feedback.title'] || "Vaši prijedlozi"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {messages['Feedback.subtitle'] || "Pošaljite prijedlog za poboljšanje Thesare — poslat ćemo ga našem timu."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <input
            placeholder={messages['Feedback.form.namePlaceholder'] || "Vaše ime (opcionalno)"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-600"
          />

          <input
            placeholder={messages['Feedback.form.emailPlaceholder'] || "Email (opcionalno)"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-600"
          />

          <input
            placeholder={messages['Feedback.form.subjectPlaceholder'] || "Kratki naslov prijedloga"}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-600"
          />

          <textarea
            placeholder={messages['Feedback.form.messagePlaceholder'] || "Napišite vaš prijedlog ovdje..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-600"
          />

          {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
          {success ? <div className="text-sm text-green-600 dark:text-green-400">{messages['Feedback.form.success'] || "Hvala! Prijedlog je poslan."}</div> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700"
              disabled={loading}
            >
              {messages['Feedback.form.cancel'] || "Odustani"}
            </button>

            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              disabled={loading}
            >
              {loading ? (messages['Feedback.form.sending'] || 'Slanje...') : (messages['Feedback.form.submit'] || 'Pošalji')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
