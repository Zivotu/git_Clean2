'use client';

import { useState, useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n-provider';
import AmbassadorApplicationModal from '@/components/AmbassadorApplicationModal';
import FeedbackModal from '@/components/FeedbackModal';

// Configuration
const GOLD_PRICE = 10; // €10/month
const COMMISSION_RATE = 0.55; // 55%
const COMMISSION_AMOUNT = GOLD_PRICE * COMMISSION_RATE; // €5.50
const DISCOUNT_1ST_MONTH = 0.40; // 40% OFF
const DISCOUNT_2ND_MONTH = 0.50; // 50% OFF
const PRICE_1ST_MONTH = GOLD_PRICE * (1 - DISCOUNT_1ST_MONTH); // €6.00
const ATTRIBUTION_DAYS = 60;
const PAYOUT_THRESHOLD = 50; // €50

export default function AmbassadorPage() {
    const t = useT('Ambassador');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    // Auto-open modal if query param is set (e.g. from login redirect)
    const hasCheckedQueryParam = useRef(false);

    useEffect(() => {
        if (hasCheckedQueryParam.current) return;
        hasCheckedQueryParam.current = true;

        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('openAmbassador') === 'true') {
                setIsModalOpen(true);
                // Clean URL
                setTimeout(() => {
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                }, 300);
            }
        }
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white dark:from-zinc-950 dark:via-emerald-950/20 dark:to-zinc-950">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-600 dark:from-emerald-800 dark:via-emerald-900 dark:to-teal-900 text-white">
                <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
                    <div className="text-center">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-semibold">
                            <span className="flex h-2 w-2">
                                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-200 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
                            </span>
                            {t('hero.badge')}
                        </div>
                        <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                            {t('hero.title')}
                            <br />
                            {t('hero.subtitle')}
                        </h1>
                        <p className="mx-auto mb-8 max-w-2xl text-lg sm:text-xl text-emerald-50">
                            {t('hero.description')}
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="group relative inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-semibold text-emerald-700 shadow-2xl shadow-emerald-900/50 transition-all hover:scale-105 hover:shadow-emerald-900/60"
                            >
                                <span>{t('hero.ctaPrimary')}</span>
                                <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                            <a href="#kako-funkcionira">
                                <button className="inline-flex items-center gap-2 rounded-xl border-2 border-white/30 bg-white/10 backdrop-blur-sm px-8 py-4 text-lg font-semibold text-white transition-all hover:bg-white/20">
                                    {t('hero.ctaSecondary')}
                                </button>
                            </a>
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-zinc-950 to-transparent" />
            </section>

            {/* Stats Section */}
            <section className="py-12 -mt-8">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-6 sm:grid-cols-3 rounded-2xl bg-white dark:bg-zinc-900 p-8 shadow-xl border border-gray-100 dark:border-zinc-800">
                        <div className="text-center">
                            <div className="mb-2 text-4xl font-bold text-emerald-600 dark:text-emerald-400">55-70%</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.commission')}</div>
                        </div>
                        <div className="text-center border-x border-gray-200 dark:border-zinc-800">
                            <div className="mb-2 text-4xl font-bold text-emerald-600 dark:text-emerald-400">40% OFF</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.discount')}</div>
                        </div>
                        <div className="text-center">
                            <div className="mb-2 text-4xl font-bold text-emerald-600 dark:text-emerald-400">€{PAYOUT_THRESHOLD}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{t('stats.threshold')}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* User Benefit - Discount Section */}
            <section className="py-12">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="rounded-3xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-8 sm:p-12 text-white shadow-2xl">
                        <div className="text-center">
                            <div className="text-6xl mb-4">🎉</div>
                            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
                                {t('discount.title')}
                            </h2>
                            <p className="text-xl text-white/90 mb-6 max-w-2xl mx-auto">
                                {t('discount.subtitle')}
                            </p>
                            <div className="rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 p-6 sm:p-8 max-w-2xl mx-auto">
                                <div className="text-5xl font-bold mb-2">
                                    {t('discount.amount')}
                                </div>
                                <div className="text-2xl font-semibold mb-4">
                                    {t('discount.detail')}
                                </div>
                                <p className="text-white/90 text-lg">
                                    {t('discount.calculation')}
                                </p>
                            </div>
                            <div className="mt-8 text-lg text-white/90">
                                {t('discount.benefit')}
                                <br />
                                {t('discount.hook')}
                            </div>
                        </div>
                    </div>
                </div>
            </section>


            {/* How It Works */}
            <section id="kako-funkcionira" className="py-20">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 sm:text-4xl mb-4">
                            {t('howItWorks.title')}
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            {t('howItWorks.subtitle')}
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-3">
                        {[
                            { step: '1', icon: '📝', key: 'apply' },
                            { step: '2', icon: '📢', key: 'share' },
                            { step: '3', icon: '💰', key: 'earn' },
                        ].map((item) => (
                            <div
                                key={item.step}
                                className="relative rounded-2xl border-2 border-emerald-100 dark:border-emerald-900/30 bg-white dark:bg-zinc-900 p-8 shadow-sm transition-all hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-800"
                            >
                                <div className="absolute -top-4 -left-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-xl font-bold text-white shadow-lg">
                                    {item.step}
                                </div>
                                <div className="mb-4 text-5xl">{item.icon}</div>
                                <h3 className="mb-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
                                    {t(`howItWorks.steps.${item.key}.title`)}
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {t(`howItWorks.steps.${item.key}.description`, { amount: COMMISSION_AMOUNT.toFixed(2) })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Earning Models Section */}
            <section className="py-20 bg-gray-50 dark:bg-zinc-900 border-y border-gray-200 dark:border-zinc-800">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 sm:text-4xl mb-4">
                            {t('models.title')}
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            {t('models.subtitle')}
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
                        {/* Turbo Model */}
                        <div className="relative rounded-3xl border-2 border-emerald-500 bg-white dark:bg-zinc-900 p-8 shadow-2xl overflow-hidden group hover:scale-[1.02] transition-transform">
                            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                {t('models.turbo.badge')}
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                                {t('models.turbo.title')}
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6 min-h-[3rem]">
                                {t('models.turbo.description')}
                            </p>
                            <ul className="space-y-4 mb-8">
                                <li className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    </div>
                                    <span className="font-semibold text-lg">{t('models.turbo.payout1')}</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600 dark:text-emerald-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <span>{t('models.turbo.payout2')}</span>
                                </li>
                                <li className="flex items-center gap-3 opacity-50">
                                    <div className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-lg text-gray-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </div>
                                    <span>{t('models.turbo.sales')}</span>
                                </li>
                            </ul>
                            <button onClick={() => setIsModalOpen(true)} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">
                                {t('howItWorks.steps.apply.title')}
                            </button>
                        </div>

                        {/* Partner Model */}
                        <div className="relative rounded-3xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50 p-8 hover:bg-white dark:hover:bg-zinc-900 hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-900/50 transition-all hover:scale-[1.02]">
                            <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                {t('models.partner.badge')}
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                                {t('models.partner.title')}
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6 min-h-[3rem]">
                                {t('models.partner.description')}
                            </p>
                            <ul className="space-y-4 mb-8">
                                <li className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </div>
                                    <span className="font-semibold text-lg">{t('models.partner.payout1')}</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <span>{t('models.partner.payout2')}</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                                    </div>
                                    <span>{t('models.partner.sales')}</span>
                                </li>
                            </ul>
                            <button onClick={() => setIsModalOpen(true)} className="w-full py-3 rounded-xl border-2 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                {t('howItWorks.steps.apply.title')}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Key Benefits */}
            <section className="py-20 bg-gradient-to-br from-gray-50 to-emerald-50/30 dark:from-zinc-900 dark:to-emerald-950/20">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 sm:text-4xl mb-4">
                            {t('benefits.title')}
                        </h2>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        {[
                            { icon: '💰', key: 'commission', rate: '10-70%', price: GOLD_PRICE, earned: COMMISSION_AMOUNT.toFixed(2) },
                            { icon: '🎁', key: 'offer' },
                            { icon: '📊', key: 'dashboard' },
                            { icon: '⏰', key: 'window', days: ATTRIBUTION_DAYS },
                            { icon: '💳', key: 'payout', threshold: PAYOUT_THRESHOLD },
                            { icon: '🎯', key: 'kit' },
                        ].map((item) => (
                            <div
                                key={item.key}
                                className="flex gap-4 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm transition-all hover:shadow-md"
                            >
                                <div className="flex-shrink-0 text-4xl">{item.icon}</div>
                                <div>
                                    <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                                        {t(`benefits.items.${item.key}.title`, item as any)}
                                    </h3>
                                    <p className="text-gray-600 dark:text-gray-400">
                                        {t(`benefits.items.${item.key}.description`, item as any)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bonus Tiers */}
            <section className="py-20">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 sm:text-4xl mb-4">
                            {t('tiers.title')}
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                            {t('tiers.subtitle')}
                        </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        {[
                            { key: 'bronze', count: 5, color: 'from-amber-700 to-amber-600', icon: '🥉' },
                            { key: 'silver', count: 15, color: 'from-gray-400 to-gray-300', icon: '🥈' },
                            { key: 'gold', count: 30, color: 'from-yellow-500 to-amber-400', icon: '🥇' },
                        ].map((tier) => (
                            <div
                                key={tier.key}
                                className="relative overflow-hidden rounded-2xl border-2 border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-lg hover:shadow-xl transition-all"
                            >
                                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${tier.color} opacity-10 rounded-full -translate-y-16 translate-x-16`}></div>
                                <div className="relative">
                                    <div className="text-5xl mb-4">{tier.icon}</div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                                        {t(`tiers.levels.${tier.key}.title`)}
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                        {t(`tiers.levels.${tier.key}.conversions`, { count: tier.count })}
                                    </p>
                                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4">
                                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                                            🎁 {t(`tiers.levels.${tier.key}.reward`)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 rounded-xl p-4 inline-block">
                            ℹ️ {t('tiers.note')}
                        </p>
                    </div>
                </div>
            </section>

            {/* Calculator - Dual Model Comparison */}
            <section className="py-20 bg-gray-50 dark:bg-zinc-900">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('calculator.title')}</h2>
                        <p className="text-gray-600 dark:text-gray-400">{t('calculator.subtitle')}</p>
                    </div>

                    {/* Fun Fact */}
                    <div className="mb-12 max-w-4xl mx-auto">
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 p-8 text-white shadow-xl">
                            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10"></div>
                            <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-32 w-32 rounded-full bg-white/10"></div>
                            <div className="relative">
                                <div className="flex items-start gap-4">
                                    <div className="text-4xl">🚀</div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold mb-2">{t('calculator.funFact.title')}</h3>
                                        <p className="text-purple-100 mb-3">
                                            <strong className="text-white">{t('calculator.funFact.chatgpt')}</strong>{t('calculator.funFact.description', { platform: t('calculator.funFact.thesara') })}
                                        </p>
                                        <p className="text-sm text-purple-200">
                                            {t('calculator.funFact.market', { explodes: t('calculator.funFact.explodes') })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* TURBO Model Calculator */}
                        <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 p-8 text-white shadow-2xl">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-4">
                                    <span className="text-2xl">🚀</span>
                                    <span className="font-bold">{t('calculator.turbo.title')}</span>
                                </div>
                                <p className="text-emerald-100 text-sm">{t('calculator.turbo.subtitle')}</p>
                            </div>

                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 space-y-6">
                                <div className="text-center">
                                    <div className="text-emerald-100 text-sm mb-2">{t('calculator.turbo.with', { count: 100 })}</div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                                        <span className="text-sm">{t('calculator.turbo.month1')}</span>
                                        <span className="font-bold text-lg">€{(100 * PRICE_1ST_MONTH * 0.55).toFixed(0)}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                                        <span className="text-sm">{t('calculator.turbo.month2')}</span>
                                        <span className="font-bold text-lg">€{(100 * (GOLD_PRICE * (1 - DISCOUNT_2ND_MONTH)) * 0.15).toFixed(0)}</span>
                                    </div>
                                </div>

                                <div className="border-t border-white/20 pt-4">
                                    <div className="rounded-xl bg-white p-4 text-center">
                                        <div className="text-sm text-gray-600 mb-1">{t('calculator.turbo.total')}</div>
                                        <div className="text-4xl font-bold text-emerald-600">
                                            €{((100 * PRICE_1ST_MONTH * 0.55) + (100 * (GOLD_PRICE * (1 - DISCOUNT_2ND_MONTH)) * 0.15)).toFixed(0)}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-center text-xs text-emerald-100">
                                    {t('calculator.turbo.examples', {
                                        count1: 50,
                                        amount1: ((50 * PRICE_1ST_MONTH * 0.55) + (50 * (GOLD_PRICE * (1 - DISCOUNT_2ND_MONTH)) * 0.15)).toFixed(0),
                                        count2: 200,
                                        amount2: ((200 * PRICE_1ST_MONTH * 0.55) + (200 * (GOLD_PRICE * (1 - DISCOUNT_2ND_MONTH)) * 0.15)).toFixed(0)
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* PARTNER Model Calculator */}
                        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 p-8 text-white shadow-2xl">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-4">
                                    <span className="text-2xl">💎</span>
                                    <span className="font-bold">{t('calculator.partner.title')}</span>
                                </div>
                                <p className="text-blue-100 text-sm">{t('calculator.partner.subtitle')}</p>
                            </div>

                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 space-y-6">
                                <div className="text-center">
                                    <div className="text-blue-100 text-sm mb-2">{t('calculator.partner.with', { count: 100 })}</div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                                        <span className="text-sm">{t('calculator.partner.month1')}</span>
                                        <span className="font-bold text-lg">€{(100 * PRICE_1ST_MONTH * 0.10).toFixed(0)}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                                        <span className="text-sm">{t('calculator.partner.month2')}</span>
                                        <span className="font-bold text-lg">€{(100 * (GOLD_PRICE * (1 - DISCOUNT_2ND_MONTH)) * 0.10).toFixed(0)}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                                        <span className="text-sm">{t('calculator.partner.month3plus')}</span>
                                        <span className="font-bold text-lg">€{(100 * GOLD_PRICE * 0.10).toFixed(0)}/mj</span>
                                    </div>
                                </div>

                                <div className="border-t border-white/20 pt-4">
                                    <div className="rounded-xl bg-white p-4 text-center">
                                        <div className="text-sm text-gray-600 mb-1">{t('calculator.partner.recurring')}</div>
                                        <div className="text-4xl font-bold text-blue-600">
                                            €{(100 * GOLD_PRICE * 0.10).toFixed(0)}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">{t('calculator.partner.fromGold')}</div>
                                    </div>
                                </div>

                                {/* App Sales Bonus */}
                                <div className="border-t border-white/20 pt-4">
                                    <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-xl p-4 border border-yellow-400/30">
                                        <div className="text-center mb-3">
                                            <div className="text-sm font-semibold text-yellow-200 mb-1">{t('calculator.partner.appSales.title')}</div>
                                            <div className="text-xs text-blue-100">{t('calculator.partner.appSales.description')}</div>
                                        </div>
                                        <div className="space-y-2 text-xs text-white">
                                            <div className="bg-white/10 rounded p-2">
                                                <div className="flex justify-between mb-1">
                                                    <span>{t('calculator.partner.appSales.userExample')}</span>
                                                    <span className="font-bold">€500/mj</span>
                                                </div>
                                                <div className="flex justify-between text-yellow-200">
                                                    <span className="ml-2">{t('calculator.partner.appSales.yourEarning')}</span>
                                                    <span className="font-bold">€50/mj</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded p-2 border border-yellow-400/40">
                                                <span className="font-bold">{t('calculator.partner.appSales.creators')}</span>
                                                <span className="font-bold text-yellow-200 text-lg">~€500/mj</span>
                                            </div>
                                        </div>
                                        <div className="text-center mt-3 text-xs text-yellow-100">
                                            {t('calculator.partner.appSales.passive')}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-center text-xs text-blue-100">
                                    {t('calculator.partner.examples', {
                                        count1: 50,
                                        amount1: (50 * GOLD_PRICE * 0.10).toFixed(0),
                                        count2: 200,
                                        amount2: (200 * GOLD_PRICE * 0.10).toFixed(0)
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
                        <p>{t('calculator.note')}</p>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-20">
                <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 sm:text-4xl mb-4">
                            {t('faq.title')}
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {['influencer', 'where', 'timing', 'privacy', 'multiple', 'rules'].map((key) => (
                            <details
                                key={key}
                                className="group rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm transition-all hover:shadow-md"
                            >
                                <summary className="flex cursor-pointer items-start justify-between gap-4 font-semibold text-gray-900 dark:text-gray-100">
                                    <span>{t(`faq.items.${key}.q`, { days: ATTRIBUTION_DAYS })}</span>
                                    <svg
                                        className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400 transition-transform group-open:rotate-180"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </summary>
                                <p className="mt-4 text-gray-600 dark:text-gray-400">
                                    {t(`faq.items.${key}.a`, { days: ATTRIBUTION_DAYS })}
                                </p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            {/* Custom Plan Section */}
            <section className="py-20 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20">
                <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    <div className="rounded-3xl bg-white dark:bg-zinc-900 border-2 border-purple-200 dark:border-purple-900/30 p-8 sm:p-12 shadow-xl">
                        <div className="text-center">
                            <div className="text-5xl mb-4">🤝</div>
                            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                                {t('customPlan.title')}
                            </h2>
                            <p className="text-lg text-purple-600 dark:text-purple-400 font-semibold mb-6">
                                {t('customPlan.subtitle')}
                            </p>
                            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
                                {t('customPlan.description')}
                            </p>
                            <div className="space-y-4">
                                <p className="text-gray-700 dark:text-gray-300">
                                    {t('customPlan.contact', { email: '' })}
                                    <a
                                        href="mailto:welcome@thesara.space"
                                        className="font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 underline"
                                    >
                                        {t('customPlan.email')}
                                    </a>
                                </p>
                                <button
                                    onClick={() => setIsFeedbackModalOpen(true)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-purple-700 hover:scale-105"
                                >
                                    <span>{t('customPlan.cta')}</span>
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20">
                <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-600 dark:from-emerald-800 dark:via-emerald-900 dark:to-teal-900 p-12 text-center text-white shadow-2xl">
                        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
                        <div className="relative">
                            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
                                {t('finalCta.title')}
                            </h2>
                            <p className="text-xl text-emerald-50 mb-8 max-w-2xl mx-auto">
                                {t('finalCta.subtitle')}
                            </p>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-semibold text-emerald-700 shadow-2xl transition-all hover:scale-105"
                            >
                                <span>{t('finalCta.button')}</span>
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </button>
                            <p className="mt-6 text-sm text-emerald-100">
                                {t('finalCta.questions', { email: '' })}
                                <a href="mailto:support@thesara.space" className="underline font-semibold">support@thesara.space</a>
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <AmbassadorApplicationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />

            <FeedbackModal
                open={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
            />
        </div>
    );
}
