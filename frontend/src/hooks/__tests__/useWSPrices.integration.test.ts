import { renderHook, act, waitFor } from '@testing-library/react';
import { useWSPrices, type WSStatus } from '../useWSPrices';
import type { PriceUpdate } from '@/lib/types';

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
  }

  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: Record<string, unknown>) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) this.onerror();
  }

  simulateClose() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
}

describe('useWSPrices', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    // Replace global WebSocket with mock
    (global as any).WebSocket = function (url: string) {
      mockWs = new MockWebSocket(url);
      return mockWs;
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete (global as any).WebSocket;
  });

  test('connects and subscribes to tickers on mount', async () => {
    const onPriceUpdate = jest.fn();

    renderHook(() =>
      useWSPrices({ tickers: ['AAPL', 'MSFT'], onPriceUpdate, enabled: true })
    );

    // Wait for connect callback
    await act(async () => {
      await waitFor(() => expect(mockWs).toBeDefined());
    });

    // Simulate WebSocket open
    mockWs.simulateOpen();

    await waitFor(() => {
      const subscribeMsg = mockWs.sentMessages.find((m) => m.includes('subscribe'));
      expect(subscribeMsg).toBeDefined();
      const parsed = JSON.parse(subscribeMsg!);
      expect(parsed.tickers).toEqual(['AAPL', 'MSFT']);
    });
  });

  test('handles price_update message (single ticker)', async () => {
    const onPriceUpdate = jest.fn();

    renderHook(() =>
      useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled: true })
    );

    mockWs.simulateOpen();

    const priceUpdate: PriceUpdate = {
      type: 'price_update',
      ticker: 'AAPL',
      price: 150.25,
      change: 2.5,
      change_pct: 1.68,
      volume: 1000000,
      timestamp: new Date().toISOString(),
    };

    mockWs.simulateMessage(priceUpdate);

    await waitFor(() => {
      expect(onPriceUpdate).toHaveBeenCalledWith(priceUpdate);
    });
  });

  test('handles price_batch message (multi-ticker broadcast)', async () => {
    const onPriceUpdate = jest.fn();

    renderHook(() =>
      useWSPrices({ tickers: ['AAPL', 'MSFT'], onPriceUpdate, enabled: true })
    );

    mockWs.simulateOpen();

    const now = Math.floor(Date.now() / 1000);
    const batchMessage = {
      type: 'price_batch',
      data: {
        AAPL: {
          price: 150.25,
          change: 2.5,
          change_pct: 1.68,
          volume: 1000000,
          ts: now,
        },
        MSFT: {
          price: 420.5,
          change: -1.0,
          change_pct: -0.24,
          volume: 500000,
          ts: now,
        },
      },
    };

    mockWs.simulateMessage(batchMessage);

    await waitFor(() => {
      expect(onPriceUpdate).toHaveBeenCalledTimes(2);

      // Verify both calls have correct structure
      const calls = onPriceUpdate.mock.calls;
      expect(calls[0][0].ticker).toBe('AAPL');
      expect(calls[0][0].price).toBe(150.25);
      expect(calls[1][0].ticker).toBe('MSFT');
      expect(calls[1][0].price).toBe(420.5);
    });
  });

  test('re-subscribes when tickers change while connected', async () => {
    const onPriceUpdate = jest.fn();

    const { rerender } = renderHook(
      ({ tickers }) => useWSPrices({ tickers, onPriceUpdate, enabled: true }),
      { initialProps: { tickers: ['AAPL'] } }
    );

    mockWs.simulateOpen();

    // Change tickers
    rerender({ tickers: ['MSFT', 'GOOGL'] });

    await waitFor(() => {
      const subscribeMessages = mockWs.sentMessages.filter((m) =>
        m.includes('subscribe')
      );
      expect(subscribeMessages.length).toBeGreaterThan(1);

      const lastSubscribe = JSON.parse(subscribeMessages[subscribeMessages.length - 1]);
      expect(lastSubscribe.tickers).toEqual(['MSFT', 'GOOGL']);
    });
  });

  test('reconnects with exponential backoff on connection error', async () => {
    const onPriceUpdate = jest.fn();

    renderHook(() =>
      useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled: true })
    );

    mockWs.simulateOpen();
    mockWs.simulateError();

    // First reconnect should use 1000ms backoff
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    // Advance to first retry
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Second error should use 2000ms backoff
    mockWs.simulateError();

    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  test('ignores malformed messages gracefully', async () => {
    const onPriceUpdate = jest.fn();

    renderHook(() =>
      useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled: true })
    );

    mockWs.simulateOpen();

    // Send invalid JSON (caught by try/catch)
    if (mockWs.onmessage) {
      mockWs.onmessage(new MessageEvent('message', { data: '{invalid json' }));
    }

    // Should not crash; onPriceUpdate should not be called
    expect(onPriceUpdate).not.toHaveBeenCalled();
  });

  test('does not reconnect after intentional cleanup', async () => {
    const onPriceUpdate = jest.fn();

    const { unmount } = renderHook(() =>
      useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled: true })
    );

    mockWs.simulateOpen();

    unmount();

    // Close should be triggered without onclose handler to prevent reconnect
    expect(mockWs.readyState).toBe(3); // CLOSED
  });

  test('handles disabled prop by closing connection', async () => {
    const onPriceUpdate = jest.fn();

    const { rerender } = renderHook(
      ({ enabled }) => useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled }),
      { initialProps: { enabled: true } }
    );

    mockWs.simulateOpen();

    // Disable the hook
    rerender({ enabled: false });

    await waitFor(() => {
      expect(mockWs.readyState).toBe(3); // CLOSED
    });
  });

  test('sendRefresh only works when connected', async () => {
    const onPriceUpdate = jest.fn();

    const { result } = renderHook(() =>
      useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled: true })
    );

    mockWs.simulateOpen();

    // Should be able to send refresh when open
    act(() => {
      result.current.sendRefresh();
    });

    const refreshMsg = mockWs.sentMessages.find((m) => m.includes('refresh'));
    expect(refreshMsg).toBeDefined();

    // Close connection
    mockWs.simulateClose();

    const msgCountBefore = mockWs.sentMessages.length;

    // Try to send refresh when closed
    act(() => {
      result.current.sendRefresh();
    });

    // Should not add a new message
    expect(mockWs.sentMessages.length).toBe(msgCountBefore);
  });
});
