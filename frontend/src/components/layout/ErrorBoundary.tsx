'use client';

// ============================================================
// TickerPulse AI v3.0 — React Error Boundary
// Class component that catches render-time errors, reports them
// to the backend ingestion endpoint, and displays a fallback UI
// instead of crashing the entire application.
//
// Also installs global window.onerror / unhandledrejection
// handlers (via componentDidMount) so that non-render JS errors
// and unhandled promise rejections are captured automatically.
// ============================================================

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback.  Receives the caught error and a reset fn. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  // ---------------------------------------------------------------------------
  // React error boundary lifecycle
  // ---------------------------------------------------------------------------

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);

    // Report to backend — fire-and-forget; failure must not crash the app
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'react_error',
        message: error.message,
        stack: error.stack,
        component_stack: info.componentStack,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      // Silently fail if backend unavailable
    });
  }

  // ---------------------------------------------------------------------------
  // Global handler installation
  // ---------------------------------------------------------------------------

  private _handleWindowError = (event: ErrorEvent): void => {
    if (!(event.error instanceof Error)) return;
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unhandled_exception',
        message: event.error.message || 'Unknown error',
        stack: event.error.stack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  };

  private _handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection';
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unhandled_rejection',
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  };

  componentDidMount(): void {
    window.addEventListener('error', this._handleWindowError);
    window.addEventListener('unhandledrejection', this._handleUnhandledRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('error', this._handleWindowError);
    window.removeEventListener('unhandledrejection', this._handleUnhandledRejection);
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  reset(): void {
    this.setState({ hasError: false, error: null });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      data-testid="error-fallback"
      className="flex min-h-screen items-center justify-center bg-slate-950 p-8"
    >
      <div className="max-w-md w-full rounded-xl border border-red-800 bg-red-950/40 p-8 text-center shadow-xl">
        <div className="mb-4 text-4xl" aria-hidden="true">
          ⚠
        </div>
        <h2 className="mb-2 text-xl font-semibold text-red-300">
          Something went wrong
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          {"We've logged this error. Try refreshing the page."}
        </p>
        <details
          className="mb-6 max-h-40 overflow-auto rounded bg-slate-900 p-3 text-left text-xs text-red-400"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {error.toString()}
        </details>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}