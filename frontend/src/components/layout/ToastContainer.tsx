'use client';

// ============================================================
// TickerPulse AI v3.0 — Toast notification container
// Renders transient error/warning/info toasts dispatched via
// the global toast() utility.  Place once in layout.tsx.
// ============================================================

import { useEffect } from 'react';
import { useToast } from '@/hooks/useToast';

const TYPE_STYLES: Record<string, string> = {
  error:   'bg-red-900/90 border-red-700 text-red-100',
  warning: 'bg-amber-900/90 border-amber-700 text-amber-100',
  info:    'bg-blue-900/90 border-blue-700 text-blue-100',
  success: 'bg-emerald-900/90 border-emerald-700 text-emerald-100',
};

const TYPE_ICONS: Record<string, string> = {
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
  success: '✓',
};

const AUTO_DISMISS_MS = 5_000;

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          id={t.id}
          message={t.message}
          type={t.type}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}

interface ToastItemProps {
  id: string;
  message: string;
  type: string;
  onDismiss: (id: string) => void;
}

function ToastItem({ id, message, type, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const colorClass = TYPE_STYLES[type] ?? TYPE_STYLES.info;
  const icon = TYPE_ICONS[type] ?? TYPE_ICONS.info;

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${colorClass}`}
    >
      <span className="mt-0.5 shrink-0 font-bold text-sm" aria-hidden="true">
        {icon}
      </span>
      <p className="flex-1 text-sm leading-snug">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity text-sm font-medium"
      >
        ✕
      </button>
    </div>
  );
}