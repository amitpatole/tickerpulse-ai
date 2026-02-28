/**
 * TickerPulse AI v3.0 — Error reporter implementation tests.
 *
 * Tests the actual errorReporter functions:
 *  - captureException: capture JS exceptions with severity tagging
 *  - captureRejection: handle promise rejections (Error or string)
 *  - captureReactError: capture React render errors with critical severity
 *  - setupGlobalHandlers: register global error listeners
 *  - Deduplication: suppress repeated errors within 5s window
 *  - Payload truncation: keep payloads under 64 KB
 */

import {
  captureException,
  captureRejection,
  captureReactError,
  setupGlobalHandlers,
  SESSION_ID,
} from '../errorReporter';

describe('errorReporter - Real Implementation Tests', () => {
  let fetchMock: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock fetch globally
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ error_id: 'err_123' }),
    });
    global.fetch = fetchMock as any;

    // Mock console.error to verify silent failure
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Use fake timers for deduplication tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('SESSION_ID', () => {
    test('generates stable UUID-like session identifier', () => {
      expect(typeof SESSION_ID).toBe('string');
      expect(SESSION_ID.length).toBeGreaterThan(0);
      // Should be UUID format (36 chars) or fallback format (session-timestamp-random)
      expect(SESSION_ID).toMatch(/^([a-f0-9-]{36}|session-\d+-[\da-z]+)$/i);
    });
  });

  describe('captureException', () => {
    test('sends unhandled exception with error type and message', async () => {
      const error = new Error('Cannot read property of undefined');
      error.stack = 'Error: Cannot read...\n  at test.ts:1';

      await captureException(error);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/errors',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload).toMatchObject({
        type: 'unhandled_exception',
        message: 'Cannot read property of undefined',
        session_id: SESSION_ID,
        severity: 'error',
      });
      expect(payload.timestamp).toBeDefined();
      expect(payload.url).toBeDefined(); // includes current URL
      expect(payload.user_agent).toBeDefined(); // includes navigator.userAgent
    });

    test('respects custom severity option', async () => {
      const error = new Error('Critical system failure');

      await captureException(error, { severity: 'critical' });

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.severity).toBe('critical');
    });

    test('includes custom error code when provided', async () => {
      const error = new Error('Data provider unavailable');

      await captureException(error, {
        code: 'DATA_PROVIDER_UNAVAILABLE',
      });

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.code).toBe('DATA_PROVIDER_UNAVAILABLE');
    });

    test('includes stack trace in payload', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n  at file.ts:42\n  at async handler.ts:10';

      await captureException(error);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.stack).toContain('at file.ts:42');
    });

    test('silently fails if fetch throws (never crashes app)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const error = new Error('Test error');

      // Should not throw
      await expect(captureException(error)).resolves.toBeUndefined();

      // Should log to console.error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[errorReporter]'),
        expect.any(Error)
      );
    });
  });

  describe('captureRejection', () => {
    test('captures Error rejection with unhandled_rejection type', async () => {
      const error = new Error('Promise rejected');
      error.stack = 'at async operation (async.ts:5)';

      await captureRejection(error);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload).toMatchObject({
        type: 'unhandled_rejection',
        message: 'Promise rejected',
        severity: 'error',
      });
      expect(payload.stack).toContain('async operation');
    });

    test('handles string rejection reason', async () => {
      const reason = 'Promise rejected with string reason';

      await captureRejection(reason);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload).toMatchObject({
        type: 'unhandled_rejection',
        message: 'Promise rejected with string reason',
      });
    });

    test('uses fallback message for non-Error/non-string rejection', async () => {
      const reason = { error: 'object rejection' };

      await captureRejection(reason);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.message).toBe('Unhandled promise rejection');
    });

    test('includes error code when provided', async () => {
      const error = new Error('API timeout');

      await captureRejection(error, { code: 'TIMEOUT' });

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.code).toBe('TIMEOUT');
    });
  });

  describe('captureReactError', () => {
    test('sends react_error with critical severity', async () => {
      const error = new Error('Cannot render component');
      const componentStack = 'ErrorBoundary\n  Dashboard\n  App';

      await captureReactError(error, componentStack);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload).toMatchObject({
        type: 'react_error',
        message: 'Cannot render component',
        component_stack: componentStack,
        severity: 'critical',
      });
    });

    test('includes component stack in payload', async () => {
      const error = new Error('Render failed');
      const componentStack =
        'ErrorBoundary\n  StockDetail\n  Layout\n  App';

      await captureReactError(error, componentStack);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.component_stack).toBe(componentStack);
    });
  });

  describe('Deduplication', () => {
    test('suppresses identical errors within 5-second window', async () => {
      const error = new Error('Duplicate error');

      // First error should be sent
      await captureException(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Immediate second call should be suppressed
      await captureException(error);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // After 5-second debounce, should send again
      jest.advanceTimersByTime(5001);
      await captureException(error);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('treats different error messages as separate errors', async () => {
      const error1 = new Error('Error message 1');
      const error2 = new Error('Error message 2');

      await captureException(error1);
      await captureException(error2);

      // Both should be sent (not deduplicated)
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('deduplicates by error type and message', async () => {
      // Different error types but same message should not be deduplicated
      const error = new Error('Same message');

      await captureException(error, { severity: 'error' });
      await captureRejection(error); // Different type

      // Should send both (different type)
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Payload Truncation', () => {
    test('truncates stack if payload exceeds 64 KB', async () => {
      const error = new Error('Large stack');
      // Create stack large enough to exceed 64 KB when serialized
      error.stack = 'Error: Large\n' + 'at line.ts:1\n'.repeat(10000);

      await captureException(error);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      const serialized = JSON.stringify(payload);

      // Payload should be under 64 KB
      expect(serialized.length).toBeLessThanOrEqual(65536);

      // Stack should be truncated (5000 chars max)
      if (payload.stack) {
        expect(payload.stack.length).toBeLessThanOrEqual(5000);
      }
    });

    test('keeps payload under limit by truncating stack', async () => {
      const error = new Error('Very large error');
      error.stack = 'x'.repeat(100000);

      await captureException(error);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      const serialized = JSON.stringify(payload);

      expect(serialized.length).toBeLessThanOrEqual(65536);
    });
  });

  describe('setupGlobalHandlers', () => {
    let originalAddEventListener: typeof window.addEventListener;
    let errorListeners: Array<(event: ErrorEvent) => void> = [];
    let rejectionListeners: Array<(event: PromiseRejectionEvent) => void> = [];

    beforeEach(() => {
      errorListeners = [];
      rejectionListeners = [];

      originalAddEventListener = window.addEventListener;
      window.addEventListener = jest.fn((event: string, handler: any) => {
        if (event === 'error') {
          errorListeners.push(handler);
        } else if (event === 'unhandledrejection') {
          rejectionListeners.push(handler);
        }
      }) as any;
    });

    afterEach(() => {
      window.addEventListener = originalAddEventListener;
    });

    test('registers error event listener for uncaught exceptions', () => {
      setupGlobalHandlers();

      expect(window.addEventListener).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
    });

    test('registers unhandledrejection listener', () => {
      setupGlobalHandlers();

      expect(window.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function)
      );
    });

    test('captures uncaught exception via error event', async () => {
      setupGlobalHandlers();

      const error = new Error('Uncaught exception');
      const errorEvent = new ErrorEvent('error', { error });

      errorListeners[0](errorEvent);

      // Should call fetch
      expect(fetchMock).toHaveBeenCalled();
      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.message).toBe('Uncaught exception');
    });

    test('captures unhandled promise rejection via unhandledrejection event', async () => {
      setupGlobalHandlers();

      const reason = new Error('Unhandled rejection');
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        reason,
        promise: Promise.reject(reason),
      });

      rejectionListeners[0](rejectionEvent);

      // Should call fetch
      expect(fetchMock).toHaveBeenCalled();
      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.message).toBe('Unhandled rejection');
    });
  });

  describe('Integration - Error Flow', () => {
    test('complete flow from capture to API call', async () => {
      const error = new Error('Test integration');
      error.stack = 'Error: Test\n  at test.ts:1\n  at runner.ts:5';

      await captureException(error, {
        code: 'TEST_ERROR',
        severity: 'warning',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/errors',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload).toMatchObject({
        type: 'unhandled_exception',
        message: 'Test integration',
        code: 'TEST_ERROR',
        severity: 'warning',
        session_id: SESSION_ID,
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles error with no stack trace', async () => {
      const error = new Error('No stack');
      error.stack = undefined;

      await captureException(error);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.message).toBe('No stack');
      expect(payload.stack).toBeUndefined();
    });

    test('handles error with empty message', async () => {
      const error = new Error('');

      await captureException(error);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.message).toBe('');
    });

    test('handles rejection with null reason', async () => {
      await captureRejection(null);

      const payload = JSON.parse(
        (fetchMock.mock.calls[0][1] as any).body
      );
      expect(payload.message).toBe('Unhandled promise rejection');
    });

    test('does not throw if window is undefined (SSR context)', async () => {
      const originalWindow = global.window;
      delete (global as any).window;

      const error = new Error('SSR error');

      // Should not throw
      await expect(captureException(error)).resolves.toBeUndefined();

      (global as any).window = originalWindow;
    });
  });
});
