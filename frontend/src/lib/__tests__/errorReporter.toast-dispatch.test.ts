/**
 * TickerPulse AI v3.0 — Error Reporter Toast Dispatch Tests
 *
 * Tests that errorReporter._send() dispatches toast notifications for error and critical severity.
 */

import { captureException, captureRejection, captureReactError } from '@/lib/errorReporter';
import * as toastBus from '@/lib/toastBus';

// Polyfill TextEncoder for Node.js test environment
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = require('util').TextEncoder;
}

// Mock toastBus.toast
jest.mock('@/lib/toastBus', () => ({
  toast: jest.fn(),
}));

// Mock fetch to prevent actual HTTP calls
global.fetch = jest.fn();

describe('errorReporter toast dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as any).mockResolvedValue({ ok: true, status: 201 });
  });

  describe('captureException', () => {
    it('dispatches toast for error severity (default)', async () => {
      const error = new Error('Test error message');
      await captureException(error);

      expect(toastBus.toast).toHaveBeenCalledWith('Test error message', 'error');
    });

    it('dispatches toast for critical severity', async () => {
      const error = new Error('Critical system failure');
      await captureException(error, { severity: 'critical' });

      expect(toastBus.toast).toHaveBeenCalledWith('Critical system failure', 'error');
    });

    it('does NOT dispatch toast for warning severity', async () => {
      const error = new Error('Degraded service');
      await captureException(error, { severity: 'warning' });

      expect(toastBus.toast).not.toHaveBeenCalled();
    });

    it('sends payload to backend after toast dispatch', async () => {
      const error = new Error('Backend sync test');
      await captureException(error);

      expect(toastBus.toast).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/errors',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  });

  describe('captureRejection', () => {
    it('dispatches toast for unhandled rejection with Error', async () => {
      const error = new Error('Promise rejected');
      await captureRejection(error);

      expect(toastBus.toast).toHaveBeenCalledWith('Promise rejected', 'error');
    });

    it('dispatches toast for unhandled rejection with string', async () => {
      await captureRejection('String rejection reason');

      expect(toastBus.toast).toHaveBeenCalledWith('String rejection reason', 'error');
    });
  });

  describe('captureReactError', () => {
    it('dispatches toast for React render errors (critical)', async () => {
      const error = new Error('Component render failed');
      await captureReactError(error, 'ComponentStack');

      expect(toastBus.toast).toHaveBeenCalledWith('Component render failed', 'error');
    });
  });

  describe('deduplication with toast', () => {
    it('toast not dispatched for duplicate error within 5s window', async () => {
      const error = new Error('Duplicate test');

      // First call
      await captureException(error);
      expect(toastBus.toast).toHaveBeenCalledTimes(1);

      // Second call within 5s — should be deduplicated
      await captureException(error);
      expect(toastBus.toast).toHaveBeenCalledTimes(1);
    });
  });
});
