import { renderHook, act } from '@testing-library/react';
import { useWSPrices } from '../useWSPrices';
import type { PriceUpdate } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

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
    simulateClose() {
      this.readyState = 3; // CLOSED
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
(MockWebSocketConstructor as unknown as { OPEN: number; CONNECTING: number; CLOSED: number }).OPEN = 1;
(MockWebSocketConstructor as unknown as { OPEN: number; CONNECTING: number; CLOSED: number }).CONNECTING = 0;
(MockWebSocketConstructor as unknown as { OPEN: number; CONNECTING: number; CLOSED: number }).CLOSED = 3;

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWSPrices', () => {
  describe('Happy path: connect and subscribe', () => {
    it('should open a WebSocket connection on mount', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      expect(MockWebSocketConstructor).toHaveBeenCalledTimes(1);
    });

    it('should send subscribe message with provided tickers on open', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL', 'MSFT'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
        type: 'subscribe',
        tickers: ['AAPL', 'MSFT'],
      });
    });

    it('should not send subscribe when tickers list is empty on open', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: [], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('Happy path: receive price updates', () => {
    it('should call onPriceUpdate when a price_update message is received', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      const priceUpdate: PriceUpdate = {
        type: 'price_update',
        ticker: 'AAPL',
        price: 175.5,
        change: 2.5,
        change_pct: 1.45,
        volume: 1_000_000,
        timestamp: '2026-02-27T12:00:00Z',
      };

      act(() => { ws.simulateMessage(priceUpdate); });

      expect(onPriceUpdate).toHaveBeenCalledWith(priceUpdate);
    });

    it('should not call onPriceUpdate for non-price_update messages', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      act(() => { ws.simulateMessage({ type: 'connected', client_id: 'abc123' }); });
      act(() => { ws.simulateMessage({ type: 'subscribed', tickers: ['AAPL'] }); });
      act(() => { ws.simulateMessage({ type: 'pong' }); });

      expect(onPriceUpdate).not.toHaveBeenCalled();
    });

    it('should silently ignore malformed (non-JSON) messages', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      act(() => {
        if (ws.onmessage) {
          ws.onmessage(new MessageEvent('message', { data: 'NOT_JSON{{{' }));
        }
      });

      expect(onPriceUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Reconnect: backoff on disconnect', () => {
    it('should reconnect with 1s delay after first disconnect', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws1 = wsInstances[0];
      act(() => { ws1.simulateOpen(); });

      act(() => { ws1.simulateClose(); });

      expect(wsInstances).toHaveLength(1);

      act(() => { jest.advanceTimersByTime(1_000); });

      expect(wsInstances).toHaveLength(2);
    });

    it('should use increasing backoff delays on repeated failures', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      act(() => { wsInstances[0].simulateClose(); });
      act(() => { jest.advanceTimersByTime(1_000); });
      expect(wsInstances).toHaveLength(2);

      act(() => { wsInstances[1].simulateClose(); });
      act(() => { jest.advanceTimersByTime(999); });
      expect(wsInstances).toHaveLength(2);
      act(() => { jest.advanceTimersByTime(1); });
      expect(wsInstances).toHaveLength(3);
    });

    it('should reset retry count to 0 after a successful open', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      act(() => { wsInstances[0].simulateClose(); });
      act(() => { jest.advanceTimersByTime(1_000); });
      act(() => { wsInstances[1].simulateClose(); });
      act(() => { jest.advanceTimersByTime(2_000); });

      act(() => { wsInstances[2].simulateOpen(); });

      act(() => { wsInstances[2].simulateClose(); });
      act(() => { jest.advanceTimersByTime(1_000); });
      expect(wsInstances).toHaveLength(4);
    });
  });

  describe('Cleanup: unmount stops reconnect', () => {
    it('should not reconnect after the hook is unmounted', () => {
      const onPriceUpdate = jest.fn();
      const { unmount } = renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      act(() => { wsInstances[0].simulateOpen(); });

      unmount();

      expect(wsInstances[0].close).toHaveBeenCalled();

      act(() => { jest.advanceTimersByTime(5_000); });
      expect(wsInstances).toHaveLength(1);
    });
  });

  describe('Disabled: no connection when enabled=false', () => {
    it('should not open a WebSocket when enabled is false', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate, enabled: false }));

      expect(MockWebSocketConstructor).not.toHaveBeenCalled();
    });
  });

  describe('Error handling: onerror closes socket', () => {
    it('should close socket on error and attempt reconnect', () => {
      const onPriceUpdate = jest.fn();
      renderHook(() => useWSPrices({ tickers: ['AAPL'], onPriceUpdate }));

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      act(() => {
        if (ws.onerror) ws.onerror(new Event('error'));
      });

      expect(ws.close).toHaveBeenCalled();

      act(() => { jest.advanceTimersByTime(1_000); });
      expect(wsInstances).toHaveLength(2);
    });
  });

  describe('Dynamic updates: ticker changes while connected', () => {
    it('should re-subscribe when tickers change while socket is open', () => {
      const onPriceUpdate = jest.fn();
      const { rerender } = renderHook(
        ({ tickers }: { tickers: string[] }) =>
          useWSPrices({ tickers, onPriceUpdate }),
        { initialProps: { tickers: ['AAPL'] } }
      );

      const ws = wsInstances[0];
      act(() => { ws.simulateOpen(); });

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({
        type: 'subscribe',
        tickers: ['AAPL'],
      });

      act(() => { rerender({ tickers: ['AAPL', 'MSFT', 'GOOG'] }); });

      expect(ws.send).toHaveBeenCalledTimes(2);
      expect(JSON.parse(ws.send.mock.calls[1][0])).toEqual({
        type: 'subscribe',
        tickers: ['AAPL', 'MSFT', 'GOOG'],
      });
    });

    it('should not re-subscribe when tickers change but socket is not open', () => {
      const onPriceUpdate = jest.fn();
      const { rerender } = renderHook(
        ({ tickers }: { tickers: string[] }) =>
          useWSPrices({ tickers, onPriceUpdate }),
        { initialProps: { tickers: ['AAPL'] } }
      );

      const ws = wsInstances[0];

      act(() => { rerender({ tickers: ['AAPL', 'MSFT'] }); });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});