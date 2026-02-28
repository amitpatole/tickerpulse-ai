// ============================================================
// TickerPulse AI v3.0 — Global toast event bus
// Plain TypeScript module (no React imports) so it can be
// safely imported from api.ts, hooks, or components.
// ============================================================

export type ToastType = 'error' | 'warning' | 'info' | 'success';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

type ToastListener = (toast: Toast) => void;

let _listener: ToastListener | null = null;
let _counter = 0;

/**
 * Dispatch a toast notification.  If no ToastContainer is mounted the
 * message is silently dropped (graceful degradation during SSR or tests).
 */
export function toast(message: string, type: ToastType = 'error'): void {
  if (_listener) {
    _listener({ id: String(++_counter), message, type });
  }
}

/**
 * Register the single active toast listener.
 * Called by ToastContainer on mount; pass null to unregister on unmount.
 *
 * @internal — only consumed by useToast hook.
 */
export function _setToastListener(listener: ToastListener | null): void {
  _listener = listener;
}

/** @internal Reset bus state for unit tests. */
export function _resetToastBusForTesting(): void {
  _listener = null;
  _counter = 0;
}