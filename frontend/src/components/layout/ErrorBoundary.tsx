```tsx
'use client';

// ============================================================
// TickerPulse AI v3.0 — React Error Boundary
// Class component that catches render-time errors, reports them
// to the backend ingestion endpoint via errorReporter, and
// displays a fallback UI instead of crashing the application.
//
// Global window.onerror / unhandledrejection handlers are
// registered separately via GlobalErrorSetup (layout.tsx) so
// this boundary stays focused on React render errors only.
// ============================================================

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { captureReactError } from '@/lib/errorReporter';

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
    captureReactError(error, info.componentStack ?? '');
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
```