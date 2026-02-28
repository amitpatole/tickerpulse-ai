```typescript
'use client';

import {
  Component,
  useEffect,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

import { reportError } from '@/hooks/useErrorReporter';

// ---------------------------------------------------------------------------
// Unhandled promise rejection listener
// ---------------------------------------------------------------------------

function UnhandledRejectionHandler() {
  useEffect(() => {
    function handleRejection(event: PromiseRejectionEvent) {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? 'Unhandled promise rejection');

      reportError({
        type: 'unhandled_rejection',
        message,
        timestamp: new Date().toISOString(),
        severity: 'error',
        source: 'frontend',
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
      });
    }

    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      type: 'react_error',
      message: error.message,
      timestamp: new Date().toISOString(),
      severity: 'critical',
      source: 'frontend',
      stack: error.stack,
      component_stack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-200">
          <div className="text-center max-w-md p-6">
            <h2 className="text-xl font-semibold text-red-400 mb-2">
              Something went wrong
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              An unexpected error occurred. The team has been notified.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <UnhandledRejectionHandler />
        {this.props.children}
      </>
    );
  }
}

// ---------------------------------------------------------------------------
// Route-aware wrapper — resets the boundary on navigation
// ---------------------------------------------------------------------------

/**
 * Wraps ``ErrorBoundary`` with a ``key`` derived from the current pathname so
 * that navigating to a new route automatically clears any stale crash state.
 */
export function RouteAwareErrorBoundary({ children, fallback }: Props) {
  const pathname = usePathname();
  return (
    <ErrorBoundary key={pathname} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}
```