```typescript
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { ApiError } from './types';

const _AUTO_DISMISS_MS = 30_000;

interface QueuedError {
  id: string;
  error: ApiError;
}

interface ApiErrorContextValue {
  /** All active persistent errors (after all retries exhausted). */
  errors: ApiError[];
  /** Add an error to the persistent queue. Auto-dismissed after 30s. */
  reportPersistentError: (error: ApiError) => void;
  /** Dismiss a specific error by reference. */
  dismissError: (error: ApiError) => void;
  /** Clear all active errors. */
  clearAllErrors: () => void;
}

const ApiErrorContext = createContext<ApiErrorContextValue>({
  errors: [],
  reportPersistentError: () => {},
  dismissError: () => {},
  clearAllErrors: () => {},
});

export function ApiErrorProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedError[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const _removeById = useCallback((id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const reportPersistentError = useCallback(
    (error: ApiError) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setQueue((prev) => [...prev, { id, error }]);
      const timer = setTimeout(() => _removeById(id), _AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [_removeById],
  );

  const dismissError = useCallback(
    (error: ApiError) => {
      setQueue((prev) => {
        const entry = prev.find((q) => q.error === error);
        if (!entry) return prev;
        const timer = timersRef.current.get(entry.id);
        if (timer !== undefined) {
          clearTimeout(timer);
          timersRef.current.delete(entry.id);
        }
        return prev.filter((q) => q.error !== error);
      });
    },
    [],
  );

  const clearAllErrors = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setQueue([]);
  }, []);

  // Automatically pick up errors dispatched by apiFetch
  useEffect(() => {
    function handleApiError(event: Event) {
      const error = (event as CustomEvent<ApiError>).detail;
      if (error) reportPersistentError(error);
    }
    window.addEventListener('tickerpulse:apifetch-error', handleApiError);
    return () => window.removeEventListener('tickerpulse:apifetch-error', handleApiError);
  }, [reportPersistentError]);

  // Clean up all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const errors = queue.map((q) => q.error);

  return (
    <ApiErrorContext.Provider value={{ errors, reportPersistentError, dismissError, clearAllErrors }}>
      {children}
    </ApiErrorContext.Provider>
  );
}

export function useApiErrorContext(): ApiErrorContextValue {
  return useContext(ApiErrorContext);
}
```