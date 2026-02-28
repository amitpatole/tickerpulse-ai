```tsx
'use client';

import React from 'react';

interface Period {
  label: string;
  value: number;
}

const PERIODS: Period[] = [
  { label: '7d',  value: 7  },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

interface Props {
  value: number;
  onChange: (days: number) => void;
}

export default function PeriodSelector({ value, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-slate-700/50 p-0.5">
      {PERIODS.map(({ label, value: periodValue }) => (
        <button
          key={periodValue}
          onClick={() => onChange(periodValue)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            value === periodValue
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```