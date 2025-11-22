'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';
import { useAuth } from '@/lib/auth';

export default function FeedbackPage() {
    const { isDark } = useTheme();
    const { messages } = useI18n();
    const { user } = useAuth();
    const router = useRouter();

    const [name, setName] = useState(user?.displayName || '');
    const [email, setEmail] = useState(user?.email || '');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (message.trim().length < 5) {
            setErrorMessage(messages['Feedback.errorMessage'] || 'Message too short');
            return;
        }

        setStatus('sending');
        setErrorMessage('');

        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim(),
                    message: message.trim(),
                    page: window.location.href,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to send feedback');
            }

            setStatus('success');
            setMessage('');
            setTimeout(() => {
                router.push('/');
            }, 2000);
        } catch (error) {
            setStatus('error');
            setErrorMessage(messages['Feedback.errorGeneric'] || 'Failed to send feedback. Please try again.');
        }
    };

    return (
        <div className={`min-h-screen pb-20 pt-32 transition-colors duration-300 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
            <div className="mx-auto max-w-2xl px-4">
                <div className={`rounded-2xl border p-8 ${isDark ? 'border-[#27272A] bg-[#18181B]' : 'border-slate-200 bg-white shadow-sm'}`}>
                    <h1 className={`text-3xl font-bold mb-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                        {messages['Feedback.title'] || 'Feedback'}
                    </h1>
                    <p className={`mb-8 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                        {messages['Feedback.description'] || 'Share your suggestions and feedback with us.'}
                    </p>

                    {status === 'success' ? (
                        <div className="rounded-xl bg-emerald-500/10 border border-emerald-600/40 p-6 text-center">
                            <p className="text-emerald-400 font-semibold">
                                {messages['Feedback.successMessage'] || 'Thank you! We will review your feedback.'}
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                                    {messages['Feedback.nameLabel'] || 'Your name'}
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={`w-full rounded-xl border px-4 py-3 transition ${isDark
                                            ? 'border-[#27272A] bg-[#09090B] text-zinc-100 focus:border-[#A855F7]'
                                            : 'border-slate-200 bg-white text-slate-900 focus:border-slate-400'
                                        }`}
                                    placeholder={messages['Feedback.nameLabel'] || 'Your name'}
                                />
                            </div>

                            <div>
                                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                                    {messages['Feedback.emailLabel'] || 'Email'}
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className={`w-full rounded-xl border px-4 py-3 transition ${isDark
                                            ? 'border-[#27272A] bg-[#09090B] text-zinc-100 focus:border-[#A855F7]'
                                            : 'border-slate-200 bg-white text-slate-900 focus:border-slate-400'
                                        }`}
                                    placeholder={messages['Feedback.emailLabel'] || 'your@email.com'}
                                />
                            </div>

                            <div>
                                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                                    {messages['Feedback.messageLabel'] || 'Your message'}
                                </label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    required
                                    rows={6}
                                    className={`w-full rounded-xl border px-4 py-3 transition resize-none ${isDark
                                            ? 'border-[#27272A] bg-[#09090B] text-zinc-100 focus:border-[#A855F7]'
                                            : 'border-slate-200 bg-white text-slate-900 focus:border-slate-400'
                                        }`}
                                    placeholder={messages['Feedback.messagePlaceholder'] || 'Share your thoughts...'}
                                />
                            </div>

                            {errorMessage && (
                                <div className="rounded-xl bg-red-500/10 border border-red-600/40 p-4">
                                    <p className="text-red-400 text-sm">{errorMessage}</p>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => router.back()}
                                    className={`flex-1 rounded-xl border px-6 py-3 font-semibold transition ${isDark
                                            ? 'border-[#27272A] text-zinc-300 hover:bg-[#27272A]'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                >
                                    {messages['Feedback.cancel'] || 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={status === 'sending'}
                                    className="flex-1 rounded-xl bg-[#16A34A] px-6 py-3 font-semibold text-white transition hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {status === 'sending'
                                        ? (messages['Feedback.sending'] || 'Sending...')
                                        : (messages['Feedback.send'] || 'Send')}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
