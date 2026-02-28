'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue>({
  error: () => {},
  warn: () => {},
  info: () => {},
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Single toast item (auto-dismisses after 5 s)
// ---------------------------------------------------------------------------

const TYPE_CLASSES: Record<ToastType, string> = {
  error: 'bg-red-900/90 border-red-700 text-red-100',
  warning: 'bg-yellow-900/90 border-yellow-700 text-yellow-100',
  info: 'bg-slate-800 border-slate-600 text-slate-100',
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg ${TYPE_CLASSES[toast.type]}`}
    >
      <span className="flex-1 text-sm">{toast.message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 opacity-60 hover:opacity-100 leading-none text-lg"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider — manages state and renders the toast stack
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    error: useCallback((msg) => add(msg, 'error'), [add]),
    warn: useCallback((msg) => add(msg, 'warning'), [add]),
    info: useCallback((msg) => add(msg, 'info'), [add]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
