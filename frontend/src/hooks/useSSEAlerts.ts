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
import { sanitizeAlertText } from '@/lib/sanitize';
import type { AlertSoundSettings, AlertEvent } from '@/lib/types';

// Allowlist mirrors backend _VALID_SOUND_TYPES. Any value arriving over SSE
// that is not in this set is treated as 'default' (falls back to global setting).
const VALID_SOUND_TYPES = new Set(['chime', 'alarm', 'silent', 'default'] as const);

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
 *  1. Sanitizes `ticker` and `message` via `sanitizeAlertText` (strips control
 *     chars, caps at 200 chars, HTML-encodes) before any further processing.
 *  2. Dispatches an in-app toast via `toastBus`.
 *  3. Plays a Web Audio tone (respects per-alert sound_type + global settings,
 *     including mute_when_active when the tab is focused).
 *  4. Calls `window.tickerpulse.showNotification()` for Electron desktop
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

    // mute_when_active: suppress sound when the tab currently has focus.
    const tabIsFocused =
      typeof document !== 'undefined' && document.hasFocus();
    const mutedByFocus = settings.mute_when_active && tabIsFocused;

    for (const alertEvent of newAlerts) {
      // Sanitize untrusted SSE fields before any use: strip control chars,
      // cap at 200 chars, HTML-encode to prevent injection into any renderer
      // that interprets HTML (including Electron's notification API).
      const safeTicker = sanitizeAlertText(alertEvent.ticker);
      const safeMessage = sanitizeAlertText(alertEvent.message);

      // 1. In-app toast notification.
      toast(`${safeTicker}: ${safeMessage}`, 'info');

      // 2. Web Audio sound.
      // Reject any sound_type not in the allowlist before it reaches playAlertSound.
      const rawSoundType = alertEvent.sound_type;
      const safeSoundType =
        rawSoundType && VALID_SOUND_TYPES.has(rawSoundType) ? rawSoundType : 'default';
      const effectiveSoundType =
        safeSoundType === 'default'
          ? settings.sound_type || 'chime'
          : safeSoundType;

      if (
        settings.enabled !== false &&
        effectiveSoundType !== 'silent' &&
        !mutedByFocus
      ) {
        playAlertSound(effectiveSoundType, (settings.volume ?? 70) / 100);
      }

      // 3. Electron desktop notification (no-op in the browser).
      const tp = (window as Window & { tickerpulse?: ElectronBridge })
        .tickerpulse;
      tp?.showNotification?.(safeTicker, safeMessage);
    }
  }, [recentAlerts]);

  return { recentAlerts, connected };
}