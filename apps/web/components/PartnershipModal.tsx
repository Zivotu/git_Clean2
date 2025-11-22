"use client";

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';

type Props = {
  open: boolean;
  onClose: () => void;
};

type FormState = {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  message: string;
};

const defaultState: FormState = {
  fullName: '',
  company: '',
  email: '',
  phone: '',
  message: '',
};

export default function PartnershipModal({ open, onClose }: Props) {
  const { messages } = useI18n();
  const { isDark } = useTheme();
  const t = useMemo(() => {
    return (key: string) => messages[`Partnership.${key}`] || key;
  }, [messages]);
  const [form, setForm] = useState<FormState>(defaultState);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setError('');
      setSuccess(false);
      setLoading(false);
    } else {
      setForm(defaultState);
    }
  }, [open]);

  if (!open) return null;

  const update = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    setSuccess(false);

    if (!form.email || !form.email.includes('@')) {
      setError(t('errorEmail'));
      return;
    }
    if (!form.message || form.message.trim().length < 5) {
      setError(t('errorMessage'));
      return;
    }

    setLoading(true);
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
      const endpoint = apiBase ? `${apiBase}/partnership` : '/api/partnership';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        const code = data?.error;
        if (code === 'message_too_short') {
          setError(t('errorMessage'));
        } else if (code === 'email_required') {
          setError(t('errorEmail'));
        } else if (typeof code === 'string') {
          setError(code);
        } else {
          setError(t('errorGeneric'));
        }
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(t('errorGeneric'));
      setLoading(false);
    }
  }

  const inputClass = `rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 ${isDark ? 'border-[#27272A] bg-[#0B0B10] text-zinc-100 focus:ring-emerald-900' : 'border-gray-200 bg-white text-slate-900 focus:ring-emerald-100'}`;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className={`relative w-full max-w-lg mx-4 rounded-2xl shadow-2xl border p-6 space-y-4 ${isDark ? 'bg-[#09090B] border-[#27272A] text-zinc-100' : 'bg-white border-gray-200 text-slate-900'}`}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute right-4 top-4 ${isDark ? 'text-zinc-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'} transition`}
          aria-label={t('closeLabel')}
        >
          &times;
        </button>
        <div>
          <h3 className={`text-xl font-semibold ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{t('title')}</h3>
          <p className={`mt-1 text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>{t('description')}</p>
        </div>
        <div className="grid gap-3">
          <input
            value={form.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            placeholder={t('nameLabel')}
            className={inputClass}
          />
          <input
            value={form.company}
            onChange={(e) => update('company', e.target.value)}
            placeholder={t('companyLabel')}
            className={inputClass}
          />
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder={t('emailLabel')}
            required
            className={inputClass}
          />
          <input
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder={t('phoneLabel')}
            className={inputClass}
          />
          <textarea
            value={form.message}
            onChange={(e) => update('message', e.target.value)}
            placeholder={t('messagePlaceholder')}
            rows={5}
            className={inputClass}
          />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {success && <div className="text-sm text-green-600">{t('successMessage')}</div>}
        <div className="flex items-center justify-between">
          <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{t('footerNote')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg border ${isDark ? 'border-[#27272A] text-zinc-200 hover:bg-[#0b0b0b]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              disabled={loading}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-70"
              disabled={loading}
            >
              {loading ? t('sending') : t('submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
