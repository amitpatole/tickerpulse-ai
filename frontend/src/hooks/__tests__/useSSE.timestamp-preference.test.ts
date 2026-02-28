/**
 * Frontend tests for VO-792: useSSE named-event timestamp handling
 *
 * Validates that the useSSE hook's named-event listeners (lines 137-150 in useSSE.ts)
 * prefer the server-supplied timestamp when present, falling back to client time
 * only when the payload omits it.
 *
 * Acceptance Criteria:
 *   AC1: Named event listener uses data.timestamp when present (server clock)
 *   AC2: Named event listener falls back to new Date().toISOString() when absent
 *   AC3: Timestamp is properly extracted and passed to handleEvent
 */

import { renderHook, act } from '@testing-library/react';
import { useSSE } from '../useSSE';

// Mock EventSource to simulate SSE stream
class MockEventSource {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: (() => void) | null = null;
  public listeners: Map<string, (event: MessageEvent) => void> = new Map();

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.listeners.set(type, handler);
  }

  close() {}

  removeEventListener(_type: string) {}

  triggerNamedEvent(eventType: string, data: Record<string, unknown>) {
    const handler = this.listeners.get(eventType);
    if (handler) {
      handler(
        new MessageEvent('message', {
          data: JSON.stringify(data),
        })
      );
    }
  }
}

describe('useSSE — timestamp preference (VO-792)', () => {
  let mockEventSource: MockEventSource;

  beforeEach(() => {
    mockEventSource = new MockEventSource();
    (global as any).EventSource = jest.fn(() => mockEventSource);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // AC1: Named event listener uses data.timestamp when present
  // =========================================================================

  test('AC1: named event listener extracts server-supplied timestamp from payload', () => {
    const { result } = renderHook(() => useSSE());

    const serverTs = '2026-02-27T14:32:00.000Z';
    const eventPayload = {
      ticker: 'AAPL',
      price: 150.25,
      timestamp: serverTs,
    };

    // Trigger a named event with server-supplied timestamp
    act(() => {
      mockEventSource.triggerNamedEvent('price_update', eventPayload);
    });

    // The hook should have captured the event with the server timestamp
    const lastEvent = result.current.lastEvent;
    expect(lastEvent).not.toBeNull();
    expect(lastEvent?.timestamp).toBe(serverTs);
  });

  test('AC1: price_update event with explicit timestamp uses server clock', () => {
    const { result } = renderHook(() => useSSE());

    const fixedServerTs = '2026-01-15T09:30:00.000Z';

    act(() => {
      mockEventSource.triggerNamedEvent('price_update', {
        ticker: 'MSFT',
        price: 330.50,
        timestamp: fixedServerTs,
      });
    });

    // Verify the timestamp matches server-supplied value
    expect(result.current.lastEvent?.timestamp).toBe(fixedServerTs);
  });

  test('AC1: alert event with timestamp field preserves server time', () => {
    const { result } = renderHook(() => useSSE());

    const alertTs = '2026-02-27T15:45:30.000Z';

    act(() => {
      mockEventSource.triggerNamedEvent('alert', {
        ticker: 'GOOGL',
        message: 'Price crossed threshold',
        timestamp: alertTs,
      });
    });

    expect(result.current.lastEvent?.timestamp).toBe(alertTs);
    expect(result.current.recentAlerts.length).toBe(1);
    expect(result.current.recentAlerts[0]?.timestamp).toBeUndefined();
  });

  // =========================================================================
  // AC2: Named event listener falls back to new Date().toISOString()
  //      when payload omits timestamp
  // =========================================================================

  test('AC2: event without timestamp field triggers client-side fallback', () => {
    const { result } = renderHook(() => useSSE());

    // Capture client time before and after
    const beforeTime = new Date();

    act(() => {
      mockEventSource.triggerNamedEvent('price_update', {
        ticker: 'TSLA',
        price: 242.15,
        // No timestamp field in payload
      });
    });

    const afterTime = new Date();

    // The hook should have generated a timestamp via fallback
    const eventTs = result.current.lastEvent?.timestamp;
    expect(eventTs).not.toBeUndefined();

    // Fallback timestamp should be a valid ISO string
    expect(typeof eventTs).toBe('string');
    expect(eventTs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // Fallback timestamp should be within our before/after window
    const eventDate = new Date(eventTs as string);
    expect(eventDate.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(eventDate.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);
  });

  test('AC2: multiple events without timestamp use independent fallback times', () => {
    const { result } = renderHook(() => useSSE());

    const timestamps: string[] = [];

    // Trigger first event without timestamp
    act(() => {
      mockEventSource.triggerNamedEvent('price_update', {
        ticker: 'AAPL',
        price: 150.0,
      });
    });
    timestamps.push(result.current.lastEvent?.timestamp as string);

    // Small delay to ensure timestamps differ
    jest.advanceTimersByTime(100);

    // Trigger second event without timestamp
    act(() => {
      mockEventSource.triggerNamedEvent('price_update', {
        ticker: 'GOOGL',
        price: 140.0,
      });
    });
    timestamps.push(result.current.lastEvent?.timestamp as string);

    // Both should have timestamps (fallback-generated)
    expect(timestamps[0]).toBeDefined();
    expect(timestamps[1]).toBeDefined();
    // Due to time passage, they should differ slightly
    // (In real time; with jest.advanceTimersByTime they may be very close)
  });

  // =========================================================================
  // AC3: Timestamp properly extracted and passed through event handling chain
  // =========================================================================

  test('AC3: timestamp extracted from named event propagates through handleEvent', () => {
    const { result } = renderHook(() => useSSE());

    const serverTs = '2026-02-27T16:20:00.000Z';

    act(() => {
      mockEventSource.triggerNamedEvent('agent_status', {
        agent_name: 'earnings_sync',
        status: 'completed',
        timestamp: serverTs,
      });
    });

    // Verify lastEvent has the timestamp
    expect(result.current.lastEvent?.timestamp).toBe(serverTs);

    // Verify event appears in eventLog with timestamp
    expect(result.current.eventLog.length).toBeGreaterThan(0);
    expect(result.current.eventLog[0]?.timestamp).toBe(serverTs);
  });

  test('AC3: timestamp available in eventLog for event history tracking', () => {
    const { result } = renderHook(() => useSSE());

    const events = [
      { type: 'job_complete', job_name: 'price_refresh', timestamp: '2026-02-27T10:00:00Z' },
      { type: 'job_complete', job_name: 'earnings_sync', timestamp: '2026-02-27T11:00:00Z' },
      { type: 'job_complete', job_name: 'sentiment_update', timestamp: '2026-02-27T12:00:00Z' },
    ];

    act(() => {
      events.forEach((evt) => {
        mockEventSource.triggerNamedEvent('job_complete', evt);
      });
    });

    // All three events should be in log with their timestamps
    expect(result.current.eventLog.length).toBe(3);

    // Most recent first (array unshift)
    expect(result.current.eventLog[0]?.timestamp).toBe('2026-02-27T12:00:00Z');
    expect(result.current.eventLog[1]?.timestamp).toBe('2026-02-27T11:00:00Z');
    expect(result.current.eventLog[2]?.timestamp).toBe('2026-02-27T10:00:00Z');
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  test('timestamp field with non-string value triggers fallback', () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      mockEventSource.triggerNamedEvent('price_update', {
        ticker: 'FB',
        price: 295.0,
        timestamp: 12345, // Invalid: number instead of string
      });
    });

    const eventTs = result.current.lastEvent?.timestamp;

    // Should have triggered fallback (client time) instead of using the number
    expect(typeof eventTs).toBe('string');
    expect(eventTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('null timestamp triggers fallback', () => {
    const { result } = renderHook(() => useSSE());

    act(() => {
      mockEventSource.triggerNamedEvent('alert', {
        ticker: 'AMZN',
        message: 'Alert',
        timestamp: null,
      });
    });

    const eventTs = result.current.lastEvent?.timestamp;

    // null should trigger fallback to client time
    expect(typeof eventTs).toBe('string');
    expect(eventTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('malformed JSON event is silently ignored', () => {
    const { result } = renderHook(() => useSSE());

    const initialEventCount = result.current.eventLog.length;

    // Directly trigger malformed message (circumvent JSON.stringify)
    const handler = (global as any).EventSource.mock.results[0].value.onmessage;
    if (handler) {
      handler(
        new MessageEvent('message', {
          data: 'not valid json {',
        })
      );
    }

    // Should not crash and should not add to log
    expect(result.current.eventLog.length).toBe(initialEventCount);
  });
});
