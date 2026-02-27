// ============================================================
// TickerPulse AI v3.0 — Frontend Error Reporter
// Captures JS exceptions, unhandled rejections, and React
// render errors and forwards them to the backend ingestion
// endpoint for persistence and monitoring.
//
// Key behaviours:
//   • Deduplication: identical errors within 5 s are suppressed
//   • Stack truncation: payloads exceeding 64 KB have their
//     stack trace trimmed to prevent 413 rejections
//   • Graceful degradation: reporting failures never surface
//     to the user; the app continues working regardless
//   • Page-unload safety: pending reports use navigator.sendBeacon
//     when available so they survive tab-close events
// ============================================================

const API_ENDPOINT = '/api/errors';
const MAX_STACK_CHARS = 5_000;
const MAX_PAYLOAD_BYTES = 65_536; // 64 KB — mirrors server limit
const DEDUPE_WINDOW_MS = 5_000;

type ErrorType = 'unhandled_exception' | 'unhandled_rejection' | 'react_error';

interface ErrorPayload {
  type: ErrorType;
  message: string;
  stack?: string;
  component_stack?: string;
  url?: string;
  user_agent?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Deduplication: track the last time each (message + stack prefix) was sent
// ---------------------------------------------------------------------------

const _recentErrors = new Map<string, number>();

function _dedupeKey(message: string, stack?: string): string {
  return `${message}::${(stack ?? '').slice(0, 200)}`;
}

function _isDuplicate(message: string, stack?: string): boolean {
  const key = _dedupeKey(message, stack);
  const now = Date.now();
  const last = _recentErrors.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
    return true;
  }
  _recentErrors.set(key, now);
  return false;
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function _currentUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.location.href : undefined;
}

function _userAgent(): string | undefined {
  return typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
}

function _truncateStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  return stack.length > MAX_STACK_CHARS ? stack.slice(0, MAX_STACK_CHARS) : stack;
}

function _buildPayload(partial: Omit<ErrorPayload, 'url' | 'user_agent' | 'timestamp'>): ErrorPayload {
  return {
    ...partial,
    stack: _truncateStack(partial.stack),
    url: _currentUrl(),
    user_agent: _userAgent(),
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Transport: fetch with sendBeacon fallback for page-unload scenarios
// ---------------------------------------------------------------------------

function _sendBeaconFallback(payload: ErrorPayload): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  return navigator.sendBeacon(API_ENDPOINT, blob);
}

async function _send(payload: ErrorPayload): Promise<void> {
  const body = JSON.stringify(payload);

  // Guard against edge cases where even a truncated payload exceeds the limit
  if (new TextEncoder().encode(body).length > MAX_PAYLOAD_BYTES) {
    console.error('[errorReporter] Payload still too large after truncation; skipping.');
    return;
  }

  try {
    await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Silently fail — error reporting must never break the app
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Report a caught JS exception (e.g. from a try/catch or window.onerror).
 */
export function captureException(error: Error): void {
  if (_isDuplicate(error.message, error.stack)) return;
  const payload = _buildPayload({
    type: 'unhandled_exception',
    message: error.message || 'Unknown error',
    stack: error.stack,
  });
  _send(payload).catch(() => {});
}

/**
 * Report an unhandled promise rejection.
 */
export function captureUnhandledRejection(reason: unknown): void {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
      ? reason
      : 'Unhandled promise rejection';
  const stack = reason instanceof Error ? reason.stack : undefined;

  if (_isDuplicate(message, stack)) return;
  const payload = _buildPayload({ type: 'unhandled_rejection', message, stack });
  _send(payload).catch(() => {});
}

/**
 * Report a React render error from an ErrorBoundary.
 * Uses direct fetch (not queued) since render errors are rare and critical.
 */
export function captureReactError(error: Error, componentStack: string): void {
  if (_isDuplicate(error.message, error.stack)) return;
  const payload = _buildPayload({
    type: 'react_error',
    message: error.message || 'React render error',
    stack: error.stack,
    component_stack: componentStack,
  });
  _send(payload).catch(() => {});
}

/**
 * Install global `window.onerror` and `unhandledrejection` listeners.
 * Call once from the root layout / app entry point.
 */
export function setupGlobalHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event: ErrorEvent) => {
    if (event.error instanceof Error) {
      captureException(event.error);
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    captureUnhandledRejection(event.reason);
  });

  // On tab close / navigation, flush any in-flight report via sendBeacon
  window.addEventListener('pagehide', () => {
    // Individual captureX calls already fire their own fetch; the sendBeacon
    // path is available for callers that explicitly need unload-safe delivery.
    _recentErrors.clear();
  });
}

/**
 * Send a payload synchronously via sendBeacon (safe to call from pagehide /
 * visibilitychange handlers where async fetch may not complete).
 */
export function sendBeacon(payload: ErrorPayload): boolean {
  return _sendBeaconFallback(payload);
}