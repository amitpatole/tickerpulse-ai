'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';
import type { AlertSoundSettings as AlertSoundSettingsType, AlertSoundType } from '@/lib/types';
import { getAlertSoundSettings, patchAlertSoundSettings } from '@/lib/api';
import { SoundTypePicker } from '@/components/alerts/SoundTypePicker';

const VOLUME_DEBOUNCE_MS = 300;

export function AlertSoundSettings() {
  const [settings, setSettings] = useState<AlertSoundSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    getAlertSoundSettings()
      .then((s) => {
        if (mountedRef.current) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    };
  }, []);

  const save = useCallback(async (patch: Partial<AlertSoundSettingsType>) => {
    try {
      const updated = await patchAlertSoundSettings(patch);
      if (mountedRef.current) {
        setSettings(updated);
        setSaveError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save');
      }
    }
  }, []);

  const handleToggleEnabled = useCallback(() => {
    if (!settings) return;
    const next = !settings.enabled;
    setSettings((prev) => (prev ? { ...prev, enabled: next } : prev));
    save({ enabled: next });
  }, [settings, save]);

  const handleSoundTypeChange = useCallback(
    (type: AlertSoundType) => {
      if (!settings || type === 'default') return;
      const next = type as Exclude<AlertSoundType, 'default'>;
      setSettings((prev) => (prev ? { ...prev, sound_type: next } : prev));
      save({ sound_type: next });
    },
    [settings, save],
  );

  const handleVolumeChange = useCallback(
    (volume: number) => {
      if (!settings) return;
      setSettings((prev) => (prev ? { ...prev, volume } : prev));
      if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
      volumeDebounceRef.current = setTimeout(() => {
        save({ volume });
      }, VOLUME_DEBOUNCE_MS);
    },
    [settings, save],
  );

  const handleToggleMute = useCallback(() => {
    if (!settings) return;
    const next = !settings.mute_when_active;
    setSettings((prev) => (prev ? { ...prev, mute_when_active: next } : prev));
    save({ mute_when_active: next });
  }, [settings, save]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400" role="status">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
        Loading sound settings…
      </div>
    );
  }

  if (!settings) {
    return <p className="py-4 text-sm text-red-400">Failed to load sound settings.</p>;
  }

  const controlsDisabled = !settings.enabled;

  return (
    <div className="space-y-5">
      {saveError && (
        <p className="text-xs text-red-400" role="alert">
          {saveError}
        </p>
      )}

      {/* Enable / disable all alert sounds */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {settings.enabled ? (
            <Bell className="h-4 w-4 text-blue-400" />
          ) : (
            <BellOff className="h-4 w-4 text-slate-500" />
          )}
          <div>
            <p className="text-sm font-medium text-slate-100">Alert sounds</p>
            <p className="text-xs text-slate-400">Play a sound when a price alert fires</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={handleToggleEnabled}
          aria-label="Toggle alert sounds"
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            settings.enabled ? 'bg-blue-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Sound type */}
      <div className="flex items-center justify-between">
        <div>
          <p
            className={`text-sm font-medium ${controlsDisabled ? 'text-slate-500' : 'text-slate-100'}`}
          >
            Sound type
          </p>
          <p className="text-xs text-slate-400">Default sound for all alerts</p>
        </div>
        <SoundTypePicker
          value={settings.sound_type}
          onChange={handleSoundTypeChange}
          volume={settings.volume}
          hideDefault
          disabled={controlsDisabled}
        />
      </div>

      {/* Volume */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings.volume === 0 ? (
              <VolumeX
                className={`h-4 w-4 ${controlsDisabled ? 'text-slate-600' : 'text-slate-400'}`}
              />
            ) : (
              <Volume2
                className={`h-4 w-4 ${controlsDisabled ? 'text-slate-600' : 'text-slate-400'}`}
              />
            )}
            <p
              className={`text-sm font-medium ${controlsDisabled ? 'text-slate-500' : 'text-slate-100'}`}
            >
              Volume
            </p>
          </div>
          <span
            className={`text-xs tabular-nums ${controlsDisabled ? 'text-slate-600' : 'text-slate-400'}`}
          >
            {settings.volume}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={settings.volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          disabled={controlsDisabled}
          aria-label="Alert volume"
          className="h-1.5 w-full appearance-none rounded-full bg-slate-700 disabled:opacity-40 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 disabled:[&::-webkit-slider-thumb]:cursor-not-allowed"
        />
      </div>

      {/* Mute when window is active */}
      <div className="flex items-center justify-between">
        <div>
          <p
            className={`text-sm font-medium ${controlsDisabled ? 'text-slate-500' : 'text-slate-100'}`}
          >
            Mute when window is active
          </p>
          <p className="text-xs text-slate-400">Suppress sound when this tab is focused</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.mute_when_active}
          onClick={handleToggleMute}
          disabled={controlsDisabled}
          aria-label="Mute when window is active"
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 ${
            settings.mute_when_active ? 'bg-blue-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              settings.mute_when_active ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
