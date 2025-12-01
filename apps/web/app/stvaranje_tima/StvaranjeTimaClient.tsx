'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';

type FormState = {
  firstName: string;
  lastName: string;
  faculty: string;
  birthYear: string;
  studyYear: string;
  firstImpression: string;
  contribution: string;
  extraComment: string;
  contactEmail: string;
  phone: string;
};

const DEFAULT_STATE: FormState = {
  firstName: '',
  lastName: '',
  faculty: '',
  birthYear: '',
  studyYear: '',
  firstImpression: '',
  contribution: '',
  extraComment: '',
  contactEmail: '',
  phone: '',
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function StvaranjeTimaClient() {
  const { isDark } = useTheme();
  const { messages } = useI18n();
  const [form, setForm] = useState<FormState>(DEFAULT_STATE);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const cardClasses = useMemo(
    () =>
      `rounded-3xl border shadow-lg ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-slate-200 bg-white'
      }`,
    [isDark],
  );

  const inputClasses = useMemo(
    () =>
      `w-full rounded-2xl border px-4 py-3 text-base transition focus:outline-none focus:ring-2 ${isDark
        ? 'border-zinc-700 bg-zinc-800/50 text-zinc-100 focus:border-emerald-500 focus:ring-emerald-500/20'
        : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-500/20'
      }`,
    [isDark],
  );

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const validate = (): string | null => {
    if (!form.firstName.trim()) return messages['TeamCreation.form.validation.firstName'] || 'Ime je obavezno.';
    if (!form.lastName.trim()) return messages['TeamCreation.form.validation.lastName'] || 'Prezime je obavezno.';
    if (!form.faculty.trim()) return messages['TeamCreation.form.validation.faculty'] || 'Fakultet je obavezan.';
    if (!form.birthYear.trim()) return messages['TeamCreation.form.validation.birthYear'] || 'Godište je obavezno.';
    if (!form.studyYear.trim()) return messages['TeamCreation.form.validation.studyYear'] || 'Godina studija je obavezna.';
    if (form.firstImpression.trim().length < 5) {
      return messages['TeamCreation.form.validation.firstImpression'] || 'Prvi dojam o Thesari mora sadržavati barem 5 znakova.';
    }
    if (form.contribution.trim().length < 5) {
      return messages['TeamCreation.form.validation.contribution'] || 'Opiši kako možeš doprinijeti projektu.';
    }
    const email = form.contactEmail.trim();
    if (!email) return messages['TeamCreation.form.validation.email'] || 'Kontakt e-mail je obavezan.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return messages['TeamCreation.form.validation.emailInvalid'] || 'Unesi valjanu e-mail adresu.';
    const digits = form.phone.replace(/\D+/g, '');
    if (digits.length < 6) return messages['TeamCreation.form.validation.phone'] || 'Unesi valjan broj mobitela.';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setStatus('submitting');
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
      const endpoint = apiBase ? `${apiBase}/team-application` : '/api/team-application';
      const payload = {
        ...form,
        page: typeof window !== 'undefined' ? window.location.href : undefined,
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(
          messages['TeamCreation.form.errorGeneric'] || 'Ups, nešto je pošlo po zlu. Pokušaj ponovno za par trenutaka ili mi se javi direktno na welcome@thesara.space.',
        );
        return;
      }

      setStatus('success');
      setForm(DEFAULT_STATE);
    } catch (err) {
      console.error('team_application_submit_failed', err);
      setStatus('error');
      setErrorMessage(messages['TeamCreation.form.errorGeneric'] || 'Ups, nešto je pošlo po zlu. Pokušaj ponovno za par trenutaka ili mi se javi direktno na welcome@thesara.space.');
    }
  };

  const isSubmitting = status === 'submitting';
  const isSuccess = status === 'success';

  return (
    <div className="min-h-screen pb-20 pt-28">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4">
        <section className={cardClasses + ' p-8 md:p-12 space-y-8'}>
          <div className="space-y-4 text-lg leading-relaxed">
            <h1 className="text-3xl font-extrabold uppercase tracking-tight text-emerald-500">
              {messages['TeamCreation.title'] || 'TRAŽIM EKIPU ZA AI MARKETPLACE IZ GARAŽE'}
            </h1>
            <p className="text-sm uppercase tracking-widest text-emerald-400">{messages['TeamCreation.subtitle'] || '(Thesara – www.thesara.space)'}</p>
            <p><strong>{messages['TeamCreation.intro.greeting'] || 'Ljudi,'}</strong></p>
            <p>
              {messages['TeamCreation.intro.text'] || 'pokrenuo sam Thesaru, marketplace za mini aplikacije...'}
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">{messages['TeamCreation.whatIs.title'] || 'Što je Thesara?'}</h2>
            <p>{messages['TeamCreation.whatIs.url'] || 'www.thesara.space'}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{messages['TeamCreation.whatIs.list.1']}</li>
              <li>{messages['TeamCreation.whatIs.list.2']}</li>
              <li>{messages['TeamCreation.whatIs.list.3']}</li>
              <li>{messages['TeamCreation.whatIs.list.4']}</li>
              <li>{messages['TeamCreation.whatIs.list.5']}</li>
              <li>{messages['TeamCreation.whatIs.list.6']}</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">{messages['TeamCreation.whoAmILookingFor.title'] || 'Koga tražim?'}</h2>
            <p>{messages['TeamCreation.whoAmILookingFor.text']}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{messages['TeamCreation.whoAmILookingFor.list.1']}</li>
              <li>{messages['TeamCreation.whoAmILookingFor.list.2']}</li>
              <li>{messages['TeamCreation.whoAmILookingFor.list.3']}</li>
              <li>{messages['TeamCreation.whoAmILookingFor.list.4']}</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">{messages['TeamCreation.whatYouGet.title'] || 'Što ti dobivaš?'}</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>{messages['TeamCreation.whatYouGet.list.1']}</li>
              <li>{messages['TeamCreation.whatYouGet.list.2']}</li>
              <li>{messages['TeamCreation.whatYouGet.list.3']}</li>
              <li>{messages['TeamCreation.whatYouGet.list.4']}</li>
            </ul>
            <p>
              {messages['TeamCreation.whatYouGet.text']}
            </p>
          </div>

          <div className="space-y-4">
            <p><strong>{messages['TeamCreation.contact.title']}</strong></p>
            <p className="whitespace-pre-line">{messages['TeamCreation.contact.text']}</p>
            <div className="space-y-3 rounded-2xl border border-dashed border-emerald-400 p-4 text-base">
              <p>{messages['TeamCreation.contact.email']} <a className="text-emerald-500 hover:underline" href="mailto:welcome@thesara.space">welcome@thesara.space</a></p>
              <p>{messages['TeamCreation.contact.whatsapp']}</p>
            </div>
            <p>{messages['TeamCreation.contact.closing']}</p>
          </div>
        </section>

        <section className={cardClasses + ' p-8 md:p-10'}>
          <div className="mb-8 space-y-3 text-center">
            <h2 className="text-3xl font-bold">{messages['TeamCreation.form.title']}</h2>
            <p className="text-base text-slate-500 dark:text-zinc-400">
              {messages['TeamCreation.form.subtitle']} <span className="text-rose-500">*</span> {messages['TeamCreation.form.subtitleSuffix']}
            </p>
          </div>

          {isSuccess ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
              <p className="text-lg font-semibold text-emerald-400">
                {messages['TeamCreation.form.success']}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    {messages['TeamCreation.form.fields.firstName']} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="given-name"
                    className={inputClasses}
                    value={form.firstName}
                    onChange={handleChange('firstName')}
                    placeholder={messages['TeamCreation.form.placeholders.firstName']}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    {messages['TeamCreation.form.fields.lastName']} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoComplete="family-name"
                    className={inputClasses}
                    value={form.lastName}
                    onChange={handleChange('lastName')}
                    placeholder={messages['TeamCreation.form.placeholders.lastName']}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    {messages['TeamCreation.form.fields.faculty']} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputClasses}
                    value={form.faculty}
                    onChange={handleChange('faculty')}
                    placeholder={messages['TeamCreation.form.placeholders.faculty']}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    {messages['TeamCreation.form.fields.birthYear']} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={inputClasses}
                    value={form.birthYear}
                    onChange={handleChange('birthYear')}
                    placeholder={messages['TeamCreation.form.placeholders.birthYear']}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    {messages['TeamCreation.form.fields.studyYear']} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={inputClasses}
                    value={form.studyYear}
                    onChange={handleChange('studyYear')}
                    placeholder={messages['TeamCreation.form.placeholders.studyYear']}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    {messages['TeamCreation.form.fields.email']} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    className={inputClasses}
                    value={form.contactEmail}
                    onChange={handleChange('contactEmail')}
                    placeholder={messages['TeamCreation.form.placeholders.email']}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  {messages['TeamCreation.form.fields.phone']} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  className={inputClasses}
                  value={form.phone}
                  onChange={handleChange('phone')}
                  placeholder={messages['TeamCreation.form.placeholders.phone']}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  {messages['TeamCreation.form.fields.firstImpression']} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  className={`${inputClasses} min-h-[140px] resize-y`}
                  value={form.firstImpression}
                  onChange={handleChange('firstImpression')}
                  placeholder={messages['TeamCreation.form.placeholders.firstImpression']}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  {messages['TeamCreation.form.fields.contribution']} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  className={`${inputClasses} min-h-[140px] resize-y`}
                  value={form.contribution}
                  onChange={handleChange('contribution')}
                  placeholder={messages['TeamCreation.form.placeholders.contribution']}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">{messages['TeamCreation.form.fields.extraComment']}</label>
                <textarea
                  className={`${inputClasses} min-h-[120px] resize-y`}
                  value={form.extraComment}
                  onChange={handleChange('extraComment')}
                  placeholder={messages['TeamCreation.form.placeholders.extraComment']}
                />
              </div>

              {errorMessage && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-400" role="alert">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col gap-3 text-sm text-slate-500 dark:text-zinc-500">
                <p>{messages['TeamCreation.form.disclaimer']}</p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-lg font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 bg-emerald-500 hover:bg-emerald-600"
                >
                  {isSubmitting ? messages['TeamCreation.form.submitting'] : messages['TeamCreation.form.submit']}
                </button>
              </div>
            </form>
          )}

          {status === 'error' && !errorMessage && (
            <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-400" role="alert">
              {messages['TeamCreation.form.errorGeneric']}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
