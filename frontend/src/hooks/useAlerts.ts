'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getAlerts,
  createAlert as apiCreateAlert,
  deleteAlert as apiDeleteAlert,
  toggleAlert as apiToggleAlert,
  getAlertSoundSettings,
} from '@/lib/api';
import type { Alert, AlertSoundSettings } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

interface CreateAlertData {
  ticker: string;
  condition_type: string;
  threshold: number;
  sound_type?: string;
}

export interface UseAlertsReturn {
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  createAlert: (data: CreateAlertData) => Promise<Alert>;
  removeAlert: (id: number) => Promise<void>;
  toggleAlert: (id: number) => Promise<void>;
  refresh: () => void;
}

/**
 * Play a short alert tone using the Web Audio API.
 * Fails silently if audio is unavailable or blocked by the browser.
 */
function playAlertSound(soundType: string, volume: number): void {
  try {
    type WebKitWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const AudioCtx =
      window.AudioContext || (window as WebKitWindow).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = Math.max(0, Math.min(1, volume));

    if (soundType === 'alarm') {
      osc.frequency.value = 880;
      osc.type = 'sawtooth';
    } else if (soundType === 'chime') {
      osc.frequency.value = 523;
      osc.type = 'sine';
    } else {
      osc.frequency.value = 440;
      osc.type = 'sine';
    }

    const duration = soundType === 'alarm' ? 0.6 : 0.35;
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      ctx.close();
    };
  } catch {
    // Audio not available; fail silently.
  }
}

/**
 * Hook that manages price alerts with CRUD operations and real-time SSE updates.
 *
 * On each ``alert`` SSE event:
 *  1. Plays an audio tone based on per-alert and global sound settings.
 *  2. Dispatches a desktop notification via the Electron bridge (if available).
 *  3. Refreshes the alert list so triggered alerts reflect their new state.
 */
export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const soundSettingsRef = useRef<AlertSoundSettings | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts();
      if (mountedRef.current) {
        setAlerts(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load alerts');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAlerts();

    // Load global sound settings so the SSE handler knows the volume/type.
    getAlertSoundSettings()
      .then((s) => {
        soundSettingsRef.current = s;
      })
      .catch(() => {});

    // Subscribe to the SSE stream for real-time alert notifications.
    const es = new EventSource(`${API_BASE}/api/stream`);

    es.addEventListener('alert', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          ticker: string;
          message: string;
          sound_type?: string;
          type?: string;
        };

        // Determine effective sound type: per-alert override → global default.
        const settings = soundSettingsRef.current;
        const effectiveSoundType =
          !data.sound_type || data.sound_type === 'default'
            ? settings?.sound_type || 'chime'
            : data.sound_type;

        if (settings?.enabled !== false && effectiveSoundType !== 'silent') {
          playAlertSound(effectiveSoundType, (settings?.volume ?? 70) / 100);
        }

        // Desktop notification via Electron bridge (no-op in browser).
        type ElectronBridge = { showNotification?: (ticker: string, msg: string) => void };
        const tp = (window as Window & { tickerpulse?: ElectronBridge }).tickerpulse;
        if (tp?.showNotification) {
          tp.showNotification(data.ticker, data.message);
        }

        // Refresh list so the triggered alert shows its updated state.
        fetchAlerts();
      } catch {
        // Ignore malformed SSE payloads.
      }
    });

    return () => {
      mountedRef.current = false;
      es.close();
    };
  }, [fetchAlerts]);

  const createAlert = useCallback(
    async (data: CreateAlertData): Promise<Alert> => {
      const alert = await apiCreateAlert(data);
      if (mountedRef.current) {
        await fetchAlerts();
      }
      return alert;
    },
    [fetchAlerts]
  );

  const removeAlert = useCallback(async (id: number): Promise<void> => {
    await apiDeleteAlert(id);
    if (mountedRef.current) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }
  }, []);

  const toggleAlert = useCallback(async (id: number): Promise<void> => {
    const updated = await apiToggleAlert(id);
    if (mountedRef.current) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
  }, []);

  return {
    alerts,
    loading,
    error,
    createAlert,
    removeAlert,
    toggleAlert,
    refresh: fetchAlerts,
  };
}
