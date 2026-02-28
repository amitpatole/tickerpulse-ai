'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Play,
  Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAlerts } from '@/hooks/useAlerts';
import {
  getAlertSoundSettings,
  updateAlertSoundSettings,
  updateAlertSoundType,
} from '@/lib/api';
import { playAlertSound } from '@/lib/alertSound';
import { timeAgo } from '@/lib/formatTime';
import AlertFormModal from '@/components/alerts/AlertFormModal';
import SoundTypePicker from '@/components/alerts/SoundTypePicker';
import type { Alert, AlertSoundSettings, AlertSoundType } from '@/lib/types';

// ---- ToggleSwitch ------------------------------------------------------------

interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ label, description, checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <span className="text-sm text-slate-200">{label}</span>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={clsx(
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-blue-600' : 'bg-slate-600',
        )}
      >
        <span
          className={clsx(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

// ---- AlertRow ----------------------------------------------------------------

const INLINE_SOUND_OPTIONS: { value: AlertSoundType; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
  { value: 'silent', label: 'Silent' },
];

interface AlertRowProps {
  alert: Alert;
  globalSoundType: 'chime' | 'alarm' | 'silent';
  volume: number;
  isToggling: boolean;
  isDeleting: boolean;
  isUpdatingSound: boolean;
  onToggle: (id: number) => void;
  onEdit: (alert: Alert) => void;
  onDelete: (id: number) => void;
  onSoundChange: (id: number, sound: AlertSoundType) => void;
}

function AlertRow({
  alert,
  globalSoundType,
  volume,
  isToggling,
  isDeleting,
  isUpdatingSound,
  onToggle,
  onEdit,
  onDelete,
  onSoundChange,
}: AlertRowProps) {
  function handlePreview() {
    const soundType = (alert.sound_type ?? 'default') as AlertSoundType;
    const effective = soundType === 'default' ? globalSoundType : soundType;
    if (effective !== 'silent') {
      playAlertSound(effective, volume / 100);
    }
  }

  const conditionLabel = alert.condition_type?.replace(/_/g, ' ') ?? '';

  return (
    <li
      className={clsx(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-800/30',
        !alert.enabled && 'opacity-50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-semibold text-slate-200">
            {alert.ticker}
          </span>
          <span className="text-xs capitalize text-slate-300">{conditionLabel}</span>
          <span className="text-xs font-medium text-white">${alert.threshold}</span>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          <select
            value={alert.sound_type ?? 'default'}
            onChange={(e) => onSoundChange(alert.id, e.target.value as AlertSoundType)}
            disabled={isUpdatingSound}
            aria-label={`Sound for ${alert.ticker} alert`}
            className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
          >
            {INLINE_SOUND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handlePreview}
            disabled={alert.sound_type === 'silent'}
            aria-label={`Preview sound for ${alert.ticker} alert`}
            className="rounded p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-40"
          >
            <Play className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
          {alert.triggered_at && (
            <span className="ml-1 flex items-center gap-1 text-[11px] text-slate-500">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              {timeAgo(alert.triggered_at)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggle(alert.id)}
          disabled={isToggling}
          aria-label={alert.enabled ? 'Disable alert' : 'Enable alert'}
          aria-pressed={alert.enabled}
          className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-50"
        >
          {alert.enabled ? (
            <ToggleRight className="h-4 w-4 text-green-400" aria-hidden="true" />
          ) : (
            <ToggleLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onEdit(alert)}
          aria-label={`Edit ${alert.ticker} alert`}
          className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(alert.id)}
          disabled={isDeleting}
          aria-label={`Delete ${alert.ticker} alert`}
          className="rounded p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

// ---- PriceAlertsPanel --------------------------------------------------------

export default function PriceAlertsPanel() {
  const [soundSettings, setSoundSettings] = useState<AlertSoundSettings>({
    enabled: true,
    sound_type: 'chime',
    volume: 70,
    mute_when_active: false,
  });
  const [soundLoaded, setSoundLoaded] = useState(false);
  const [soundSaving, setSoundSaving] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(70);

  const [showModal, setShowModal] = useState(false);
  const [editAlert, setEditAlert] = useState<Alert | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [updatingSoundId, setUpdatingSoundId] = useState<number | null>(null);

  const { alerts, loading, error, createAlert, updateAlert, removeAlert, toggleAlert } =
    useAlerts();

  useEffect(() => {
    getAlertSoundSettings()
      .then((s) => {
        setSoundSettings(s);
        setVolumeDraft(s.volume ?? 70);
      })
      .catch(() => {})
      .finally(() => setSoundLoaded(true));
  }, []);

  const saveSoundSettings = useCallback(
    async (patch: Partial<AlertSoundSettings>) => {
      const prev = soundSettings;
      setSoundSettings((s) => ({ ...s, ...patch }));
      setSoundSaving(true);
      try {
        const updated = await updateAlertSoundSettings(patch);
        setSoundSettings(updated);
        if ('volume' in patch) setVolumeDraft(updated.volume ?? 70);
      } catch {
        setSoundSettings(prev);
      } finally {
        setSoundSaving(false);
      }
    },
    [soundSettings],
  );

  const handleVolumeCommit = useCallback(() => {
    saveSoundSettings({ volume: volumeDraft });
  }, [saveSoundSettings, volumeDraft]);

  const handleAlertSoundChange = useCallback(
    async (id: number, sound_type: AlertSoundType) => {
      setUpdatingSoundId(id);
      setActionError(null);
      try {
        await updateAlertSoundType(id, sound_type);
        await updateAlert(id, { sound_type });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to update sound');
      } finally {
        setUpdatingSoundId(null);
      }
    },
    [updateAlert],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm('Delete this alert?')) return;
      setDeletingId(id);
      setActionError(null);
      try {
        await removeAlert(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete alert');
      } finally {
        setDeletingId(null);
      }
    },
    [removeAlert],
  );

  const handleToggle = useCallback(
    async (id: number) => {
      setTogglingId(id);
      setActionError(null);
      try {
        await toggleAlert(id);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to update alert');
      } finally {
        setTogglingId(null);
      }
    },
    [toggleAlert],
  );

  const openCreate = useCallback(() => {
    setEditAlert(undefined);
    setActionError(null);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((alert: Alert) => {
    setEditAlert(alert);
    setActionError(null);
    setShowModal(true);
  }, []);

  const activeAlerts = alerts.filter((a) => a.triggered_at === null);
  const historyAlerts = [...alerts.filter((a) => a.triggered_at !== null)].sort((a, b) =>
    (b.triggered_at ?? '').localeCompare(a.triggered_at ?? ''),
  );

  return (
    <>
      {/* ── Notification Sound ── */}
      <section aria-labelledby="sound-settings-heading" className="mb-6">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {soundSettings.enabled ? (
                <Volume2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
              )}
              <h2 id="sound-settings-heading" className="text-sm font-semibold text-white">
                Notification Sound
              </h2>
            </div>
            {soundSaving && <span className="text-xs text-slate-500">Saving…</span>}
          </div>

          {!soundLoaded ? (
            <div className="h-28 animate-pulse rounded-lg bg-slate-700/40" />
          ) : (
            <div className="space-y-5">
              <ToggleSwitch
                label="Enable alert sounds"
                description="Play a sound when a price alert fires"
                checked={soundSettings.enabled}
                onChange={(v) => saveSoundSettings({ enabled: v })}
                disabled={soundSaving}
              />

              <div
                className={clsx(
                  'space-y-5 transition-opacity duration-150',
                  !soundSettings.enabled && 'pointer-events-none opacity-40',
                )}
              >
                <div>
                  <label
                    htmlFor="global-sound-type"
                    className="mb-1.5 block text-xs font-medium text-slate-400"
                  >
                    Default sound
                  </label>
                  <SoundTypePicker
                    id="global-sound-type"
                    value={soundSettings.sound_type}
                    onChange={(v) =>
                      saveSoundSettings({ sound_type: v as 'chime' | 'alarm' | 'silent' })
                    }
                    volume={volumeDraft}
                    disabled={soundSaving}
                    hideDefault
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="alert-volume"
                      className="text-xs font-medium text-slate-400"
                    >
                      Volume
                    </label>
                    <span className="text-xs tabular-nums text-slate-400">{volumeDraft}%</span>
                  </div>
                  <input
                    id="alert-volume"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={volumeDraft}
                    onChange={(e) => setVolumeDraft(Number(e.target.value))}
                    onMouseUp={handleVolumeCommit}
                    onTouchEnd={handleVolumeCommit}
                    disabled={soundSaving}
                    aria-label="Alert notification volume"
                    className="w-full accent-blue-500 disabled:opacity-50"
                  />
                </div>

                <ToggleSwitch
                  label="Mute when tab is focused"
                  description="Suppress sounds while you're actively viewing the app"
                  checked={soundSettings.mute_when_active}
                  onChange={(v) => saveSoundSettings({ mute_when_active: v })}
                  disabled={soundSaving}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Price Alerts ── */}
      <section aria-labelledby="price-alerts-heading">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <h2 id="price-alerts-heading" className="text-sm font-semibold text-white">
                Price Alerts
              </h2>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
              aria-label="Create new price alert"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              New alert
            </button>
          </div>

          {actionError && (
            <div
              role="alert"
              className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
            >
              {actionError}
            </div>
          )}

          {loading && (
            <div className="py-8 text-center text-sm text-slate-500">Loading alerts…</div>
          )}

          {!loading && error && (
            <div className="py-4 text-center text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && alerts.length === 0 && (
            <div className="py-8 text-center">
              <Bell className="mx-auto mb-2 h-8 w-8 text-slate-600" aria-hidden="true" />
              <p className="text-sm text-slate-500">No price alerts yet.</p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-2 text-xs text-blue-400 underline hover:text-blue-300"
              >
                Create your first alert
              </button>
            </div>
          )}

          {!loading && activeAlerts.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Active ({activeAlerts.length})
              </p>
              <ul
                role="list"
                aria-label="Active price alerts"
                className="divide-y divide-slate-700/30 rounded-lg border border-slate-700/40"
              >
                {activeAlerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    globalSoundType={soundSettings.sound_type}
                    volume={volumeDraft}
                    isToggling={togglingId === alert.id}
                    isDeleting={deletingId === alert.id}
                    isUpdatingSound={updatingSoundId === alert.id}
                    onToggle={handleToggle}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onSoundChange={handleAlertSoundChange}
                  />
                ))}
              </ul>
            </div>
          )}

          {!loading && historyAlerts.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Triggered ({historyAlerts.length})
              </p>
              <ul
                role="list"
                aria-label="Triggered price alerts"
                className="divide-y divide-slate-700/30 rounded-lg border border-slate-700/40 opacity-75"
              >
                {historyAlerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    globalSoundType={soundSettings.sound_type}
                    volume={volumeDraft}
                    isToggling={togglingId === alert.id}
                    isDeleting={deletingId === alert.id}
                    isUpdatingSound={updatingSoundId === alert.id}
                    onToggle={handleToggle}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onSoundChange={handleAlertSoundChange}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {showModal && (
        <AlertFormModal
          alert={editAlert}
          onCreate={createAlert}
          onUpdate={updateAlert}
          onSuccess={() => setShowModal(false)}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
