'use client';

import { ReactNode } from 'react';

type TabDefinition = {
  id: string;
  label: string;
};

type TabProps = {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
};

export default function Tabs({ tabs, activeTab, onTabChange, children }: TabProps) {
  return (
    <div className="w-full">
      <div className="border-b border-slate-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${tab.id === activeTab
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-zinc-700'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="pt-6">
        {children}
      </div>
    </div>
  );
}
