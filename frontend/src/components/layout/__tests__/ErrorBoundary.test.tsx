/**
 * TickerPulse AI v3.0 — React Error Boundary component tests.
 */

import React, { Component, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'react_error',
        message: error.message,
        stack: error.stack,
        component_stack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" data-testid="error-fallback">
          <h2>Something went wrong</h2>
          <p>We've logged this error. Try refreshing the page.</p>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error?.toString()}
          </details>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const ThrowError: React.FC<{ message: string }> = ({ message }) => {
  throw new Error(message);
};

const WorkingComponent: React.FC = () => {
  return <div>This works fine</div>;
};

const ConditionalError: React.FC<{ shouldError: boolean; message: string }> = ({
  shouldError,
  message,
}) => {
  if (shouldError) {
    throw new Error(message);
  }
  return <div>Component is working</div>;
};

describe('ErrorBoundary', () => {
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true }),
    });
    originalFetch = global.fetch;
    global.fetch = fetchMock as any;

    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('happy path', () => {
    it('renders children without error', () => {
      render(
        <ErrorBoundary>
          <WorkingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('This works fine')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders multiple children successfully', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
          <div>Child 3</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
      expect(screen.getByText('Child 3')).toBeInTheDocument();
    });

    it('does not report errors when no errors occur', () => {
      render(
        <ErrorBoundary>
          <WorkingComponent />
        </ErrorBoundary>
      );

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('catches component render errors', () => {
      const ErrorComponent = () => {
        throw new Error('Render failed');
      };

      render(
        <ErrorBoundary>
          <ErrorComponent />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it('displays error message in fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Critical error message" />
        </ErrorBoundary>
      );

      const fallback = screen.getByTestId('error-fallback');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText(/We've logged this error/)).toBeInTheDocument();
    });

    it('shows error details in expandable section', () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Detailed error" />
        </ErrorBoundary>
      );

      const details = screen.getByText('Detailed error');
      expect(details).toBeInTheDocument();
    });

    it('reports error to backend with correct structure', async () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Backend error report" />
        </ErrorBoundary>
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(fetchMock).toHaveBeenCalledWith('/api/errors', expect.objectContaining({
        method: 'POST',
      }));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.type).toBe('react_error');
      expect(body.message).toBe('Backend error report');
      expect(body.component_stack).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it('gracefully handles reporting failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      render(
        <ErrorBoundary>
          <ThrowError message="Error" />
        </ErrorBoundary>
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('error isolation', () => {
    it('only catches errors in subtree', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalError shouldError={false} message="No error" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component is working')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <ConditionalError shouldError={true} message="Now error" />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('isolates errors to specific boundary', () => {
      const Working = () => <div>Working 1</div>;
      const Broken = () => <ThrowError message="Broken" />;

      render(
        <>
          <div>
            <Working />
          </div>
          <ErrorBoundary>
            <Broken />
          </ErrorBoundary>
          <div>
            <Working />
          </div>
        </>
      );

      expect(screen.getAllByText('Working 1')).toHaveLength(2);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('recovery', () => {
    it('provides refresh button to recover', async () => {
      render(
        <ErrorBoundary>
          <ThrowError message="Error" />
        </ErrorBoundary>
      );

      const refreshBtn = screen.getByRole('button', { name: /Refresh Page/i });
      expect(refreshBtn).toBeInTheDocument();
    });

    it('can reset error state (for testing)', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalError shouldError={true} message="Error" />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <ConditionalError shouldError={false} message="Recovered" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component is working')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles null children', () => {
      render(<ErrorBoundary>{null}</ErrorBoundary>);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles error without message', async () => {
      const ErrorWithoutMessage = () => {
        const err = new Error();
        err.message = '';
        throw err;
      };

      render(
        <ErrorBoundary>
          <ErrorWithoutMessage />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });
});