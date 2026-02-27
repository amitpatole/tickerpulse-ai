'use client';

// ============================================================
// TickerPulse AI v3.0 — useSSEAlerts
// Consumes real-time alert events from the shared SSE stream
// (via useSSE) and dispatches toast + sound + Electron native
// notification side-effects on each new alert.
//
// Does NOT create a second EventSource — it reuses the shared
// connection managed by useSSE to avoid duplicate connections.
// ============================================================

import { useEffect, useRef } from 'react';
import { useSSE } from '@/hooks/useSSE';
import { toast } from '@/lib/toastBus';
import { playAlertSound } from '@/lib/alertSound';
import { getAlertSoundSettings } from '@/lib/api';
import type { AlertSoundSettings, AlertEvent } from '@/lib/types';

type ElectronBridge = {
  showNotification?: (ticker: string, message: string) => void;
};

export interface UseSSEAlertsReturn {
  /** Most-recent alert events received from the SSE stream (newest first). */
  recentAlerts: AlertEvent[];
  /** True when the underlying SSE connection is open. */
  connected: boolean;
}

/**
 * Hook that wires real-time alert side-effects to the shared SSE stream.
 *
 * For every new `alert` event that arrives after this hook mounts it:
 *  1. Dispatches an in-app toast via `toastBus`.
 *  2. Plays a Web Audio tone (respects per-alert sound_type + global settings).
 *  3. Calls `window.tickerpulse.showNotification()` for Electron desktop
 *     notifications (no-op in the browser).
 */
export function useSSEAlerts(): UseSSEAlertsReturn {
  const { recentAlerts, connected } = useSSE();

  // Track which alerts have already been processed so we don't re-fire on
  // re-renders or when the array reference changes without new items.
  const prevAlertsRef = useRef<AlertEvent[]>([]);
  const initializedRef = useRef(false);

  const soundSettingsRef = useRef<AlertSoundSettings>({
    enabled: true,
    sound_type: 'chime',
    volume: 70,
    mute_when_active: false,
  });

  // Load global sound settings once on mount.
  useEffect(() => {
    getAlertSoundSettings()
      .then((s) => {
        soundSettingsRef.current = s;
      })
      .catch(() => {
        // Keep defaults on error.
      });
  }, []);

  useEffect(() => {
    // On the very first run, snapshot the existing alerts without dispatching
    // side-effects — those alerts were already processed by a previous session.
    if (!initializedRef.current) {
      prevAlertsRef.current = recentAlerts;
      initializedRef.current = true;
      return;
    }

    // Find alerts that arrived since the last render.
    const prev = prevAlertsRef.current;
    const newAlerts = recentAlerts.filter((a) => !prev.includes(a));
    prevAlertsRef.current = recentAlerts;

    if (newAlerts.length === 0) return;

    const settings = soundSettingsRef.current;

    for (const alertEvent of newAlerts) {
      // 1. In-app toast notification.
      toast(`${alertEvent.ticker}: ${alertEvent.message}`, 'info');

      // 2. Web Audio sound.
      const effectiveSoundType =
        !alertEvent.sound_type || alertEvent.sound_type === 'default'
          ? settings.sound_type || 'chime'
          : alertEvent.sound_type;

      if (settings.enabled !== false && effectiveSoundType !== 'silent') {
        playAlertSound(effectiveSoundType, (settings.volume ?? 70) / 100);
      }

      // 3. Electron desktop notification (no-op in the browser).
      const tp = (window as Window & { tickerpulse?: ElectronBridge })
        .tickerpulse;
      tp?.showNotification?.(alertEvent.ticker, alertEvent.message);
    }
  }, [recentAlerts]);

  return { recentAlerts, connected };
}
