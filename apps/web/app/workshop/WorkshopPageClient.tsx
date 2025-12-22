'use client';
import { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Clock, Users, Sparkles, CheckCircle, Video, Zap } from 'lucide-react';
import Link from 'next/link';

type WorkshopTranslations = {
    badge: string;
    title: string;
    subtitle: string;
    countdownLabel: string;
    countdownDays: string;
    countdownHours: string;
    featuresLive: string;
    featuresDuration: string;
    featuresFree: string;
    featuresBeginners: string;
    formTitle: string;
    formEmail: string;
    formEmailPlaceholder: string;
    formSubmit: string;
    formSubmitting: string;
    formSuccess: string;
    formError: string;
    formInvalidEmail: string;
    detailsWhen: string;
    detailsDate: string;
    detailsTime: string;
    detailsWhat: string;
    detailsTopics: string[];
    backToHome: string;
    daysUnit: string;
    hoursUnit: string;
    privacyNote: string;
    languageNote: string;
};


type WorkshopPageClientProps = {
    translations: WorkshopTranslations;
};

export default function WorkshopPageClient({ translations: t }: WorkshopPageClientProps) {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [pulseIntensity, setPulseIntensity] = useState(1);

    // Animated pulse effect
    useEffect(() => {
        const interval = setInterval(() => {
            setPulseIntensity(prev => (prev === 1 ? 1.3 : 1));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setErrorMessage(t.formInvalidEmail);
            setSubmitStatus('error');
            return;
        }

        setIsSubmitting(true);
        setSubmitStatus('idle');
        setErrorMessage('');

        try {
            const response = await fetch('/api/workshop/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            if (response.ok) {
                setSubmitStatus('success');
                setEmail('');
            } else {
                throw new Error('Registration failed');
            }
        } catch (error) {
            setSubmitStatus('error');
            setErrorMessage(t.formError);
        } finally {
            setIsSubmitting(false);
        }
    };

    const workshopDate = new Date('2025-12-29T20:00:00');
    const now = new Date();
    const timeDiff = workshopDate.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
    const hoursLeft = Math.max(0, Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100 dark:from-slate-950 dark:via-purple-950 dark:to-slate-900">
            {/* Animated background particles */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-20 right-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            {/* Header */}
            <div className="relative border-b border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-950/50 backdrop-blur-sm">
                <div className="mx-auto max-w-6xl px-4 py-4">
                    <Link href="/" className="inline-flex items-center gap-2 text-slate-600 transition-colors hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400">
                        <ArrowLeft className="h-4 w-4" />
                        <span>{t.backToHome}</span>
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative mx-auto max-w-6xl px-4 py-12">
                <div className="grid gap-8 lg:grid-cols-2">
                    {/* Left Column - Info */}
                    <div className="space-y-8">
                        {/* Animated Badge */}
                        <div
                            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all"
                            style={{
                                borderColor: `rgba(34, 197, 94, ${pulseIntensity * 0.4})`,
                                backgroundColor: `rgba(34, 197, 94, ${pulseIntensity * 0.1})`,
                                boxShadow: `0 0 ${20 * pulseIntensity}px rgba(34, 197, 94, 0.3)`,
                            }}
                        >
                            <Sparkles className="h-4 w-4 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
                            <span className="text-emerald-400">{t.badge}</span>
                        </div>

                        {/* Title with glow */}
                        <div>
                            <h1 className="text-4xl font-bold leading-tight text-slate-900 dark:text-white md:text-5xl">
                                {t.title}
                            </h1>
                            <p className="mt-4 text-xl text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                <Zap className="h-5 w-5 text-yellow-500 dark:text-yellow-400 animate-pulse" />
                                {t.subtitle}
                            </p>

                            {/* Language Note */}
                            <p className="mt-2 text-sm font-medium text-purple-600 dark:text-purple-300 flex items-center gap-2">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                                {t.languageNote}
                            </p>
                        </div>

                        {/* Animated Countdown */}
                        <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-6 transform transition-transform hover:scale-[1.02]">
                            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300 flex items-center gap-2">
                                <Clock className="h-4 w-4 animate-pulse" />
                                {t.countdownLabel}
                            </p>
                            <div className="flex gap-4">
                                <div className="text-center transform transition-transform hover:scale-110">
                                    <div className="text-4xl font-bold text-slate-900 dark:text-white bg-gradient-to-br from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                                        {daysLeft}
                                    </div>
                                    <div className="text-sm text-slate-500 dark:text-slate-400">{t.daysUnit}</div>
                                </div>
                                <div className="text-center transform transition-transform hover:scale-110">
                                    <div className="text-4xl font-bold text-slate-900 dark:text-white bg-gradient-to-br from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                                        {hoursLeft}
                                    </div>
                                    <div className="text-sm text-slate-500 dark:text-slate-400">{t.hoursUnit}</div>
                                </div>
                            </div>
                        </div>

                        {/* Features Grid with hover effects */}
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { icon: Video, label: t.featuresLive, color: 'text-blue-400' },
                                { icon: Clock, label: t.featuresDuration, color: 'text-yellow-400' },
                                { icon: CheckCircle, label: t.featuresFree, color: 'text-emerald-400' },
                                { icon: Users, label: t.featuresBeginners, color: 'text-purple-400' },
                            ].map((feature, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100/50 p-4 transition-all hover:border-emerald-500/50 hover:bg-slate-200 hover:scale-105 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                                >
                                    <feature.icon className={`h-5 w-5 ${feature.color}`} />
                                    <span className="text-sm text-slate-700 dark:text-slate-200">{feature.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Details with animation */}
                        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white/40 p-6 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/50">
                            <div className="transform transition-all hover:translate-x-1">
                                <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                                    <Calendar className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                                    {t.detailsWhen}
                                </h3>
                                <p className="text-slate-600 dark:text-slate-300">
                                    {t.detailsDate} {t.detailsTime}
                                </p>
                            </div>

                            <div>
                                <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">
                                    {t.detailsWhat}
                                </h3>
                                <ul className="space-y-2">
                                    {t.detailsTopics.map((topic, idx) => (
                                        <li
                                            key={idx}
                                            className="flex items-start gap-2 text-slate-600 dark:text-slate-300 transform transition-all hover:translate-x-2"
                                            style={{ animationDelay: `${idx * 100}ms` }}
                                        >
                                            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
                                            <span>{topic}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Registration Form */}
                    <div className="lg:sticky lg:top-8 lg:h-fit">
                        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-white/80 to-slate-50/80 p-8 shadow-2xl backdrop-blur-sm transform transition-all hover:scale-[1.02] dark:from-slate-800/80 dark:to-slate-900/80">
                            <h2 className="mb-6 text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Sparkles className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
                                {t.formTitle}
                            </h2>

                            {submitStatus === 'success' ? (
                                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center animate-in fade-in zoom-in duration-500">
                                    <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-400 animate-bounce" />
                                    <p className="text-lg font-semibold text-emerald-300">
                                        {t.formSuccess}
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div>
                                        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {t.formEmail}
                                        </label>
                                        <input
                                            type="email"
                                            id="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder={t.formEmailPlaceholder}
                                            required
                                            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:scale-[1.02] dark:border-slate-600 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-500"
                                        />
                                    </div>

                                    {submitStatus === 'error' && errorMessage && (
                                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 animate-in fade-in slide-in-from-top-2">
                                            {errorMessage}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-4 font-bold text-white shadow-lg transition-all hover:from-emerald-600 hover:to-green-700 hover:shadow-xl hover:scale-[1.05] disabled:opacity-50 disabled:hover:scale-100"
                                    >
                                        {isSubmitting ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                {t.formSubmitting}
                                            </span>
                                        ) : (
                                            t.formSubmit
                                        )}
                                    </button>
                                </form>
                            )}

                            {/* Privacy note */}
                            <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
                                {t.privacyNote}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
