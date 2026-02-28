/**
 * TickerPulse AI v3.0 - useErrorReporter
 *
 * Fire-and-forget helper for posting error reports to POST /api/errors.
 * Failures are silently swallowed so error reporting never disrupts the UI.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface ErrorReport {
  type: 'react_error' | 'unhandled_rejection' | 'unhandled_exception';
  message: string;
  timestamp: string;
  severity?: 'error' | 'warning' | 'critical';
  source?: string;
  stack?: string;
  component_stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Post an error report to the backend. Fire-and-forget: never throws.
 */
export function reportError(payload: ErrorReport): void {
  fetch(`${API_BASE}/api/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

/**
 * Hook wrapper around reportError for components that prefer hook style.
 */
export function useErrorReporter() {
  return { reportError };
}
