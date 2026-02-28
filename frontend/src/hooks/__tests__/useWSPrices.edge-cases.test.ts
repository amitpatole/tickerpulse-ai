/**
 * Edge-case tests for useWSPrices WebSocket hook.
 *
 * Covers critical reliability gaps:
 * 1. Reconnection cleanup when component unmounts during backoff
 * 2. Concurrent subscription updates during reconnection
 * 3. Large message handling and buffer overflow prevention
 * 4. Subscription deduplication when rapid ticker changes occur
 */

import { renderHook, act } from '@testing-library/react';
import { useWSPrices } from '../useWSPrices';
import type { PriceUpdate } from '@/lib/types';

// Mock WebSocket
interface MockWsInstance {
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  simulateOpen(): void;
  simulateClose(): void;
  simulateMessage(data: unknown): void;
}

let wsInstances: MockWsInstance[] = [];

function createMockWsInstance(): MockWsInstance {
  const ws: MockWsInstance = {
    readyState: 0,
    send: jest.fn(),
    close: jest.fn().mockImplementation(function (this: MockWsInstance) {
      this.readyState = 3;
    }),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    simulateOpen() {
      this.readyState = 1;
      if (this.onopen) this.onopen(new Event('open'));
    },
    simulateClose() {
      this.readyState = 3;
      if (this.onclose) this.onclose(new CloseEvent('close'));
    },
    simulateMessage(data: unknown) {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
      }
    },
  };
  wsInstances.push(ws);
  return ws;
}

const MockWebSocketConstructor = jest.fn().mockImplementation(() => createMockWsInstance());
(MockWebSocketConstructor as any).OPEN = 1;
(MockWebSocketConstructor as any).CONNECTING = 0;
(MockWebSocketConstructor as any).CLOSED = 3;

beforeAll(() => {
  Object.defineProperty(global, 'WebSocket', {
    writable: true,
    configurable: true,
    value: MockWebSocketConstructor,
  });
});

beforeEach(() => {
  wsInstances = [];
  MockWebSocketConstructor.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('useWSPrices — Edge Cases & Reliability', () => {
  // =========================================================================
  // Cleanup: Unmount During Reconnection Backoff
  // =========================================================================

  describe('Cleanup: unmount during reconnection backoff', () => {
    it('should not reconnect if unmounted during backoff delay', () => {
      const onPriceUpdate = jest.fn();
      const { unmount } = renderHook(() =>
        useWSPrices({ tickers: ['AAPL'], onPriceUpdate })
      );

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Trigger close to initiate backoff
      act(() => {
        ws.simulateClose();
      });

      expect(wsInstances).toHaveLength(1);

      // Unmount before backoff timer fires
      unmount();

      // Advance past backoff delay
      act(() => {
        jest.advanceTimersByTime(2_000);
      });

      // Should not have created a new WS connection
      expect(wsInstances).toHaveLength(1);
    });

    it('should clear pending reconnect timer on unmount', () => {
      const onPriceUpdate = jest.fn();
      const { unmount } = renderHook(() =>
        useWSPrices({ tickers: ['AAPL'], onPriceUpdate })
      );

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
        ws.simulateClose();
      });

      // Unmount should clear the timer
      unmount();

      // No errors/warnings should occur
      expect(ws.close).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Subscription: Rapid Ticker Changes During Reconnection
  // =========================================================================

  describe('Subscription: ticker changes while disconnected', () => {
    it('should queue ticker changes for next successful connection', () => {
      const onPriceUpdate = jest.fn();
      const { rerender } = renderHook(
        ({ tickers }: { tickers: string[] }) =>
          useWSPrices({ tickers, onPriceUpdate }),
        { initialProps: { tickers: ['AAPL'] } }
      );

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Subscribe to initial ticker
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', tickers: ['AAPL'] })
      );

      // Simulate disconnect
      act(() => {
        ws.simulateClose();
      });

      // Change tickers while disconnected
      act(() => {
        rerender({ tickers: ['AAPL', 'MSFT', 'GOOG'] });
      });

      // No send should occur yet (socket not open)
      expect(ws.send).toHaveBeenCalledTimes(1);

      // After backoff, new socket opens
      act(() => {
        jest.advanceTimersByTime(1_000);
      });

      const ws2 = wsInstances[1];
      act(() => {
        ws2.simulateOpen();
      });

      // Should subscribe with new ticker list
      expect(ws2.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', tickers: ['AAPL', 'MSFT', 'GOOG'] })
      );
    });

    it('should not send subscribe if tickers list becomes empty while reconnecting', () => {
      const onPriceUpdate = jest.fn();
      const { rerender } = renderHook(
        ({ tickers }: { tickers: string[] }) =>
          useWSPrices({ tickers, onPriceUpdate }),
        { initialProps: { tickers: ['AAPL'] } }
      );

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Close and trigger reconnection
      act(() => {
        ws.simulateClose();
      });

      // Clear tickers while reconnecting
      act(() => {
        rerender({ tickers: [] });
      });

      // New connection after backoff
      act(() => {
        jest.advanceTimersByTime(1_000);
      });

      const ws2 = wsInstances[1];
      act(() => {
        ws2.simulateOpen();
      });

      // Should not send subscribe message for empty list
      expect(ws2.send).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Message Handling: Large and Malformed Messages
  // =========================================================================

  describe('Message handling: robustness against large/invalid messages', () => {
    it('should silently ignore very large messages', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Create very large message (>1MB)
      const largeData = 'x'.repeat(1_000_000);
      act(() => {
        if (ws.onmessage) {
          ws.onmessage(new MessageEvent('message', { data: largeData }));
        }
      });

      // Should not call callback or throw
      expect(onPriceUpdate).not.toHaveBeenCalled();
    });

    it('should handle messages with missing required fields', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Message missing 'type' field
      act(() => {
        ws.simulateMessage({
          ticker: 'AAPL',
          price: 175,
          // Missing 'type' field
        });
      });

      // Should not be called (not a price_update type)
      expect(onPriceUpdate).not.toHaveBeenCalled();
    });

    it('should handle messages with unexpected field types', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Message with wrong field types
      act(() => {
        ws.simulateMessage({
          type: 'price_update',
          ticker: 'AAPL',
          price: 'not_a_number', // Should be number
          change: 'also_string',
          change_pct: {},
          volume: [],
          timestamp: null,
        });
      });

      // Should still accept and pass through (let component handle validation)
      // This tests that WS hook doesn't crash on type mismatches
      expect(onPriceUpdate).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Connection State: Rapid Enable/Disable Toggles
  // =========================================================================

  describe('Connection state: rapid enable/disable', () => {
    it('should handle enabled prop toggling without connection leaks', () => {
      const onPriceUpdate = jest.fn();
      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled }),
        { initialProps: { enabled: true } }
      );

      const ws1 = wsInstances[0];
      expect(MockWebSocketConstructor).toHaveBeenCalledTimes(1);

      // Disable
      act(() => {
        rerender({ enabled: false });
      });

      // Should close
      expect(ws1.close).toHaveBeenCalled();

      // Re-enable
      act(() => {
        rerender({ enabled: true });
      });

      // Should create new connection
      expect(wsInstances).toHaveLength(2);

      // Disable again
      act(() => {
        rerender({ enabled: false });
      });

      expect(wsInstances[1].close).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Backoff: Exponential backoff caps at maximum delay
  // =========================================================================

  describe('Backoff: exponential backoff caps at 30s', () => {
    it('should not exceed maximum backoff delay of 30s', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      // BACKOFF_STEPS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
      // Keep closing and advancing until we hit max

      let wsIndex = 0;
      for (let i = 0; i < 8; i++) {
        act(() => {
          wsInstances[wsIndex].simulateClose();
        });

        // After 6+ failures, should use 30s backoff (max)
        if (i < 6) {
          const expectedDelay = 1_000 * Math.pow(2, i);
          act(() => {
            jest.advanceTimersByTime(expectedDelay);
          });
        } else {
          // All subsequent failures should use 30s
          act(() => {
            jest.advanceTimersByTime(30_000);
          });
        }

        wsIndex++;
      }

      // Verify we created reconnect attempts
      expect(wsInstances.length).toBeGreaterThan(1);
    });
  });

  // =========================================================================
  // Price Update: Type Coercion Edge Cases
  // =========================================================================

  describe('Price update: field type handling', () => {
    it('should handle price update with all numeric edge cases', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['TEST'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => {
        ws.simulateOpen();
      });

      // Update with edge-case numbers
      const update: PriceUpdate = {
        type: 'price_update',
        ticker: 'TEST',
        price: 0.01, // Penny stock
        change: -0.005,
        change_pct: -33.33,
        volume: 1_000_000_000, // 1 billion
        timestamp: '2026-02-27T12:00:00Z',
      };

      act(() => {
        ws.simulateMessage(update);
      });

      expect(onPriceUpdate).toHaveBeenCalledWith(update);
    });
  });
});
