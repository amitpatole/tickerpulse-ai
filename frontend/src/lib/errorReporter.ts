```typescript
/**
 * TickerPulse AI v3.0 — Client-side error reporter.
 *
 * Captures unhandled JS exceptions, promise rejections, and React render
 * errors, then POSTs them to the backend error ingestion endpoint.
 *
 * Features:
 *  - Tab-scoped SESSION_ID (crypto.randomUUID, generated once on module load)
 *  - 5-second deduplication window to suppress repeated identical errors
 *  - Stack truncation to keep payloads under the 64 KB backend limit
 *  - Silent failure — never throws or crashes the host application
 */

import { toast } from '@/lib/toastBus';

const _ENDPOINT = '/api/errors';
const _MAX_PAYLOAD_BYTES = 65_536; // 64 KB hard limit enforced by backend
const _STACK_TRUNCATE_LEN = 5_000;
const _DEBOUNCE_MS = 5_000;

/**
 * Stable session identifier for correlating all errors from one tab lifecycle.
 * Falls back gracefully in environments without crypto.randomUUID (e.g. old browsers).
 */
export const SESSION_ID: string = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();

type ErrorType = 'unhandled_exception' | 'unhandled_rejection' | 'react_error';
type ErrorSeverity = 'error' | 'warning' | 'critical';

interface ErrorPayload {
  type: ErrorType;
  message: string;
  stack?: string;
  component_stack?: string;
  url?: string;
  user_agent?: string;
  timestamp: string;
  session_id: string;
  severity: ErrorSeverity;
  code?: string;
}

// ---------------------------------------------------------------------------
// Deduplication — suppress repeated identical errors within the debounce window
// ---------------------------------------------------------------------------

const _recent = new Map<string, number>();

function _dedupKey(type: ErrorType, message: string): string {
  return `${type}:${message}`;
}

function _isDuplicate(key: string): boolean {
  const last = _recent.get(key);
  if (last === undefined) return false;
  return Date.now() - last < _DEBOUNCE_MS;
}

function _markSent(key: string): void {
  _recent.set(key, Date.now());
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function _truncateIfNeeded(payload: ErrorPayload): ErrorPayload {
  const size = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (size <= _MAX_PAYLOAD_BYTES) return payload;
  return {
    ...payload,
    stack: payload.stack ? payload.stack.substring(0, _STACK_TRUNCATE_LEN) : undefined,
  };
}

function _currentUrl(): string | undefined {
  try {
    return typeof window !== 'undefined' ? window.location.href : undefined;
  } catch {
    return undefined;
  }
}

function _userAgent(): string | undefined {
  try {
    return typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

async function _send(payload: ErrorPayload): Promise<void> {
  if (typeof fetch === 'undefined') return;

  const key = _dedupKey(payload.type, payload.message);
  if (_isDuplicate(key)) return;
  _markSent(key);

  // Surface error and critical issues to the user as toast notifications.
  if (payload.severity === 'error' || payload.severity === 'critical') {
    toast(payload.message, 'error');
  }

  const safe = _truncateIfNeeded(payload);

  try {
    await fetch(_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safe),
    });
  } catch (err) {
    // Never let error reporting crash the application
    console.error('[errorReporter] Failed to send error report:', err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture a JS exception and report it to the backend.
 *
 * @param error  The Error object to report.
 * @param options.code      Optional structured error code (e.g. from ApiError).
 * @param options.severity  Defaults to 'error'.
 */
export async function captureException(
  error: Error,
  options?: { code?: string; severity?: ErrorSeverity },
): Promise<void> {
  await _send({
    type: 'unhandled_exception',
    message: error.message || String(error),
    stack: error.stack,
    url: _currentUrl(),
    user_agent: _userAgent(),
    timestamp: new Date().toISOString(),
    session_id: SESSION_ID,
    severity: options?.severity ?? 'error',
    code: options?.code,
  });
}

/**
 * Capture an unhandled promise rejection.
 *
 * @param reason  The rejection reason (Error or arbitrary value).
 * @param options.code  Optional structured error code.
 */
export async function captureRejection(
  reason: unknown,
  options?: { code?: string },
): Promise<void> {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
      ? reason
      : 'Unhandled promise rejection';
  const stack = reason instanceof Error ? reason.stack : undefined;

  await _send({
    type: 'unhandled_rejection',
    message,
    stack,
    url: _currentUrl(),
    user_agent: _userAgent(),
    timestamp: new Date().toISOString(),
    session_id: SESSION_ID,
    severity: 'error',
    code: options?.code,
  });
}

/**
 * Capture a React render error.
 * Call from ErrorBoundary.componentDidCatch.
 *
 * @param error           The render error.
 * @param componentStack  React component stack from ErrorInfo.
 */
export async function captureReactError(
  error: Error,
  componentStack: string,
): Promise<void> {
  await _send({
    type: 'react_error',
    message: error.message || String(error),
    stack: error.stack,
    component_stack: componentStack,
    url: _currentUrl(),
    user_agent: _userAgent(),
    timestamp: new Date().toISOString(),
    session_id: SESSION_ID,
    severity: 'critical',
  });
}

/**
 * Install global window.onerror and window.onunhandledrejection listeners.
 * Call once from the root layout on the client side.
 */
export function setupGlobalHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event: ErrorEvent) => {
    if (event.error instanceof Error) {
      captureException(event.error);
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    captureRejection(event.reason);
  });
}
```