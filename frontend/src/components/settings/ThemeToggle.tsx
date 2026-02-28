'use client';

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from '@/components/layout/ThemeProvider';
import type { ThemeMode } from '@/components/layout/ThemeProvider';

const OPTIONS: { value: ThemeMode; icon: React.ElementType; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

export default function ThemeToggle() {
  const { theme, setTheme, syncing } = useTheme();

  return (
    <div
      role="group"
      aria-label="Colour scheme"
      className="inline-flex rounded-lg border border-slate-700 bg-slate-900/50 p-0.5"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            title={label}
            disabled={syncing}
            className={clsx(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              active
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-300',
              syncing && 'cursor-wait opacity-60'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
