'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiError } from './types';
import { setGlobalErrorReporter } from './api';

const AUTO_DISMISS_MS = 30_000;

interface ApiErrorContextValue {
  errors: ApiError[];
  reportPersistentError: (err: ApiError) => void;
  dismissError: (err: ApiError) => void;
  clearAllErrors: () => void;
}

const ApiErrorContext = createContext<ApiErrorContextValue>({
  errors: [],
  reportPersistentError: () => {},
  dismissError: () => {},
  clearAllErrors: () => {},
});

export function ApiErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<ApiError[]>([]);
  const timersRef = useRef<Map<ApiError, ReturnType<typeof setTimeout>>>(new Map());

  const dismissError = useCallback((err: ApiError) => {
    const timer = timersRef.current.get(err);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(err);
    }
    setErrors((prev) => prev.filter((e) => e !== err));
  }, []);

  const reportPersistentError = useCallback(
    (err: ApiError) => {
      setErrors((prev) => {
        if (prev.includes(err)) return prev;
        return [...prev, err];
      });
      const timer = setTimeout(() => dismissError(err), AUTO_DISMISS_MS);
      timersRef.current.set(err, timer);
    },
    [dismissError],
  );

  const clearAllErrors = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setErrors([]);
  }, []);

  // Wire apiFetch's global error reporter so 4xx errors bubble up automatically.
  useEffect(() => {
    setGlobalErrorReporter(reportPersistentError);
    return () => setGlobalErrorReporter(null);
  }, [reportPersistentError]);

  // Clean up all timers on unmount.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ApiErrorContext.Provider value={{ errors, reportPersistentError, dismissError, clearAllErrors }}>
      {children}
    </ApiErrorContext.Provider>
  );
}

export function useApiErrorContext(): ApiErrorContextValue {
  return useContext(ApiErrorContext);
}