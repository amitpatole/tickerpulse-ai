'use client';

// ============================================================
// TickerPulse AI v3.0 — useAlertSound
// React hook wrapping Web Audio tone synthesis.
// Fetches global sound settings from the API on mount and
// exposes playAlertSound() which respects the enabled flag
// and volume from those settings.
// ============================================================

import { useRef, useCallback, useEffect, useState } from 'react';
import { getAlertSoundSettings, updateAlertSoundSettings } from '@/lib/api';
import type { AlertSoundSettings } from '@/lib/types';

type WebKitWindow = Window & { webkitAudioContext?: typeof AudioContext };

const DEFAULT_SETTINGS: AlertSoundSettings = {
  enabled: true,
  sound_type: 'chime',
  volume: 70,
  mute_when_active: false,
};

export interface UseAlertSoundReturn {
  settings: AlertSoundSettings;
  /** Play a tone for the given sound type, respecting global enabled/volume. */
  playAlertSound: (soundType: string) => void;
  /** Alias for playAlertSound — preferred name per design spec. */
  play: (soundType: string) => void;
  /** Persist a partial settings update to the API and refresh local state. */
  updateSettings: (patch: Partial<AlertSoundSettings>) => Promise<void>;
}

export function useAlertSound(): UseAlertSoundReturn {
  const [settings, setSettings] = useState<AlertSoundSettings>(DEFAULT_SETTINGS);

  // Keep a ref so the stable playAlertSound callback always sees current settings
  // without needing to be recreated on every render.
  const settingsRef = useRef<AlertSoundSettings>(DEFAULT_SETTINGS);
  settingsRef.current = settings;

  // Track the active oscillator so a new alert can cut off the previous tone.
  const oscRef = useRef<OscillatorNode | null>(null);

  // Fetch settings on mount; keep DEFAULT_SETTINGS on error.
  useEffect(() => {
    let mounted = true;
    getAlertSoundSettings()
      .then((s) => {
        if (mounted) setSettings(s);
      })
      .catch(() => {
        // Keep defaults on error; sound will still play with sane defaults.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const playAlertSound = useCallback((soundType: string) => {
    if (!settingsRef.current.enabled) return;
    if (soundType === 'silent') return;

    // Cut off any still-playing tone.
    if (oscRef.current) {
      try {
        oscRef.current.stop();
      } catch {
        // Already stopped; ignore.
      }
      oscRef.current = null;
    }

    try {
      const AudioCtx =
        window.AudioContext || (window as WebKitWindow).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = (settingsRef.current.volume ?? 70) / 100;

      if (soundType === 'alarm') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.type = 'sawtooth';
      } else {
        // 'chime', 'default', or any unknown type — use a soft sine tone.
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        osc.type = 'sine';
      }

      const duration = soundType === 'alarm' ? 0.6 : 0.35;
      osc.start();
      osc.stop(ctx.currentTime + duration);
      oscRef.current = osc;
      osc.onended = () => {
        ctx.close();
        if (oscRef.current === osc) oscRef.current = null;
      };
    } catch {
      // Web Audio not available or blocked; fail silently.
    }
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AlertSoundSettings>) => {
    const updated = await updateAlertSoundSettings(patch);
    setSettings(updated);
  }, []);

  return { settings, playAlertSound, play: playAlertSound, updateSettings };
}