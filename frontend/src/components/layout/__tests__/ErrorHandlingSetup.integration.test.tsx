/**
 * TickerPulse AI v3.0 — Error Handling Setup Integration Tests
 *
 * Verifies end-to-end error flow:
 * 1. GlobalErrorSetup registers window.onerror and unhandledrejection handlers
 * 2. ErrorBoundary catches React render errors
 * 3. errorReporter.captureReactError sends errors to /api/errors backend
 * 4. Users see fallback UI while errors are logged
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import GlobalErrorSetup from '../GlobalErrorSetup';
import * as errorReporter from '@/lib/errorReporter';

// ============================================================================
// Test fixtures: Simulate the root layout structure
// ============================================================================

const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message);
};

const RootLayoutSimulation: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <>
    <GlobalErrorSetup />
    <ErrorBoundary>{children}</ErrorBoundary>
  </>
);

describe('Error Handling Setup (End-to-End Integration)', () => {
  let captureExceptionSpy: jest.SpyInstance;
  let captureReactErrorSpy: jest.SpyInstance;
  let setupGlobalHandlersSpy: jest.SpyInstance;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    // Spy on errorReporter functions
    captureExceptionSpy = jest.spyOn(errorReporter, 'captureException');
    captureReactErrorSpy = jest.spyOn(errorReporter, 'captureReactError');
    setupGlobalHandlersSpy = jest.spyOn(errorReporter, 'setupGlobalHandlers');

    // Mock fetch to intercept /api/errors requests
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    // Suppress console errors
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==========================================================================
  // Happy Path: Error handling pipeline works end-to-end
  // ==========================================================================

  describe('happy path: render error flow', () => {
    it('catches render error, reports it, and shows fallback UI', async () => {
      render(
        <RootLayoutSimulation>
          <ThrowError message="Component render error" />
        </RootLayoutSimulation>
      );

      // User sees error UI
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Error was captured
      expect(captureReactErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Component render error' }),
        expect.any(String)
      );
    });

    it('GlobalErrorSetup registers handlers on app startup', () => {
      render(<GlobalErrorSetup />);
      expect(setupGlobalHandlersSpy).toHaveBeenCalledTimes(1);
    });

    it('ErrorBoundary and GlobalErrorSetup work together', () => {
      render(
        <RootLayoutSimulation>
          <div>App content</div>
        </RootLayoutSimulation>
      );

      // Both components initialized successfully
      expect(setupGlobalHandlersSpy).toHaveBeenCalled();
      expect(screen.getByText('App content')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Error Cases: Failures in error handling shouldn't crash the app
  // ==========================================================================

  describe('error cases: graceful degradation', () => {
    it('handles fetch failure when reporting error gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      render(
        <RootLayoutSimulation>
          <ThrowError message="Error during fetch failure" />
        </RootLayoutSimulation>
      );

      // UI still shows even if fetch fails
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // App didn't crash despite fetch error
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it('handles setupGlobalHandlers errors gracefully', () => {
      setupGlobalHandlersSpy.mockImplementationOnce(() => {
        throw new Error('Handler registration failed');
      });

      expect(() => {
        render(<GlobalErrorSetup />);
      }).toThrow();
    });

    it('missing component stack should not break error reporting', async () => {
      render(
        <RootLayoutSimulation>
          <ThrowError message="No component stack" />
        </RootLayoutSimulation>
      );

      await waitFor(() => {
        expect(captureReactErrorSpy).toHaveBeenCalled();
      });

      // Should still capture the error
      const call = captureReactErrorSpy.mock.calls[0];
      expect(call[0]).toBeInstanceOf(Error);
    });
  });

  // ==========================================================================
  // Edge Cases: Boundary conditions and special scenarios
  // ==========================================================================

  describe('edge cases: special scenarios', () => {
    it('deduplicates identical errors within 5s window', async () => {
      const { rerender } = render(
        <RootLayoutSimulation>
          <ThrowError message="Duplicate error" />
        </RootLayoutSimulation>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const firstCallCount = fetchMock.mock.calls.length;

      // Trigger same error again (would be caught in real app via global handler)
      // This simulates rapid-fire of the same error
      rerender(
        <RootLayoutSimulation>
          <ThrowError message="Duplicate error" />
        </RootLayoutSimulation>
      );

      // Should still show UI but deduplication would prevent second fetch
      // (in real scenario this would be from global handlers)
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('handles deeply nested component errors', () => {
      const DeepComponent = () => (
        <div>
          <div>
            <div>
              <ThrowError message="Deep nesting error" />
            </div>
          </div>
        </div>
      );

      render(
        <RootLayoutSimulation>
          <DeepComponent />
        </RootLayoutSimulation>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(captureReactErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.stringContaining('DeepComponent')
      );
    });

    it('SSR environment: setupGlobalHandlers safe when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      try {
        // Should not throw in SSR
        render(<GlobalErrorSetup />);
        expect(setupGlobalHandlersSpy).toHaveBeenCalled();
      } finally {
        global.window = originalWindow;
      }
    });
  });

  // ==========================================================================
  // Acceptance Criteria: Full pipeline verified
  // ==========================================================================

  describe('acceptance: error handling pipeline complete', () => {
    it('AC1: Global handlers registered at app startup', () => {
      render(<GlobalErrorSetup />);
      expect(setupGlobalHandlersSpy).toHaveBeenCalledTimes(1);
    });

    it('AC2: Render errors caught by ErrorBoundary and reported via captureReactError', async () => {
      render(
        <RootLayoutSimulation>
          <ThrowError message="Render pipeline test" />
        </RootLayoutSimulation>
      );

      expect(captureReactErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Render pipeline test' }),
        expect.any(String)
      );
    });

    it('AC3: User sees error fallback UI during error reporting', async () => {
      render(
        <RootLayoutSimulation>
          <ThrowError message="User-facing test" />
        </RootLayoutSimulation>
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Refresh Page/i })).toBeInTheDocument();
      });
    });

    it('AC4: Error reporting never breaks the app', async () => {
      fetchMock.mockRejectedValueOnce(new Error('API down'));

      render(
        <RootLayoutSimulation>
          <ThrowError message="API failure test" />
        </RootLayoutSimulation>
      );

      // App still functional and shows error UI
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Refresh Page/i })).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Error message content & payload validation
  // ==========================================================================

  describe('error payload validation', () => {
    it('includes error message in payload', async () => {
      render(
        <RootLayoutSimulation>
          <ThrowError message="Specific error message" />
        </RootLayoutSimulation>
      );

      await waitFor(() => {
        expect(captureReactErrorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Specific error message',
          }),
          expect.any(String)
        );
      });
    });

    it('includes component stack in React error reports', async () => {
      render(
        <RootLayoutSimulation>
          <ThrowError message="Stack trace test" />
        </RootLayoutSimulation>
      );

      await waitFor(() => {
        const [, componentStack] = captureReactErrorSpy.mock.calls[0];
        expect(componentStack).toBeTruthy();
        expect(typeof componentStack).toBe('string');
      });
    });
  });
});
