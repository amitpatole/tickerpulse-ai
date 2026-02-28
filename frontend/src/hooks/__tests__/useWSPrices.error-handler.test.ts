/**
 * Tests for useWSPrices error handling improvements
 * Verifies:
 * - 'error' status added to WSStatus type
 * - Error handler properly schedules reconnect without duplicate timers
 * - Component can recover from WebSocket errors
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useWSPrices, type WSStatus, type UseWSPricesOptions } from '../useWSPrices';

interface MockWsInstance {
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  simulateOpen(): void;
  simulateError(): void;
}

let wsInstances: MockWsInstance[] = [];

function createMockWsInstance(): MockWsInstance {
  const ws: MockWsInstance = {
    readyState: 0, // CONNECTING
    send: jest.fn(),
    close: jest.fn().mockImplementation(function (this: MockWsInstance) {
      this.readyState = 3; // CLOSED
    }),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    simulateOpen() {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen(new Event('open'));
    },
    simulateError() {
      if (this.onerror) this.onerror(new Event('error'));
    },
  };
  wsInstances.push(ws);
  return ws;
}

const MockWebSocketConstructor = jest.fn().mockImplementation(() => createMockWsInstance());

beforeAll(() => {
  Object.defineProperty(global, 'WebSocket', {
    writable: true,
    value: MockWebSocketConstructor,
  });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllMocks();
  wsInstances = [];
});

afterAll(() => {
  jest.useRealTimers();
});

describe('useWSPrices - Error Handler Improvements', () => {
  describe('Happy Path: Error Status Transitions', () => {
    it('should transition to error status when socket error occurs', async () => {
      const onPriceUpdate = jest.fn();

      const { result } = renderHook(() =>
        useWSPrices({
          tickers: ['AAPL'],
          onPriceUpdate,
          enabled: true,
        })
      );

      const ws = wsInstances[0];

      // Initial state: connecting
      expect(result.current.status).toBe('connecting');

      // Simulate socket open
      act(() => {
        ws.simulateOpen();
      });

      expect(result.current.status).toBe('open');

      // Simulate error
      act(() => {
        ws.simulateError();
      });

      expect(result.current.status).toBe('error');
    });

    it('should schedule reconnect timer when error occurs', async () => {
      const onPriceUpdate = jest.fn();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      renderHook(() =>
        useWSPrices({
          tickers: ['AAPL'],
          onPriceUpdate,
          enabled: true,
        })
      );

      const ws = wsInstances[0];

      // Simulate connection open then error
      act(() => {
        ws.simulateOpen();
      });

      setTimeoutSpy.mockClear();

      act(() => {
        ws.simulateError();
      });

      // Verify close was called
      expect(ws.close).toHaveBeenCalled();

      // Verify setTimeout was called for reconnect (1s backoff)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('Error Handler: Prevents Duplicate Reconnects', () => {
    it('should null onclose before calling close() to prevent duplicate reconnect', async () => {
      const onPriceUpdate = jest.fn();

      renderHook(() =>
        useWSPrices({
          tickers: ['AAPL'],
          onPriceUpdate,
          enabled: true,
        })
      );

      const ws = wsInstances[0];

      // Open connection
      act(() => {
        ws.simulateOpen();
      });

      // Before error, onclose is set
      expect(ws.onclose).not.toBeNull();

      // Simulate error - handler nulls onclose before calling close()
      act(() => {
        ws.simulateError();
      });

      // After error handler, onclose should be null (preventing duplicate reconnect)
      expect(ws.onclose).toBeNull();
    });

    it('should not update state if unmounted before error handler completes', async () => {
      const onPriceUpdate = jest.fn();

      const { unmount } = renderHook(() =>
        useWSPrices({
          tickers: ['AAPL'],
          onPriceUpdate,
          enabled: true,
        })
      );

      const ws = wsInstances[0];

      // Open connection
      act(() => {
        ws.simulateOpen();
      });

      // Unmount component
      unmount();

      // Clear mocks after unmount
      jest.clearAllMocks();

      // Error handler should detect !mountedRef and return early
      act(() => {
        ws.simulateError();
      });

      // No timer should be scheduled since component is unmounted
      expect(global.setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('Error Recovery: Exponential Backoff', () => {
    it('should apply exponential backoff delays on repeated errors', async () => {
      const onPriceUpdate = jest.fn();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      renderHook(() =>
        useWSPrices({
          tickers: ['AAPL'],
          onPriceUpdate,
          enabled: true,
        })
      );

      const ws1 = wsInstances[0];

      // First connection -> error (1s backoff)
      act(() => {
        ws1.simulateOpen();
      });

      setTimeoutSpy.mockClear();
      act(() => {
        ws1.simulateError();
      });

      const firstBackoff = setTimeoutSpy.mock.calls.find(
        (call) => typeof call[1] === 'number'
      );
      expect(firstBackoff?.[1]).toBe(1000);

      // Advance timer to trigger reconnect
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const ws2 = wsInstances[1];
      if (ws2) {
        // Second connection -> error (2s backoff)
        act(() => {
          ws2.simulateOpen();
        });

        setTimeoutSpy.mockClear();
        act(() => {
          ws2.simulateError();
        });

        const secondBackoff = setTimeoutSpy.mock.calls.find(
          (call) => typeof call[1] === 'number'
        );
        expect(secondBackoff?.[1]).toBe(2000);
      }

      setTimeoutSpy.mockRestore();
    });
  });

  describe('Type Safety: Error Status Completeness', () => {
    it('should accept error as a valid WSStatus value', () => {
      const statusValues: WSStatus[] = [
        'connecting',
        'open',
        'closed',
        'error',
      ];

      expect(statusValues).toContain('error');
      expect(statusValues).toHaveLength(4);
    });

    it('should cleanly transition between enabled/disabled with error state', () => {
      const onPriceUpdate = jest.fn();

      const { result, rerender } = renderHook(
        (props: UseWSPricesOptions) => useWSPrices(props),
        {
          initialProps: {
            tickers: ['AAPL'],
            onPriceUpdate,
            enabled: true,
          },
        }
      );

      const ws = wsInstances[0];

      // Connection -> Error
      act(() => {
        ws.simulateOpen();
        ws.simulateError();
      });

      expect(result.current.status).toBe('error');

      // Disable hook
      rerender({
        tickers: ['AAPL'],
        onPriceUpdate,
        enabled: false,
      });

      expect(result.current.status).toBe('closed');

      // Re-enable hook
      rerender({
        tickers: ['AAPL'],
        onPriceUpdate,
        enabled: true,
      });

      expect(result.current.status).toBe('connecting');
    });
  });
});
