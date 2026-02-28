'use client';

import { useApiErrorContext } from '@/lib/apiErrorContext';
import { useApiError } from '@/hooks/useApiError';
import type { ApiError } from '@/lib/types';

function ErrorItem({ error, onDismiss }: { error: ApiError; onDismiss: () => void }) {
  const info = useApiError(error);
  if (!info) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-red-700/50 last:border-0">
      <span className="flex-1 text-sm font-medium">{info.message}</span>
      {info.error_code && (
        <span className="shrink-0 text-xs text-red-300 font-mono">{info.error_code}</span>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 p-1 rounded hover:bg-red-800 opacity-70 hover:opacity-100 transition-opacity"
      >
        <span aria-hidden="true" className="text-lg leading-none">×</span>
      </button>
    </div>
  );
}

export default function ErrorBanner() {
  const { errors, dismissError, clearAllErrors } = useApiErrorContext();

  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 bg-red-900/95 border-b border-red-700 text-red-100 shadow-lg"
    >
      {errors.map((error, idx) => (
        <ErrorItem key={idx} error={error} onDismiss={() => dismissError(error)} />
      ))}
      {errors.length > 1 && (
        <div className="flex justify-end px-4 py-1 border-t border-red-700/50">
          <button
            onClick={clearAllErrors}
            className="text-xs text-red-300 hover:text-red-100 transition-colors"
          >
            Clear all ({errors.length})
          </button>
        </div>
      )}
    </div>
  );
}