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
    <div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`${tab.id === activeTab
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="pt-4">
        {children}
      </div>
    </div>
  );
}
