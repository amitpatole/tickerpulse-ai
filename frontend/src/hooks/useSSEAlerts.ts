'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AlertEvent, AlertSoundSettings, AlertSoundType } from '@/lib/types';
import { getAlertSoundSettings } from '@/lib/api';
import { playAlertSound } from '@/lib/alertSound';

const DEFAULT_SOUND_SETTINGS: AlertSoundSettings = {
  enabled: true,
  sound_type: 'chime',
  volume: 70,
  mute_when_active: false,
};

const VALID_SOUND_TYPES: ReadonlySet<string> = new Set(['default', 'chime', 'alarm', 'silent']);

/**
 * Validate that the data object has the minimum shape of an AlertEvent.
 * Rejects payloads with missing required fields or an unrecognised sound_type.
 */
function isValidAlertPayload(data: unknown): data is AlertEvent {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.ticker !== 'string' || !d.ticker) return false;
  if (typeof d.message !== 'string') return false;
  if (typeof d.alert_id !== 'number') return false;
  if (typeof d.current_price !== 'number') return false;
  if (typeof d.sound_type !== 'string' || !VALID_SOUND_TYPES.has(d.sound_type)) return false;
  return true;
}

export interface UseSSEAlertsResult {
  recentAlerts: AlertEvent[];
  soundSettings: AlertSoundSettings;
  updateSoundSettings: (patch: Partial<AlertSoundSettings>) => void;
  /**
   * Process an incoming SSE alert payload.
   *
   * Validates the payload, appends to recentAlerts, and plays sound according
   * to the resolution chain:
   *   1. per-alert sound_type (if not 'default')
   *   2. global sound_type from settings
   *   3. 'chime' as ultimate fallback
   *
   * Mute suppresses audio but the alert is still recorded.
   * Malformed payloads are silently rejected (returns null).
   */
  handleAlertEvent: (data: unknown) => AlertEvent | null;
}

export function useSSEAlerts(): UseSSEAlertsResult {
  const [recentAlerts, setRecentAlerts] = useState<AlertEvent[]>([]);
  const [soundSettings, setSoundSettings] = useState<AlertSoundSettings>(DEFAULT_SOUND_SETTINGS);
  // Ref so the handleAlertEvent callback always sees the latest settings
  // without needing to be re-created when settings change.
  const soundSettingsRef = useRef<AlertSoundSettings>(DEFAULT_SOUND_SETTINGS);
  soundSettingsRef.current = soundSettings;

  // Fetch persisted sound settings once on mount
  useEffect(() => {
    getAlertSoundSettings()
      .then((settings) => {
        setSoundSettings(settings);
      })
      .catch(() => {
        // Keep defaults on network / server error
      });
  }, []);

  const updateSoundSettings = useCallback((patch: Partial<AlertSoundSettings>) => {
    setSoundSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleAlertEvent = useCallback((data: unknown): AlertEvent | null => {
    if (!isValidAlertPayload(data)) return null;

    const alertEvent = data as AlertEvent;

    // Append to recent alerts (cap at 50)
    setRecentAlerts((prev) => [alertEvent, ...prev].slice(0, 50));

    const settings = soundSettingsRef.current;

    // Audio suppressed when globally disabled or tab is focused + mute active
    const audioSuppressed =
      !settings.enabled || (settings.mute_when_active && document.hasFocus());

    if (!audioSuppressed) {
      // Resolution chain: per-alert explicit → global → chime fallback
      const resolvedType: Exclude<AlertSoundType, 'default'> =
        alertEvent.sound_type !== 'default'
          ? (alertEvent.sound_type as Exclude<AlertSoundType, 'default'>)
          : (settings.sound_type ?? 'chime');

      playAlertSound(resolvedType, settings.volume);
    }

    return alertEvent;
  }, []);

  return { recentAlerts, soundSettings, updateSoundSettings, handleAlertEvent };
}
