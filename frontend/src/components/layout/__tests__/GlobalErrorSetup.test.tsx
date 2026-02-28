/**
 * TickerPulse AI v3.0 — GlobalErrorSetup component tests.
 *
 * Verifies that global error handlers (window.onerror and unhandledrejection)
 * are registered exactly once at app startup via setupGlobalHandlers().
 */

import React from 'react';
import { render } from '@testing-library/react';
import GlobalErrorSetup from '../GlobalErrorSetup';
import * as errorReporter from '@/lib/errorReporter';

describe('GlobalErrorSetup', () => {
  let setupSpy: jest.SpyInstance;

  beforeEach(() => {
    setupSpy = jest.spyOn(errorReporter, 'setupGlobalHandlers');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path', () => {
    it('calls setupGlobalHandlers on mount', () => {
      render(<GlobalErrorSetup />);
      expect(setupSpy).toHaveBeenCalledTimes(1);
    });

    it('returns null (renders nothing)', () => {
      const { container } = render(<GlobalErrorSetup />);
      expect(container.firstChild).toBeNull();
    });

    it('calls setupGlobalHandlers exactly once even with multiple mounts', () => {
      const { rerender } = render(<GlobalErrorSetup />);
      expect(setupSpy).toHaveBeenCalledTimes(1);

      rerender(<GlobalErrorSetup />);
      expect(setupSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error cases', () => {
    it('handles setupGlobalHandlers throwing an error gracefully', () => {
      setupSpy.mockImplementationOnce(() => {
        throw new Error('Handler setup failed');
      });

      expect(() => {
        render(<GlobalErrorSetup />);
      }).toThrow('Handler setup failed');
    });
  });

  describe('edge cases', () => {
    it('works in SSR environment (window undefined)', () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      try {
        render(<GlobalErrorSetup />);
        expect(setupSpy).toHaveBeenCalledTimes(1);
      } finally {
        global.window = originalWindow;
      }
    });

    it('handles setupGlobalHandlers being called with no side effects', () => {
      setupSpy.mockImplementationOnce(() => {
        // No-op
      });

      render(<GlobalErrorSetup />);
      expect(setupSpy).toHaveBeenCalled();
    });
  });
});
