```tsx
import React, { Component, ReactNode } from 'react';
import ToastContainer from './ToastContainer';
import { captureReactError } from '@/lib/errorReporter';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI to render when a child component throws. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React class-based error boundary.  Catches render errors in any descendant
 * and renders a fallback UI instead of crashing the whole tree.
 *
 * ToastContainer is rendered unconditionally (outside the children slot) so
 * toast notifications continue to work even when children have crashed.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error.message, info.componentStack);
    captureReactError(error, info.componentStack ?? '');
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <>
          <ToastContainer />
          {this.props.fallback ?? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/50 p-8 text-center">
              <p className="text-sm text-slate-400">
                {this.state.error?.message ?? 'Something went wrong.'}
              </p>
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-600"
              >
                Retry
              </button>
            </div>
          )}
        </>
      );
    }

    return (
      <>
        <ToastContainer />
        {this.props.children}
      </>
    );
  }
}
```