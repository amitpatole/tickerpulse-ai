'use client';

import { X } from 'lucide-react';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', '1'], description: 'Dashboard' },
      { keys: ['Ctrl', '2'], description: 'Agents' },
      { keys: ['Ctrl', '3'], description: 'Research' },
      { keys: ['Ctrl', '4'], description: 'Scheduler' },
      { keys: ['Ctrl', '5'], description: 'Settings' },
      { keys: ['N'], description: 'Focus news feed' },
    ],
  },
  {
    title: 'Search',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Focus stock search' },
      { keys: ['/'], description: 'Focus stock search' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close modal / blur input' },
    ],
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map(({ keys, description }) => (
                  <div key={description} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">{description}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700">
                            {key}
                          </kbd>
                          {i < keys.length - 1 && (
                            <span className="text-xs text-slate-600">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">
          Press{' '}
          <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500 ring-1 ring-slate-700">
            Esc
          </kbd>{' '}
          to close
        </p>
      </div>
    </div>
  );
}