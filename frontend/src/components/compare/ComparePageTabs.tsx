```tsx
'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import ModelComparisonPanel from './ModelComparisonPanel';
import ComparisonHistoryPanel from './ComparisonHistoryPanel';

type Tab = 'run' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'run',     label: 'Run Comparison' },
  { id: 'history', label: 'History'        },
];

export default function ComparePageTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('run');

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-slate-700/50">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'run'     && <ModelComparisonPanel />}
      {activeTab === 'history' && <ComparisonHistoryPanel />}
    </div>
  );
}
```