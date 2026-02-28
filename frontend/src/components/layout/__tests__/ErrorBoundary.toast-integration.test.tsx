/**
 * TickerPulse AI v3.0 — ErrorBoundary Toast Integration Tests
 *
 * Tests that ErrorBoundary.componentDidCatch calls captureReactError,
 * which triggers toast notifications for React render errors.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import * as errorReporter from '@/lib/errorReporter';

// Mock errorReporter to avoid actual API calls
jest.mock('@/lib/errorReporter');
jest.mock('@/components/layout/ToastContainer', () => {
  return function DummyToastContainer() {
    return <div data-testid="toast-container">Toast Container</div>;
  };
});

const BrokenComponent = ({ shouldError }: { shouldError: boolean }) => {
  if (shouldError) {
    throw new Error('Render error in child component');
  }
  return <div>Component working</div>;
};

describe('ErrorBoundary with captureReactError integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <BrokenComponent shouldError={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Component working')).toBeInTheDocument();
      expect(errorReporter.captureReactError).not.toHaveBeenCalled();
    });

    it('renders ToastContainer regardless of error state', () => {
      render(
        <ErrorBoundary>
          <BrokenComponent shouldError={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('toast-container')).toBeInTheDocument();
    });
  });

  describe('error handling with captureReactError', () => {
    it('calls captureReactError when child component throws', async () => {
      render(
        <ErrorBoundary>
          <BrokenComponent shouldError={true} />
        </ErrorBoundary>
      );

      // Wait for componentDidCatch to execute
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(errorReporter.captureReactError).toHaveBeenCalledTimes(1);
      const mockFn = errorReporter.captureReactError as jest.Mock;
      const [error, componentStack] = mockFn.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Render error in child component');
      expect(typeof componentStack).toBe('string');
    });

    it('renders fallback UI when error caught', () => {
      const fallbackText = 'Custom error fallback';
      render(
        <ErrorBoundary fallback={<div>{fallbackText}</div>}>
          <BrokenComponent shouldError={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(fallbackText)).toBeInTheDocument();
      expect(screen.queryByText('Component working')).not.toBeInTheDocument();
    });

    it('displays default fallback UI when no custom fallback provided', () => {
      render(
        <ErrorBoundary>
          <BrokenComponent shouldError={true} />
        </ErrorBoundary>
      );

      // Default fallback shows error message and retry button
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });

    it('captures component stack in error report', async () => {
      render(
        <ErrorBoundary>
          <BrokenComponent shouldError={true} />
        </ErrorBoundary>
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      const mockFn = errorReporter.captureReactError as jest.Mock;
      const [, componentStack] = mockFn.mock.calls[0];
      expect(componentStack).toContain('BrokenComponent');
    });
  });

  describe('error isolation', () => {
    it('only captures errors in the boundary subtree', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <BrokenComponent shouldError={false} />
        </ErrorBoundary>
      );

      expect(errorReporter.captureReactError).not.toHaveBeenCalled();

      rerender(
        <ErrorBoundary>
          <BrokenComponent shouldError={true} />
        </ErrorBoundary>
      );

      expect(errorReporter.captureReactError).toHaveBeenCalledOnce();
    });
  });

  describe('edge cases', () => {
    it('handles error without message gracefully', async () => {
      const ErrorNoMessage = () => {
        const err = new Error();
        err.message = '';
        throw err;
      };

      render(
        <ErrorBoundary>
          <ErrorNoMessage />
        </ErrorBoundary>
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(errorReporter.captureReactError).toHaveBeenCalledOnce();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });

    it('handles null componentStack gracefully', async () => {
      // Simulate React passing undefined componentStack
      render(
        <ErrorBoundary>
          <BrokenComponent shouldError={true} />
        </ErrorBoundary>
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      const mockFn = errorReporter.captureReactError as jest.Mock;
      const [, componentStack] = mockFn.mock.calls[0];
      expect(componentStack).toBeDefined();
      expect(typeof componentStack).toBe('string');
    });
  });
});
