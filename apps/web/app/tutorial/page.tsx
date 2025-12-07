'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { useI18n } from '@/lib/i18n-provider';
import { tutorialTranslations, getAppIdeas } from './translations';

// --- Icons ---
const Icons = {
    Brain: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
    Code: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
    Upload: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
    Rocket: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    Volume: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>,
    Lock: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
    Globe: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    Check: () => <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
};



// --- Sub-components ---

const Background = ({ isDark }: { isDark: boolean }) => (
    <div className="pointer-events-none fixed inset-0 -z-10">
        {isDark ? (
            <>
                <div className="absolute inset-0 bg-gradient-to-br from-[#020617] via-[#0B0B10] to-[#0B0B10]" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-900/20 rounded-full blur-3xl opacity-50" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl opacity-50" />
            </>
        ) : (
            <>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-100/40 via-white to-white" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
            </>
        )}
    </div>
);

const StepCard = ({ number, title, children, isDark }: { number: number, title: string, children: React.ReactNode, isDark: boolean }) => (
    <section className="mb-12">
        <div className="flex items-center mb-6">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-bold text-lg shadow-md mr-4">
                {number}
            </div>
            <h2 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{title}</h2>
        </div>
        <div className={`rounded-2xl border shadow-sm p-6 md:p-8 transition-colors backdrop-blur-md ${isDark ? 'bg-[#18181B]/70 border-[#27272A]' : 'bg-white/70 border-gray-100'
            }`}>
            {children}
        </div>
    </section>
);

const HodogramItem = ({ icon: Icon, title, subtitle, isLast, isDark }: any) => (
    <div className="flex flex-col items-center relative z-10 group">
        <div className={`w-16 h-16 rounded-2xl border shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 group-hover:shadow-md ${isDark
            ? 'bg-[#18181B] border-[#27272A] text-emerald-400 group-hover:border-emerald-800'
            : 'bg-white border-gray-100 text-emerald-600 group-hover:border-emerald-200'
            }`}>
            <Icon />
        </div>
        <span className={`font-bold ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{title}</span>
        <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>{subtitle}</span>
    </div>
);

const Hodogram = ({ isDark }: { isDark: boolean }) => {
    return (
        <div className="relative py-8 my-8">
            {/* Connecting Line (Desktop) */}
            <div className={`hidden md:block absolute top-[2.5rem] left-0 right-0 h-0.5 -z-0 bg-gradient-to-r ${isDark ? 'from-emerald-900/30 via-emerald-800/50 to-emerald-900/30' : 'from-emerald-100 via-emerald-200 to-emerald-100'
                }`}></div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <HodogramItem icon={Icons.Brain} title="1. Ideja" subtitle="Odaberi ili smisli" isDark={isDark} />
                <HodogramItem icon={Icons.Code} title="2. AI Studio" subtitle="Gemini kuca kod" isDark={isDark} />
                <HodogramItem icon={Icons.Upload} title="3. Thesara" subtitle="Registracija i objava" isDark={isDark} />
                <HodogramItem icon={Icons.Rocket} title="4. Gotovo!" subtitle="Svi koriste tvoj app" isLast isDark={isDark} />
            </div>
        </div>
    );
};

const PromptCard = ({ app, isSelected, onClick, isDark }: any) => {
    return (
        <button
            onClick={onClick}
            className={`group relative text-left w-full rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col h-full
        ${isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg scale-[1.02]'
                    : isDark
                        ? 'border-[#27272A] bg-[#18181B] hover:border-emerald-700 hover:shadow-md'
                        : 'border-gray-200 bg-white hover:border-emerald-300 hover:shadow-md'
                }`}
        >
            <div className={`h-24 bg-gradient-to-br ${app.gradient} flex items-center justify-center`}>
                <div className="text-4xl filter drop-shadow-md transform group-hover:scale-110 transition-transform duration-300">
                    {app.icon}
                </div>
            </div>
            <div className="p-5 flex-1 flex flex-col">
                <h3 className={`font-bold mb-1 ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>{app.title}</h3>
                <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{app.description}</p>

                <div className={`mt-4 pt-4 border-t flex items-center text-xs font-medium uppercase tracking-wide ${isDark
                    ? 'border-zinc-800 text-emerald-400'
                    : 'border-gray-50 text-emerald-600'
                    }`}>
                    {isSelected ? 'Odabrano' : 'Odaberi'}
                    {isSelected && <Icons.Check />}
                </div>
            </div>
        </button>
    );
};



const AI_STUDIO_LINK = "https://aistudio.google.com/";

// --- Main Page Component ---
export default function TutorialPage() {
    const { locale } = useI18n();
    const [selectedApp, setSelectedApp] = useState<string | null>(null);
    const [isAdvanced, setIsAdvanced] = useState(false);
    const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
    const { isDark } = useTheme();

    const translations = tutorialTranslations[locale] || tutorialTranslations['en'];
    const APP_IDEAS = getAppIdeas(locale);

    const selectedIdea = APP_IDEAS.find((app: any) => app.id === selectedApp);

    const tutorialSchema = {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: `${translations.title} ${translations.titleSuffix}`,
        step: [
            {
                '@type': 'HowToStep',
                name: translations.step1Title,
                text: translations.step1AIDesc,
                image: 'https://www.thesara.space/assets/CTA_Part_1.jpg' // Optional: use a relevant image if available
            },
            {
                '@type': 'HowToStep',
                name: translations.step2Title,
                text: translations.step2Desc
            },
            {
                '@type': 'HowToStep',
                name: translations.howItWorks,
                text: translations.noServerDesc
            },
            {
                '@type': 'HowToStep',
                name: translations.publishTitle,
                text: translations.publishDesc,
                image: 'https://www.thesara.space/assets/CTA_Part_2.jpg' // Optional
            }
        ]
    };

    return (
        <div className={`min-h-screen font-sans pb-24 relative ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(tutorialSchema) }}
            />
            <Background isDark={isDark} />

            {/* Side Robot Graphic */}
            <div className="fixed right-0 top-1/2 -translate-y-1/2 hidden 2xl:block z-0 pointer-events-none">
                <img
                    src={isDark ? "/Robo_Learning_B.png" : "/Robo_Learning_W.png"}
                    alt="Learning Assistant"
                    className="max-h-[85vh] w-auto max-w-[400px] object-contain object-right drop-shadow-2xl"
                />
            </div>

            {/* Hero Section */}
            <div className="max-w-7xl mx-auto px-4 py-8 md:py-16 text-center relative z-10">
                <h1 className={`text-4xl md:text-6xl font-black mb-6 tracking-tight ${isDark ? 'text-zinc-100' : 'text-gray-900'}`}>
                    {translations.title} <br className="hidden md:block" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                        {translations.titleSuffix}
                    </span>
                </h1>
                <p className={`text-xl mb-10 max-w-2xl mx-auto leading-relaxed ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                    {translations.subtitle}
                </p>

                {/* Hodogram Component */}
                <div className="max-w-4xl mx-auto mt-16">
                    <Hodogram isDark={isDark} />
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 relative z-10">

                {/* Step 1 */}
                <StepCard number={1} title={translations.step1Title} isDark={isDark}>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className={`border p-6 rounded-xl relative overflow-hidden group transition-colors ${isDark
                            ? 'border-emerald-900/50 bg-emerald-950/20 hover:border-emerald-800'
                            : 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300'
                            }`}>
                            <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl uppercase tracking-wider">{translations.step1Rec}</div>
                            <h3 className={`font-bold text-xl mb-2 flex items-center ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>
                                {translations.step1AI}
                                <span className="ml-2 text-emerald-500 group-hover:translate-x-1 transition-transform">&rarr;</span>
                            </h3>
                            <p className={`text-sm mb-6 leading-relaxed ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                                {translations.step1AIDesc}
                            </p>
                            <a href={AI_STUDIO_LINK} target="_blank" rel="noreferrer" className={`inline-block px-4 py-2 font-medium text-sm rounded-lg transition-colors shadow-sm ${isDark
                                ? 'bg-zinc-800 border-zinc-700 text-emerald-400 hover:bg-zinc-700'
                                : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                }`}>
                                {translations.step1Open}
                            </a>
                        </div>
                        <div className={`border p-6 rounded-xl opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300 ${isDark ? 'border-zinc-800' : 'border-gray-100'
                            }`}>
                            <h3 className={`font-bold text-xl mb-2 ${isDark ? 'text-zinc-300' : 'text-gray-800'}`}>{translations.step1Other}</h3>
                            <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                {translations.step1OtherDesc}
                            </p>
                        </div>
                    </div>
                </StepCard>

                {/* Step 2 */}
                <StepCard number={2} title={translations.step2Title} isDark={isDark}>
                    <p className={`mb-8 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                        {translations.step2Desc}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 mb-8">
                        {APP_IDEAS.map((idea) => (
                            <div key={idea.id} className="h-full">
                                <PromptCard
                                    app={idea}
                                    isSelected={selectedApp === idea.id}
                                    onClick={() => setSelectedApp(idea.id)}
                                    isDark={isDark}
                                />
                            </div>
                        ))}
                    </div>

                    {selectedIdea && (
                        <div className="bg-gray-900 text-gray-200 p-1 rounded-2xl shadow-2xl animate-fade-in overflow-hidden border border-gray-800">
                            <div className="bg-gray-800 px-6 py-4 flex justify-between items-center rounded-t-xl">
                                <div className="flex space-x-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                </div>
                                <div className="text-xs font-mono text-gray-400 uppercase tracking-widest">
                                    PROMPT: {selectedIdea.title}
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(selectedIdea.prompt);
                                        alert(translations.copied);
                                    }}
                                    className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded transition-colors font-medium"
                                >
                                    {translations.copy}
                                </button>
                            </div>
                            <div className="p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap text-emerald-100/90">
                                {selectedIdea.prompt}
                            </div>
                            <div className="px-6 py-3 bg-gray-950/30 text-xs text-gray-500 italic">
                                {translations.promptNote}
                            </div>
                        </div>
                    )}
                </StepCard>

                {/* Step 3 */}
                <StepCard number={3} title={translations.howItWorks} isDark={isDark}>
                    <div className={`mb-8 p-6 rounded-2xl border text-center relative overflow-hidden ${isDark ? 'bg-[#0B0B10] border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="relative z-10">
                            <h3 className={`text-2xl font-black mb-2 tracking-tight ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>{translations.memoryTitle}</h3>
                            <p className={`text-lg mb-6 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>{translations.memorySubtitle}</p>

                            <div className="inline-flex rounded-lg p-1 bg-zinc-200/50 dark:bg-zinc-800/50 mb-6 backdrop-blur-sm">
                                <button
                                    onClick={() => setActiveTab('public')}
                                    className={`px-4 py-2Rounded-md text-sm font-bold transition-all duration-200 rounded-md ${activeTab === 'public'
                                        ? 'bg-white dark:bg-zinc-700 text-emerald-600 shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                        }`}
                                >
                                    {translations.public}
                                </button>
                                <button
                                    onClick={() => setActiveTab('private')}
                                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all duration-200 ${activeTab === 'private'
                                        ? 'bg-white dark:bg-zinc-700 text-emerald-600 shadow-sm'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                        }`}
                                >
                                    {translations.private}
                                </button>
                            </div>

                            <div className="relative aspect-[16/7] w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 bg-black/5">
                                <div className={`absolute inset-0 transition-opacity duration-500 ${activeTab === 'public' ? 'opacity-100' : 'opacity-0'}`}>
                                    <img src="/GlobalScoreBoard.jpg" alt="Global Sync Visualization" className="w-full h-full object-cover" />
                                </div>
                                <div className={`absolute inset-0 transition-opacity duration-500 ${activeTab === 'private' ? 'opacity-100' : 'opacity-0'}`}>
                                    <img src="/RoomsScoreBoard.jpg" alt="Private Rooms Visualization" className="w-full h-full object-cover" />
                                </div>
                            </div>

                            <div className={`mt-6 max-w-2xl mx-auto p-4 rounded-xl border text-left flex items-start gap-4 transition-all duration-300 ${activeTab === 'public'
                                ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
                                : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                                }`}>
                                <div className={`p-2 rounded-full ${activeTab === 'public' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                    {activeTab === 'public' ? <Icons.Globe /> : <Icons.Lock />}
                                </div>
                                <div>
                                    <h4 className={`font-bold text-base mb-1 ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>
                                        {activeTab === 'public' ? translations.public : translations.private}
                                    </h4>
                                    <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                                        {activeTab === 'public' ? translations.publicDesc : translations.privateDesc}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </StepCard>

                {/* Step 4 */}
                <StepCard number={4} title={translations.publishTitle} isDark={isDark}>
                    <p className={`mb-8 ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>
                        {translations.publishDesc}
                    </p>

                    <div className="grid md:grid-cols-2 gap-8">
                        <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-gray-50 border-gray-100'}`}>
                            <h3 className={`font-bold mb-4 pb-2 border-b ${isDark ? 'text-zinc-100 border-zinc-800' : 'text-gray-900 border-gray-200'}`}>{translations.required}</h3>
                            <ul className={`space-y-4 text-sm ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                                <li className="flex items-start">
                                    <div className="bg-emerald-100 text-emerald-600 rounded-full p-1 mr-3 mt-0.5"><Icons.Check /></div>
                                    <span><strong>{translations.appName}</strong><br />{translations.appNameDesc}</span>
                                </li>
                                <li className="flex items-start">
                                    <div className="bg-emerald-100 text-emerald-600 rounded-full p-1 mr-3 mt-0.5"><Icons.Check /></div>
                                    <span><strong>{translations.uploadCode}</strong><br />{translations.uploadCodeDesc}</span>
                                </li>
                                <li className="flex items-start">
                                    <div className="bg-emerald-100 text-emerald-600 rounded-full p-1 mr-3 mt-0.5"><Icons.Check /></div>
                                    <span><strong>{translations.category}</strong><br />{translations.categoryDesc}</span>
                                </li>
                            </ul>
                        </div>

                        <div className={`p-6 rounded-2xl border border-dashed ${isDark ? 'bg-black/20 border-zinc-800' : 'bg-white border-gray-300'}`}>
                            <h3 className={`font-bold mb-4 pb-2 border-b ${isDark ? 'text-zinc-500 border-zinc-900' : 'text-gray-500 border-gray-100'}`}>{translations.optional}</h3>
                            <ul className={`space-y-4 text-sm ${isDark ? 'text-zinc-500' : 'text-gray-600'}`}>
                                <li className="flex items-start opacity-75">
                                    <span className="w-6 h-6 flex items-center justify-center mr-3 text-gray-400 text-xs">●</span>
                                    <span><strong>{translations.desc}</strong> {translations.descDesc}</span>
                                </li>
                                <li className="flex items-start opacity-75">
                                    <span className="w-6 h-6 flex items-center justify-center mr-3 text-gray-400 text-xs">●</span>
                                    <span><strong>{translations.price}</strong> {translations.priceDesc}</span>
                                </li>
                                <li className="flex items-start opacity-75">
                                    <span className="w-6 h-6 flex items-center justify-center mr-3 text-gray-400 text-xs">●</span>
                                    <span><strong>{translations.rooms}</strong> {translations.roomsDesc}</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-10 text-center">
                        <Link href="/" className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-full text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1">
                            {translations.goToThesara}
                            <svg className="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </Link>
                        <p className="text-sm text-gray-500 mt-4 font-medium">{translations.firstFree}</p>
                    </div>
                </StepCard>

                {/* Advanced Settings Toggle */}
                <div className="mt-12 mb-20 text-center">
                    <button
                        onClick={() => setIsAdvanced(!isAdvanced)}
                        className="text-sm font-medium text-gray-500 hover:text-emerald-600 transition-colors inline-flex items-center"
                    >
                        {isAdvanced ? translations.advancedToggleHide : translations.advancedToggle}
                    </button>

                    {isAdvanced && (
                        <div className={`mt-6 p-6 rounded-2xl border text-left max-w-2xl mx-auto text-sm shadow-inner ${isDark
                            ? 'bg-zinc-900/50 border-zinc-800 text-zinc-400'
                            : 'bg-gray-50 border-gray-200 text-gray-600'
                            }`}>
                            <h4 className={`font-bold mb-3 ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>{translations.advancedTitle}</h4>
                            <p className="mb-3">
                                {translations.advancedDesc1}
                            </p>
                            <p>
                                {translations.advancedDesc2}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
