/**
 * Tests for useSSE hook - real-time price update integration
 *
 * Focuses on price_update event handling:
 * - Parses price_update events from SSE stream
 * - Stores price updates indexed by ticker
 * - Handles multiple updates for same ticker (merge behavior)
 * - Works alongside other event types
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSSE } from '../useSSE';

describe('useSSE - price_update event handling', () => {
  // Mock EventSource
  const mockEventSource = {
    close: jest.fn(),
    addEventListener: jest.fn(),
    onopen: null as ((event: Event) => void) | null,
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).EventSource = jest.fn(() => mockEventSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('stores price_update event in priceUpdates map indexed by ticker', async () => {
    const { result } = renderHook(() => useSSE());

    // Simulate connection and price_update event
    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const priceUpdateEvent = {
      type: 'price_update',
      data: {
        ticker: 'AAPL',
        price: 150.25,
        change: 1.5,
        change_pct: 1.0,
        timestamp: '2025-01-01T12:00:00Z',
      },
      timestamp: '2025-01-01T12:00:00Z',
    };

    // Trigger price_update via addEventListener (how SSE hook registers listeners)
    act(() => {
      const listener = mockEventSource.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'price_update'
      )?.[1];
      if (listener) {
        listener(
          new MessageEvent('price_update', {
            data: JSON.stringify(priceUpdateEvent.data),
          })
        );
      }
    });

    await waitFor(() => {
      expect(result.current.priceUpdates['AAPL']).toBeDefined();
    });

    expect(result.current.priceUpdates['AAPL']).toMatchObject({
      ticker: 'AAPL',
      price: 150.25,
      change: 1.5,
      change_pct: 1.0,
    });
  });

  test('handles multiple price updates for same ticker (merge behavior)', async () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const listener = mockEventSource.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'price_update'
    )?.[1];

    if (!listener) throw new Error('price_update listener not registered');

    // First update
    act(() => {
      listener(
        new MessageEvent('price_update', {
          data: JSON.stringify({
            ticker: 'AAPL',
            price: 150.0,
            change: 1.0,
            change_pct: 0.67,
            timestamp: '2025-01-01T12:00:00Z',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.priceUpdates['AAPL']?.price).toBe(150.0);
    });

    // Second update for same ticker
    act(() => {
      listener(
        new MessageEvent('price_update', {
          data: JSON.stringify({
            ticker: 'AAPL',
            price: 150.5,
            change: 1.5,
            change_pct: 1.01,
            timestamp: '2025-01-01T12:01:00Z',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.priceUpdates['AAPL']?.price).toBe(150.5);
    });

    // Verify latest update replaced previous
    expect(result.current.priceUpdates['AAPL']).toMatchObject({
      ticker: 'AAPL',
      price: 150.5,
      change: 1.5,
      change_pct: 1.01,
    });
  });

  test('maintains separate entries for multiple tickers in priceUpdates', async () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const listener = mockEventSource.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'price_update'
    )?.[1];

    if (!listener) throw new Error('price_update listener not registered');

    // AAPL update
    act(() => {
      listener(
        new MessageEvent('price_update', {
          data: JSON.stringify({
            ticker: 'AAPL',
            price: 150.25,
            change: 1.5,
            change_pct: 1.0,
            timestamp: '2025-01-01T12:00:00Z',
          }),
        })
      );
    });

    // GOOGL update
    act(() => {
      listener(
        new MessageEvent('price_update', {
          data: JSON.stringify({
            ticker: 'GOOGL',
            price: 140.75,
            change: 2.25,
            change_pct: 1.62,
            timestamp: '2025-01-01T12:00:00Z',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.priceUpdates['AAPL']).toBeDefined();
      expect(result.current.priceUpdates['GOOGL']).toBeDefined();
    });

    // Both should exist independently
    expect(result.current.priceUpdates['AAPL'].price).toBe(150.25);
    expect(result.current.priceUpdates['GOOGL'].price).toBe(140.75);
  });

  test('price_update coexists with other event types without interference', async () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const priceListener = mockEventSource.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'price_update'
    )?.[1];

    const alertListener = mockEventSource.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'alert'
    )?.[1];

    if (!priceListener || !alertListener) {
      throw new Error('price_update or alert listener not registered');
    }

    // Send price_update
    act(() => {
      priceListener(
        new MessageEvent('price_update', {
          data: JSON.stringify({
            ticker: 'AAPL',
            price: 150.25,
            change: 1.5,
            change_pct: 1.0,
            timestamp: '2025-01-01T12:00:00Z',
          }),
        })
      );
    });

    // Send alert (different event type)
    act(() => {
      alertListener(
        new MessageEvent('alert', {
          data: JSON.stringify({
            id: 1,
            ticker: 'AAPL',
            condition_type: 'price_above',
            threshold: 150.0,
            message: 'Price above threshold',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.priceUpdates['AAPL']).toBeDefined();
      expect(result.current.recentAlerts.length).toBeGreaterThan(0);
    });

    // Both events should coexist
    expect(result.current.priceUpdates['AAPL'].price).toBe(150.25);
    expect(result.current.recentAlerts[0].ticker).toBe('AAPL');
  });

  test('registers price_update in event listener list during connection', () => {
    renderHook(() => useSSE());

    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const eventTypes = mockEventSource.addEventListener.mock.calls.map(
      (call: any[]) => call[0]
    );

    expect(eventTypes).toContain('price_update');
  });

  test('handles malformed price_update event gracefully', async () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const listener = mockEventSource.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'price_update'
    )?.[1];

    if (!listener) throw new Error('price_update listener not registered');

    // Send malformed JSON
    act(() => {
      listener(
        new MessageEvent('price_update', {
          data: 'not valid json',
        })
      );
    });

    // Hook should not crash, state unchanged
    expect(result.current.priceUpdates).toEqual({});
  });

  test('priceUpdates persists across multiple event cycles', async () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      if (mockEventSource.onopen) mockEventSource.onopen(new Event('open'));
    });

    const listener = mockEventSource.addEventListener.mock.calls.find(
      (call: any[]) => call[0] === 'price_update'
    )?.[1];

    if (!listener) throw new Error('price_update listener not registered');

    // Add initial price
    act(() => {
      listener(
        new MessageEvent('price_update', {
          data: JSON.stringify({
            ticker: 'AAPL',
            price: 150.0,
            change: 1.0,
            change_pct: 0.67,
            timestamp: '2025-01-01T12:00:00Z',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(result.current.priceUpdates['AAPL']).toBeDefined();
    });

    const snapshot1 = result.current.priceUpdates['AAPL'];

    // Trigger unrelated event (heartbeat)
    act(() => {
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(
          new MessageEvent('message', {
            data: JSON.stringify({
              type: 'heartbeat',
              data: {},
            }),
          })
        );
      }
    });

    // AAPL should still be there
    expect(result.current.priceUpdates['AAPL']).toBe(snapshot1);
  });
});
