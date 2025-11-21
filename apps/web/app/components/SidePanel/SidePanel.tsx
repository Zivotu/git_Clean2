"use client";

import Link from 'next/link';
import React from 'react';
import {
  LayoutDashboard,
  Gamepad2,
  AppWindow,
  User,
  DollarSign,
  FolderKanban,
  Users,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-provider';

type SidebarLabelShape = {
  title: string;
  subtitle: string;
  nav: Record<string, string>;
  creatorMode: {
    badge: string;
    title: string;
    description: string;
    steps: Array<{ title: string; text: string }>;
    memoryTitle: string;
    memoryDetails: string[];
    cta: string;
  };
};

type Source = { label: string; href: string };

type SidePanelProps = {
  className?: string;
  isDark?: boolean;
};

function SidebarItem({
  label,
  icon: Icon,
  active = false,
  isDark = false,
  href,
}: {
  label: string;
  icon: any;
  active?: boolean;
  isDark?: boolean;
  href?: string;
}) {
  const className = `group flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-300 ${active
    ? isDark
      ? 'border-[#A855F7] bg-[#18181B] text-zinc-50 shadow-[0_0_25px_rgba(168,85,247,0.25)]'
      : 'border-[#A855F7] bg-slate-50 text-slate-900 shadow-sm'
    : isDark
      ? 'border-transparent text-zinc-400 hover:border-[#27272A] hover:bg-[#18181B] hover:text-zinc-100'
      : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
    }`;
  const iconEl = (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs transition-all duration-300 ${active
        ? isDark
          ? 'border-[#A855F7]/80 bg-[#A855F7]/20 text-[#F9FAFB]'
          : 'border-[#A855F7] bg-[#A855F7]/10 text-[#4C1D95]'
        : isDark
          ? 'border-[#27272A] bg-[#09090B] text-zinc-400 group-hover:text-zinc-100'
          : 'border-slate-200 bg-white text-slate-500 group-hover:text-slate-900'
        }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
  const content = (
    <>
      {iconEl}
      <span className="flex-1 text-left">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className} prefetch={false}>
        {content}
      </Link>
    );
  }
  return (
    <button className={className} type="button">
      {content}
    </button>
  );
}

const llmSources = [
  { label: 'ChatGPT', href: 'https://chat.openai.com' },
  { label: 'Claude', href: 'https://claude.ai' },
  { label: 'Gemini', href: 'https://gemini.google.com' },
  { label: 'Perplexity', href: 'https://www.perplexity.ai' },
  { label: 'Copilot', href: 'https://copilot.microsoft.com' },
  { label: 'Kimi', href: 'https://kimi.moonshot.cn' },
] as const;

const creatorStepColors = [
  'bg-[#A855F7] text-white',
  'bg-[#22C55E] text-black',
  'bg-sky-500 text-white',
];

function formatMessage(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(String(value)),
    template,
  );
}

export default function SidePanel({
  className = '',
  isDark = false,
}: SidePanelProps) {
  const { messages } = useI18n();
  const tBeta = (key: string, fallback = '', params?: Record<string, string | number>) =>
    formatMessage((messages[`BetaHome.${key}`] as string) ?? fallback, params);

  const sidebarLabels: SidebarLabelShape = {
    title: tBeta('sidebar.title', 'Thesara Space v2.0'),
    subtitle: tBeta('sidebar.subtitle', 'From AI chats to your mini app.'),
    nav: {
      discover: tBeta('sidebar.nav.discover', 'Discover'),
      games: tBeta('sidebar.nav.games', 'Games'),
      productivity: tBeta('sidebar.nav.productivity', 'Productivity'),
      myApps: tBeta('sidebar.nav.myApps', 'My Apps'),
      paidApps: tBeta('sidebar.nav.paidApps', 'Paid Apps'),
      myProjects: tBeta('sidebar.nav.myProjects', 'Projects'),
      myCreators: tBeta('sidebar.nav.myCreators', 'Creators'),
    },
    creatorMode: {
      badge: tBeta('sidebar.creatorMode.badge', 'Creator Mode'),
      title: tBeta('sidebar.creatorMode.title', 'From AI chats to your mini app'),
      description: tBeta(
        'sidebar.creatorMode.description',
        'Stvori igru ili alat, upload-aj ga i dijeli s cijelom zajednicom.',
      ),
      steps: [
        {
          title: tBeta('sidebar.creatorMode.steps.0.title', 'Chat with your AI'),
          text: tBeta(
            'sidebar.creatorMode.steps.0.text',
            'Zatraži asistenta da isporuči mini aplikaciju.',
          ),
        },
        {
          title: tBeta('sidebar.creatorMode.steps.1.title', 'Preuzmi kod'),
          text: tBeta(
            'sidebar.creatorMode.steps.1.text',
            'Dobivaš bundle spreman za upload.',
          ),
        },
        {
          title: tBeta('sidebar.creatorMode.steps.2.title', 'Objavi na Thesari'),
          text: tBeta(
            'sidebar.creatorMode.steps.2.text',
            'Upload, potvrdi i klikni Play.',
          ),
        },
      ],
      memoryTitle: tBeta('sidebar.creatorMode.memory.title', 'Memory & Rooms'),
      memoryDetails: [
        tBeta('sidebar.creatorMode.memory.detail1', 'Dodatna memorija koju LLM-ovi nemaju.'),
        tBeta(
          'sidebar.creatorMode.memory.detail2',
          'Aktiviraj sobe kad želiš više korisnika s trajnim stanjima.',
        ),
      ],
      cta: tBeta('sidebar.creatorMode.cta', 'Open Creator Studio'),
    },
  };

  const creatorSteps = sidebarLabels.creatorMode.steps;

  return (
    <aside className={className}>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">{sidebarLabels.title}</p>
        <p className="mt-1 text-sm text-zinc-400">{sidebarLabels.subtitle}</p>
      </div>

      <nav className="space-y-1 text-base font-semibold">
        <SidebarItem label={sidebarLabels.nav.discover} icon={LayoutDashboard} active isDark={isDark} href="/" />
        <SidebarItem label={sidebarLabels.nav.paidApps} icon={DollarSign} isDark={isDark} href="/search?tag=paid" />
        <SidebarItem label={sidebarLabels.nav.myProjects ?? 'Projects'} icon={FolderKanban} isDark={isDark} href="/my" />
        <SidebarItem label={sidebarLabels.nav.myCreators ?? 'Creators'} icon={Users} isDark={isDark} href="/my-creators" />
      </nav>

      <div
        className={`mt-4 -mx-6 rounded-2xl border px-6 py-4 text-sm transition-all duration-300 ${isDark
          ? 'border-[#27272A] bg-gradient-to-br from-[#18181B] via-[#18181B] to-[#020617]'
          : 'border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100'
          }`}
      >
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#A855F7]/20 via-[#22C55E]/20 to-transparent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#A855F7]">
            <Sparkles className="mr-1 h-3 w-3" />
            <span>{sidebarLabels.creatorMode.badge}</span>
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? 'text-zinc-50' : 'text-slate-900'}`}>{sidebarLabels.creatorMode.title}</h2>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              {sidebarLabels.creatorMode.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 text-[12px]">
            {llmSources.map((provider) => (
              <a
                key={provider.href}
                href={provider.href}
                target="_blank"
                rel="noreferrer"
                className={`rounded-full border px-2 py-0.5 ${isDark ? 'border-[#27272A] bg-black/40 text-zinc-300' : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
              >
                {provider.label}
              </a>
            ))}
          </div>
          <ol className="space-y-2">
            {creatorSteps.map((step, index) => (
              <li className="flex gap-2" key={step.title}>
                <span className={`mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded-full text-center text-[10px] font-bold ${creatorStepColors[index] ?? 'bg-[#A855F7] text-white'}`}>
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className={isDark ? 'text-zinc-400' : 'text-slate-500'}>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="rounded-xl border border-dashed px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A855F7]">{sidebarLabels.creatorMode.memoryTitle}</p>
            {sidebarLabels.creatorMode.memoryDetails.map((detail) => (
              <p key={detail} className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                {detail}
              </p>
            ))}
          </div>
          <Link href="/create" className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#A855F7] via-[#A855F7] to-[#22C55E] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
            <Wand2 className="h-5 w-5" />
            <span>{sidebarLabels.creatorMode.cta}</span>
          </Link>
        </div>
      </div>

      <div className="flex-1" />
    </aside>
  );
}
