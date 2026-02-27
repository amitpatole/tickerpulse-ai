```typescript
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { PriceUpdate } from '@/lib/types';

// Exponential backoff delays for reconnect attempts (ms)
const BACKOFF_STEPS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export type WSStatus = 'connecting' | 'open' | 'closed' | 'error';

function buildWsUrl(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (apiBase) {
    return `${apiBase.replace(/^http/, 'ws')}/api/ws/prices`;
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/api/ws/prices`;
  }
  return 'ws://localhost:5001/api/ws/prices';
}

export interface UseWSPricesOptions {
  tickers: string[];
  onPriceUpdate: (update: PriceUpdate) => void;
  enabled?: boolean;
}

export interface UseWSPricesResult {
  status: WSStatus;
  /** Send a manual refresh request to the server via the open WebSocket. */
  sendRefresh: () => void;
}

/**
 * Manages a WebSocket connection to /api/ws/prices.
 *
 * On mount: opens a connection and sends a subscribe message for the given
 * tickers.  Reconnects automatically using exponential backoff (1s → 30s cap)
 * when the connection drops.  Re-subscribes when the tickers list changes
 * while connected.  Cleans up on unmount.
 *
 * Returns the current connection status for surfacing in UI indicators.
 */
export function useWSPrices({
  tickers,
  onPriceUpdate,
  enabled = true,
}: UseWSPricesOptions): UseWSPricesResult {
  const [status, setStatus] = useState<WSStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);
  const tickersRef = useRef<string[]>(tickers);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with latest props without re-triggering the connection effect
  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);

  useEffect(() => {
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onPriceUpdate]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled || typeof WebSocket === 'undefined') return;

    setStatus('connecting');
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      if (mountedRef.current) setStatus('open');
      if (tickersRef.current.length > 0) {
        ws.send(JSON.stringify({ type: 'subscribe', tickers: tickersRef.current }));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        if (msg.type === 'price_update') {
          onPriceUpdateRef.current(msg as unknown as PriceUpdate);
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus('closed');
      const delay = BACKOFF_STEPS[Math.min(retryCountRef.current, BACKOFF_STEPS.length - 1)];
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setStatus('error');
      ws.onclose = null; // Prevent duplicate reconnect triggered by the close that follows an error
      ws.close();
      const delay = BACKOFF_STEPS[Math.min(retryCountRef.current, BACKOFF_STEPS.length - 1)];
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(connect, delay);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setStatus('closed');
      return;
    }
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled]);

  // Re-subscribe when tickers change while the socket is already open
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && tickers.length > 0) {
      ws.send(JSON.stringify({ type: 'subscribe', tickers }));
    }
  }, [tickers]);

  const sendRefresh = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'refresh' }));
    }
  }, []);

  return { status, sendRefresh };
}
```