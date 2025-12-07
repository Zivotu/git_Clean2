"use client";

import Link from 'next/link';
import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  ToggleLeft,
  ToggleRight,
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
  onClick,
}: {
  label: string;
  icon: any;
  active?: boolean;
  isDark?: boolean;
  href?: string;
  onClick?: () => void;
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
    const isExternal = href.startsWith('http');
    return (
      <Link
        href={href}
        className={className}
        prefetch={false}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
      >
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className} type="button">
      {content}
    </button>
  );
}

const llmSources = [
  { label: 'Google AI Studio', href: 'https://aistudio.google.com/apps', highlight: true },
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
  const router = useRouter();
  const pathname = usePathname();
  const tBeta = (key: string, fallback = '', params?: Record<string, string | number>) =>
    formatMessage((messages[`BetaHome.${key}`] as string) ?? fallback, params);

  const [roboHover, setRoboHover] = React.useState(false);
  const [roboText, setRoboText] = React.useState('');
  const [activeLight, setActiveLight] = React.useState(0);
  const [ledActive, setLedActive] = React.useState(true);
  const roboMessage = tBeta(
    'sidebar.roboMessage',
    "TUTORIAL\nFrom\nIdea\nto a\nPublished\nApp\non\nThesara"
  );
  const isTutorial = pathname === '/tutorial';

  // Robo type effect
  React.useEffect(() => {
    if (roboHover) {
      let i = 0;
      setRoboText('');
      const timer = setInterval(() => {
        setRoboText(roboMessage.slice(0, i + 1));
        i++;
        if (i >= roboMessage.length) clearInterval(timer);
      }, 50);
      return () => clearInterval(timer);
    } else {
      setRoboText('');
    }
  }, [roboHover, roboMessage]);

  // Lights effect
  React.useEffect(() => {
    if (isTutorial) {
      const interval = setInterval(() => {
        setActiveLight((prev) => (prev + 1) % 6);
      }, 600);
      return () => clearInterval(interval);
    }
  }, [isTutorial]);

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
        'Create a game or tool, upload it, and share it with the whole community.',
      ),
      steps: [
        {
          title: tBeta('sidebar.creatorMode.steps.0.title', 'Chat with your AI'),
          text: tBeta('sidebar.creatorMode.steps.0.text', 'Ask the assistant to deliver a mini app.'),
        },
        {
          title: tBeta('sidebar.creatorMode.steps.1.title', 'Download the code'),
          text: tBeta('sidebar.creatorMode.steps.1.text', 'You get a bundle ready to upload.'),
        },
        {
          title: tBeta('sidebar.creatorMode.steps.2.title', 'Publish on Thesara'),
          text: tBeta('sidebar.creatorMode.steps.2.text', 'Upload, confirm, and click Play.'),
        },
      ],
      memoryTitle: tBeta('sidebar.creatorMode.memory.title', 'Memory & Rooms'),
      memoryDetails: [
        tBeta('sidebar.creatorMode.memory.detail1', "Additional memory that LLMs don't have."),
        tBeta(
          'sidebar.creatorMode.memory.detail2',
          'Activate rooms when you need more users with persistent state.',
        ),
      ],
      cta: tBeta('sidebar.creatorMode.cta', 'Publish your App'),
    },
  };

  const creatorSteps = sidebarLabels.creatorMode.steps;

  // Calculate split index based on the first newline in the full message
  const splitIndex = roboMessage.indexOf('\n');
  const safeSplitIndex = splitIndex === -1 ? roboMessage.length : splitIndex;

  const coloredPart = roboText.slice(0, safeSplitIndex);
  const whitePart = roboText.slice(safeSplitIndex);

  return (
    <aside className={`${className} relative`}>
      <div
        className="absolute right-[calc(100%-6px)] top-[200px] hidden xl:flex flex-col items-center pr-0"
        onMouseEnter={() => setRoboHover(true)}
        onMouseLeave={() => setRoboHover(false)}
      >
        {isTutorial ? (
          <div className="flex flex-col-reverse gap-3 py-4 -translate-x-[12px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-500 ${activeLight > i
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] scale-110'
                  : 'bg-emerald-900/20 scale-100'
                  }`}
              />
            ))}
          </div>
        ) : (
          <>
            <Link
              href="/tutorial"
              className="transition-transform hover:scale-105 origin-right block"
              title="Check out the tutorial"
            >
              <img
                src={isDark ? "/Robo_1_black.png" : "/Robo_1_white.png"}
                alt="Tutorial"
                className="w-32 lg:w-40 xl:w-44 max-w-[15vw] drop-shadow-xl h-auto"
              />
            </Link>
            <div className={`mt-2 font-sans text-2xl font-black tracking-tight text-center whitespace-pre-wrap leading-none transition-opacity duration-300 w-48 ${isDark ? 'text-white' : 'text-black'} ${roboHover ? 'opacity-100' : 'opacity-0'}`}>
              <span className={isDark ? "text-emerald-400" : "text-emerald-600"}>
                {coloredPart}
              </span>
              {whitePart}
            </div>
          </>
        )}
      </div>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">{sidebarLabels.title}</p>
        <p className="mt-1 text-sm text-zinc-400">{sidebarLabels.subtitle}</p>
      </div>

      <nav className="space-y-1 text-base font-semibold">
        <SidebarItem label={sidebarLabels.nav.discover} icon={LayoutDashboard} isDark={isDark} href="/" />
        <SidebarItem
          label={messages['BetaHome.sidebar.nav.feelingLucky'] || 'Feeling lucky'}
          icon={Gamepad2}
          isDark={isDark}
          active
          onClick={async () => {
            try {
              const { getListings } = await import('@/lib/loaders');
              const res = await getListings();
              const items = Array.isArray(res?.items) ? res.items : [];
              if (items.length > 0) {
                const idx = Math.floor(Math.random() * items.length);
                const item = items[idx];
                const { playHref } = await import('@/lib/urls');
                const href = playHref(item.id, { run: 1 });
                router.push(href);
                return;
              }
            } catch (e) {
              // ignore and fallthrough to fallback
            }
            router.push('/play');
          }}
        />
        <SidebarItem label={sidebarLabels.nav.paidApps} icon={DollarSign} isDark={isDark} href="/search?tag=paid" />
        <SidebarItem label={sidebarLabels.nav.myProjects ?? 'Projects'} icon={FolderKanban} isDark={isDark} href="/my" />
        <SidebarItem label={sidebarLabels.nav.myCreators ?? 'Creators'} icon={Users} isDark={isDark} href="/my-creators" />
      </nav>

      <div className="mt-4 -mx-6 relative">
        {/* LED Border Effect */}
        {ledActive && (
          <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-0">
            <style dangerouslySetInnerHTML={{
              __html: `
              @keyframes fillBottomUp {
                0% { height: 0%; opacity: 0.2; }
                30% { height: 100%; opacity: 0.8; }
                70% { height: 100%; opacity: 0.8; }
                100% { height: 0%; opacity: 0.2; }
              }
            `}} />
            <div
              className={`absolute bottom-0 left-0 right-0 blur-lg ${isDark ? 'bg-[#A855F7]' : 'bg-[#22C55E]'
                }`}
              style={{
                animation: 'fillBottomUp 10s ease-in-out infinite'
              }}
            />
          </div>
        )}

        {/* Main Content Box */}
        <div
          className={`relative rounded-2xl px-6 py-4 text-sm transition-all duration-300 ${ledActive ? 'm-[1.5px]' : 'border'} ${isDark
            ? `bg-gradient-to-br from-[#18181B] via-[#18181B] to-[#020617] ${ledActive ? 'border-transparent' : 'border-[#27272A]'}`
            : `bg-gradient-to-br from-white via-slate-50 to-slate-100 ${ledActive ? 'border-transparent' : 'border-slate-200'}`
            }`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#A855F7]/20 via-[#22C55E]/20 to-transparent px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#A855F7]">
                <Sparkles className="mr-1 h-3 w-3" />
                <span>{sidebarLabels.creatorMode.badge}</span>
              </div>

              {/* LED Toggle Switch */}
              <button
                onClick={() => setLedActive(!ledActive)}
                className={`transition-colors ${isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-slate-400 hover:text-slate-600'}`}
                title={ledActive ? "Disable effects" : "Enable effects"}
              >
                {ledActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              </button>
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
                  className={`rounded-full border px-2 py-0.5 transition-colors ${(provider as any).highlight
                    ? isDark
                      ? 'bg-emerald-950 border-emerald-800 text-emerald-400 hover:bg-emerald-900 font-medium'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-medium'
                    : isDark
                      ? 'border-[#27272A] bg-black/40 text-zinc-300 hover:text-zinc-100'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900'
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
      </div>

      <div className="flex-1" />
    </aside>
  );
}
