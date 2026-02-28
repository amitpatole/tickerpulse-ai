'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type {
  SSEEvent,
  SSEEventType,
  AgentStatusEvent,
  AlertEvent,
  JobCompleteEvent,
  PriceUpdateEvent,
} from '@/lib/types';
import { useSSEAlerts } from './useSSEAlerts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const RECONNECT_DELAY = 5000;

interface SSEState {
  connected: boolean;
  lastEvent: SSEEvent | null;
  agentStatus: Record<string, AgentStatusEvent>;
  recentAlerts: AlertEvent[];
  recentJobCompletes: JobCompleteEvent[];
  priceUpdates: Record<string, PriceUpdateEvent>;
  eventLog: SSEEvent[];
  announcement: { assertive: string; polite: string };
}

export function useSSE() {
  const { recentAlerts, handleAlertEvent } = useSSEAlerts();

  const [state, setState] = useState<SSEState>({
    connected: false,
    lastEvent: null,
    agentStatus: {},
    recentAlerts: [],
    recentJobCompletes: [],
    priceUpdates: {},
    eventLog: [],
    announcement: { assertive: '', polite: '' },
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lastAnnouncementRef = useRef<{ text: string; ts: number }>({ text: '', ts: 0 });
  const prevConnectedRef = useRef<boolean | null>(null);
  const announceRef = useRef<(text: string, channel: 'assertive' | 'polite') => void>(() => {});

  // Stable refs so memoised callbacks always use the latest versions
  const handleAlertEventRef = useRef(handleAlertEvent);
  handleAlertEventRef.current = handleAlertEvent;

  // Stable refs to break the connect <-> scheduleReconnect circular dependency
  const connectRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const announce = useCallback((text: string, channel: 'assertive' | 'polite') => {
    const now = Date.now();
    if (text === lastAnnouncementRef.current.text && now - lastAnnouncementRef.current.ts < 500) return;
    lastAnnouncementRef.current = { text, ts: now };
    setState((prev) => ({ ...prev, announcement: { ...prev.announcement, [channel]: text } }));
  }, []);

  announceRef.current = announce;

  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'alert': {
        const alertEvent = handleAlertEventRef.current(event.data);
        if (alertEvent) {
          announceRef.current(
            `Price alert: ${alertEvent.ticker} ${alertEvent.message}`,
            'assertive',
          );
        }
        break;
      }
      case 'news': {
        const headline = (event.data as Record<string, unknown>).headline as string | undefined;
        if (headline) announceRef.current(`News update: ${headline}`, 'polite');
        break;
      }
      case 'rating_update': {
        const ticker = (event.data as Record<string, unknown>).ticker as string | undefined;
        const rating = (event.data as Record<string, unknown>).rating as string | undefined;
        if (ticker && rating) announceRef.current(`Rating update: ${ticker} rated ${rating}`, 'polite');
        break;
      }
      case 'job_complete': {
        const jobEvent = event.data as unknown as JobCompleteEvent;
        if (jobEvent.job_name) announceRef.current(`Job complete: ${jobEvent.job_name}`, 'polite');
        break;
      }
      default:
        break;
    }

    setState((prev) => {
      const newLog = [event, ...prev.eventLog].slice(0, 100);
      const next: SSEState = { ...prev, lastEvent: event, eventLog: newLog };

      switch (event.type) {
        case 'agent_status': {
          const agentEvent = event.data as unknown as AgentStatusEvent;
          next.agentStatus = { ...prev.agentStatus, [agentEvent.agent_name]: agentEvent };
          break;
        }
        case 'job_complete': {
          const jobEvent = event.data as unknown as JobCompleteEvent;
          next.recentJobCompletes = [jobEvent, ...prev.recentJobCompletes].slice(0, 50);
          break;
        }
        case 'price_update': {
          const priceEvent = event.data as unknown as PriceUpdateEvent;
          next.priceUpdates = { ...prev.priceUpdates, [priceEvent.ticker]: priceEvent };
          break;
        }
        default:
          break;
      }

      return next;
    });
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connectRef.current();
    }, RECONNECT_DELAY);
  }, []);

  scheduleReconnectRef.current = scheduleReconnect;

  const connect = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    try {
      const es = new EventSource(`${API_BASE}/api/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setState((prev) => ({ ...prev, connected: true }));
        if (prevConnectedRef.current === false) {
          announceRef.current('Market data stream connected', 'polite');
        }
        prevConnectedRef.current = true;
      };

      es.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const parsed = JSON.parse(event.data) as SSEEvent;
          handleEvent(parsed);
        } catch {
          // Ignore malformed events
        }
      };

      const eventTypes: SSEEventType[] = [
        'agent_status', 'alert', 'job_complete', 'heartbeat',
        'news', 'rating_update', 'snapshot', 'price_update',
      ];
      eventTypes.forEach((type) => {
        es.addEventListener(type, (event: MessageEvent) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(event.data);
            handleEvent({ type, data, timestamp: new Date().toISOString() });
          } catch {
            // Ignore malformed events
          }
        });
      });

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        if (prevConnectedRef.current === true) {
          announceRef.current('Market data stream reconnecting', 'polite');
        }
        prevConnectedRef.current = false;
        setState((prev) => ({ ...prev, connected: false }));
        scheduleReconnectRef.current();
      };
    } catch {
      scheduleReconnectRef.current();
    }
  }, [handleEvent]);

  connectRef.current = connect;

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  // Overlay recentAlerts managed by useSSEAlerts (which owns sound + alert state)
  return { ...state, recentAlerts };
}
