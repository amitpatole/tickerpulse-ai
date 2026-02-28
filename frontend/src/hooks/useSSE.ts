'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { SSEEvent, SSEEventType, AgentStatusEvent, AlertEvent, JobCompleteEvent, PriceUpdateEvent, AlertSoundSettings, AlertSoundType } from '@/lib/types';
import { getAlertSoundSettings } from '@/lib/api';

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

function synthesizeTone(soundType: 'chime' | 'alarm', volume: number): void {
  try {
    type WebKitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtx = window.AudioContext || (window as WebKitWindow).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = Math.max(0, Math.min(1, volume / 100));
    if (soundType === 'alarm') {
      osc.frequency.value = 880;
      osc.type = 'sawtooth';
    } else {
      osc.frequency.value = 523;
      osc.type = 'sine';
    }
    const duration = soundType === 'alarm' ? 0.6 : 0.35;
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => { ctx.close(); };
  } catch {
    // Audio not available; fail silently.
  }
}

function playAlertSound(settings: AlertSoundSettings, alertSoundType: AlertSoundType): void {
  if (!settings.enabled) return;
  if (settings.mute_when_active && document.hasFocus()) return;
  const resolved = alertSoundType === 'default' ? settings.sound_type : alertSoundType;
  if (resolved === 'silent') return;
  synthesizeTone(resolved, settings.volume);
}

export function useSSE() {
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
  const soundSettingsRef = useRef<AlertSoundSettings>({
    enabled: true,
    sound_type: 'chime',
    volume: 70,
    mute_when_active: false,
  });
  const lastAnnouncementRef = useRef<{ text: string; ts: number }>({ text: '', ts: 0 });
  const prevConnectedRef = useRef<boolean | null>(null);
  // Stable ref so memoized callbacks can always call the latest announce
  const announceRef = useRef<(text: string, channel: 'assertive' | 'polite') => void>(() => {});

  // Fetch sound settings once on mount and keep the ref updated
  useEffect(() => {
    getAlertSoundSettings()
      .then((settings) => {
        soundSettingsRef.current = settings;
      })
      .catch(() => {
        // Keep defaults on error
      });
  }, []);

  const announce = useCallback((text: string, channel: 'assertive' | 'polite') => {
    const now = Date.now();
    if (text === lastAnnouncementRef.current.text && now - lastAnnouncementRef.current.ts < 500) return;
    lastAnnouncementRef.current = { text, ts: now };
    setState((prev) => ({ ...prev, announcement: { ...prev.announcement, [channel]: text } }));
  }, []);

  // Keep ref pointing to the latest announce so memoized callbacks stay current
  announceRef.current = announce;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource(`${API_BASE}/api/stream`);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (mountedRef.current) {
          setState((prev) => ({ ...prev, connected: true }));
          if (prevConnectedRef.current === false) {
            announceRef.current('Market data stream connected', 'polite');
          }
          prevConnectedRef.current = true;
        }
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

      // Listen for specific named events
      const eventTypes: SSEEventType[] = [
        'agent_status', 'alert', 'job_complete', 'heartbeat',
        'news', 'rating_update', 'snapshot', 'price_update',
      ];
      eventTypes.forEach((type) => {
        es.addEventListener(type, (event: MessageEvent) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(event.data) as Record<string, unknown>;
            // Prefer the server-supplied timestamp so display matches server clock.
            // Fall back to client time only when the payload omits it (VO-792).
            const serverTs = typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString();
            handleEvent({ type, data, timestamp: serverTs });
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
        scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    }
  }, []);

  const handleEvent = useCallback((event: SSEEvent) => {
    // Fire announcements synchronously before state update so React 18 batches them together
    switch (event.type) {
      case 'alert': {
        const alertEvent = event.data as unknown as AlertEvent;
        announceRef.current(`Price alert: ${alertEvent.ticker} ${alertEvent.message}`, 'assertive');
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
      const next: SSEState = {
        ...prev,
        lastEvent: event,
        eventLog: newLog,
      };

      switch (event.type) {
        case 'agent_status': {
          const agentEvent = event.data as unknown as AgentStatusEvent;
          next.agentStatus = {
            ...prev.agentStatus,
            [agentEvent.agent_name]: agentEvent,
          };
          break;
        }
        case 'alert': {
          const alertEvent = event.data as unknown as AlertEvent;
          next.recentAlerts = [alertEvent, ...prev.recentAlerts].slice(0, 50);
          playAlertSound(soundSettingsRef.current, alertEvent.sound_type ?? 'default');
          break;
        }
        case 'job_complete': {
          const jobEvent = event.data as unknown as JobCompleteEvent;
          next.recentJobCompletes = [jobEvent, ...prev.recentJobCompletes].slice(0, 50);
          break;
        }
        case 'price_update': {
          const priceEvent = event.data as unknown as PriceUpdateEvent;
          next.priceUpdates = {
            ...prev.priceUpdates,
            [priceEvent.ticker]: priceEvent,
          };
          break;
        }
        default:
          break;
      }

      return next;
    });
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, RECONNECT_DELAY);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect]);

  return state;
}