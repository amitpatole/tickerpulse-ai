'use client';

import { useEffect, useRef } from 'react';
import { useApiErrorContext } from '@/lib/apiErrorContext';
import { useApiError } from '@/hooks/useApiError';

const AUTO_DISMISS_MS = 10_000;

export default function ErrorBanner() {
  const { persistentError, clearPersistentError } = useApiErrorContext();
  const info = useApiError(persistentError);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!persistentError) return;

    timerRef.current = setTimeout(clearPersistentError, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [persistentError, clearPersistentError]);

  if (!info) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-red-900/95 border-b border-red-700 text-red-100 shadow-lg"
    >
      <span className="flex-1 text-sm font-medium">{info.message}</span>
      {info.error_code && (
        <span className="shrink-0 text-xs text-red-300 font-mono">{info.error_code}</span>
      )}
      <button
        onClick={clearPersistentError}
        aria-label="Dismiss error"
        className="shrink-0 p-1 rounded hover:bg-red-800 opacity-70 hover:opacity-100 transition-opacity"
      >
        <span aria-hidden="true" className="text-lg leading-none">×</span>
      </button>
    </div>
  );
}
