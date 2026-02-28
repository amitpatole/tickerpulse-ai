'use client';

// ============================================================
// TickerPulse AI v3.0 — useToast hook
// Registers the global toast listener and exposes the queue
// to ToastContainer for rendering.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { type Toast, _setToastListener } from '@/lib/toastBus';

export { toast } from '@/lib/toastBus';
export type { Toast, ToastType } from '@/lib/toastBus';

export interface UseToastResult {
  toasts: Toast[];
  dismiss: (id: string) => void;
}

/**
 * Hook consumed exclusively by <ToastContainer>.
 *
 * Registers the global bus listener on mount so that calls to `toast()`
 * from anywhere (including api.ts) enqueue a notification.  Only one
 * ToastContainer should be rendered per app (placed in layout.tsx).
 */
export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    _setToastListener((incoming) =>
      setToasts((prev) => [...prev, incoming])
    );
    return () => _setToastListener(null);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, dismiss };
}