'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import type { ApiError } from './types';

interface ApiErrorContextValue {
  /** Most recent persistent error (after all retries exhausted), or null. */
  persistentError: ApiError | null;
  /** Call this when a retried request has ultimately failed. */
  reportPersistentError: (error: ApiError) => void;
  /** Call this when any request succeeds — clears the banner. */
  clearPersistentError: () => void;
}

const ApiErrorContext = createContext<ApiErrorContextValue>({
  persistentError: null,
  reportPersistentError: () => {},
  clearPersistentError: () => {},
});

export function ApiErrorProvider({ children }: { children: ReactNode }) {
  const [persistentError, setPersistentError] = useState<ApiError | null>(null);

  const reportPersistentError = useCallback((error: ApiError) => {
    setPersistentError(error);
  }, []);

  const clearPersistentError = useCallback(() => {
    setPersistentError(null);
  }, []);

  return (
    <ApiErrorContext.Provider
      value={{ persistentError, reportPersistentError, clearPersistentError }}
    >
      {children}
    </ApiErrorContext.Provider>
  );
}

export function useApiErrorContext(): ApiErrorContextValue {
  return useContext(ApiErrorContext);
}