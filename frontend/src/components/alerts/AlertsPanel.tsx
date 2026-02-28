'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  Clock,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Pencil,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';
import {
  getAlertSoundSettings,
  updateAlertSoundSettings,
  updateAlertSoundType,
} from '@/lib/api';
import { playAlertSound } from '@/lib/alertSound';
import { clsx } from 'clsx';
import { useAlerts } from '@/hooks/useAlerts';
import { timeAgo } from '@/lib/formatTime';
import AlertFormModal from '@/components/alerts/AlertFormModal';
import type { Alert, AlertSoundType } from '@/lib/types';

type Tab = 'active' | 'history';

interface AlertsPanelProps {
  onClose: () => void;
}

const SOUND_OPTIONS: { value: AlertSoundType; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
  { value: 'silent', label: 'Silent' },
];

export default function AlertsPanel({ onClose }: AlertsPanelProps) {
  const [tab, setTab] = useState<Tab>('active');
  const [showModal, setShowModal] = useState(false);
  const [editAlert, setEditAlert] = useState<Alert | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [updatingSoundId, setUpdatingSoundId] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(null);
  const [soundVolume, setSoundVolume] = useState(70);
  const [globalSoundType, setGlobalSoundType] = useState<'chime' | 'alarm' | 'silent'>('chime');
  const [muteSaving, setMuteSaving] = useState(false);

  useEffect(() => {
    getAlertSoundSettings()
      .then((s) => {
        setSoundEnabled(s.enabled);
        setSoundVolume(s.volume ?? 70);
        setGlobalSoundType(s.sound_type);
      })
      .catch(() => {/* non-critical: leave null to hide the button */});
  }, []);

  const handleToggleMute = useCallback(async () => {
    if (soundEnabled === null || muteSaving) return;
    const next = !soundEnabled;
    setSoundEnabled(next);
    setMuteSaving(true);
    try {
      await updateAlertSoundSettings({ enabled: next });
    } catch {
      setSoundEnabled(!next); // revert on failure
    } finally {
      setMuteSaving(false);
    }
  }, [soundEnabled, muteSaving]);

  const {
    alerts,
    loading,
    error,
    createAlert,
    updateAlert,
    removeAlert,
    toggleAlert,
  } = useAlerts();

  // Active: not yet triggered (triggered_at is null), regardless of enabled state.
  const activeAlerts = alerts.filter((a) => a.triggered_at === null);
  // History: alerts that have fired at least once.
  const historyAlerts = [...alerts.filter((a) => a.triggered_at !== null)].sort(
    (a, b) => {
      const ta = a.triggered_at ?? '';
      const tb = b.triggered_at ?? '';
      return tb.localeCompare(ta);
    }
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

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm('Delete this alert?')) return;
      setDeletingId(id);
      setActionError(null);
      try {
        await removeAlert(id);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Failed to delete alert'
        );
      } finally {
        setDeletingId(null);
      }
    },
    [removeAlert]
  );

  const handleToggle = useCallback(
    async (id: number) => {
      setTogglingId(id);
      setActionError(null);
      try {
        await toggleAlert(id);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Failed to update alert'
        );
      } finally {
        setTogglingId(null);
      }
    },
    [toggleAlert]
  );

  const handleAlertSoundChange = useCallback(
    async (id: number, sound_type: AlertSoundType) => {
      setUpdatingSoundId(id);
      try {
        await updateAlertSoundType(id, sound_type);
        // Reflect the optimistic update via the hook's updateAlert
        await updateAlert(id, { sound_type });
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Failed to update sound'
        );
      } finally {
        setUpdatingSoundId(null);
      }
    },
    [updateAlert]
  );

  const handlePreviewAlertSound = useCallback(
    (soundType: AlertSoundType) => {
      const resolved =
        soundType === 'default' ? globalSoundType : soundType;
      if (resolved !== 'silent') {
        playAlertSound(resolved, soundVolume / 100);
      }
    },
    [globalSoundType, soundVolume]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <div
        role="dialog"
        aria-label="Price Alerts"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-slate-700/50 bg-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-white">
              Price Alerts
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
              aria-label="Create new price alert"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              New
            </button>
            {soundEnabled !== null && (
              <button
                type="button"
                onClick={handleToggleMute}
                disabled={muteSaving}
                aria-label={soundEnabled ? 'Mute alert sounds' : 'Unmute alert sounds'}
                aria-pressed={!soundEnabled}
                className={clsx(
                  'rounded p-1 transition-colors disabled:opacity-50',
                  soundEnabled
                    ? 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    : 'text-amber-400 hover:bg-slate-700/50'
                )}
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close alerts panel"
              className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Alert views" className="flex border-b border-slate-700/50">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'active'}
            onClick={() => setTab('active')}
            className={clsx(
              'flex-1 px-4 py-2.5 text-xs font-medium transition-colors',
              tab === 'active'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            Active ({activeAlerts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
            className={clsx(
              'flex-1 px-4 py-2.5 text-xs font-medium transition-colors',
              tab === 'history'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            History ({historyAlerts.length})
          </button>
        </div>

        {/* Action error */}
        {actionError && (
          <div
            role="alert"
            className="mx-3 mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
          >
            {actionError}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto" aria-live="polite">
          {loading && (
            <div className="p-6 text-center text-sm text-slate-500">
              Loading alerts…
            </div>
          )}

          {!loading && error && (
            <div className="p-4 text-center text-sm text-red-400">{error}</div>
          )}

          {/* Active tab */}
          {!loading && tab === 'active' && (
            <>
              {activeAlerts.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No active alerts.{' '}
                  <button
                    type="button"
                    onClick={openCreate}
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                <ul
                  role="list"
                  aria-label="Active alerts"
                  className="divide-y divide-slate-700/30"
                >
                  {activeAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className={clsx(
                        'flex items-start gap-2 px-4 py-3 transition-colors hover:bg-slate-800/30',
                        !alert.enabled && 'opacity-50'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-medium text-slate-200">
                            {alert.ticker}
                          </span>
                          <span
                            className="truncate text-xs text-slate-300"
                            title={alert.message}
                          >
                            {alert.message}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span>Created {timeAgo(alert.created_at)}</span>
                          {/* Inline sound type picker */}
                          <div className="flex items-center gap-1">
                            <select
                              value={alert.sound_type ?? 'default'}
                              onChange={(e) =>
                                handleAlertSoundChange(
                                  alert.id,
                                  e.target.value as AlertSoundType
                                )
                              }
                              disabled={updatingSoundId === alert.id}
                              aria-label={`Sound for ${alert.ticker} alert`}
                              className="rounded border border-slate-700 bg-slate-800/80 px-1 py-0 text-[11px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/30 disabled:opacity-50"
                            >
                              {SOUND_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                handlePreviewAlertSound(
                                  (alert.sound_type ?? 'default') as AlertSoundType
                                )
                              }
                              disabled={alert.sound_type === 'silent'}
                              aria-label={`Preview sound for ${alert.ticker} alert`}
                              className="rounded p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-40"
                            >
                              <Play className="h-2.5 w-2.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-1">
                        {/* Toggle enable/disable */}
                        <button
                          type="button"
                          onClick={() => handleToggle(alert.id)}
                          disabled={togglingId === alert.id}
                          aria-label={alert.enabled ? 'Disable alert' : 'Enable alert'}
                          aria-pressed={alert.enabled}
                          className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-50"
                        >
                          {alert.enabled ? (
                            <ToggleRight
                              className="h-4 w-4 text-green-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => openEdit(alert)}
                          aria-label={`Edit alert for ${alert.ticker}`}
                          className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDelete(alert.id)}
                          disabled={deletingId === alert.id}
                          aria-label={`Delete alert for ${alert.ticker}`}
                          className="rounded p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* History tab */}
          {!loading && tab === 'history' && (
            <>
              {historyAlerts.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No alerts have fired yet.
                </div>
              ) : (
                <ul
                  role="list"
                  aria-label="Alert history"
                  className="divide-y divide-slate-700/30"
                >
                  {historyAlerts.map((alert) => (
                    <li key={alert.id} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Clock
                          className="h-3.5 w-3.5 flex-shrink-0 text-amber-400"
                          aria-hidden="true"
                        />
                        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[11px] font-medium text-slate-200">
                          {alert.ticker}
                        </span>
                        <span
                          className="truncate text-xs text-slate-300"
                          title={alert.message}
                        >
                          {alert.message}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                        <span>
                          Fired {alert.fire_count ?? 1}
                          {(alert.fire_count ?? 1) === 1 ? ' time' : ' times'}
                        </span>
                        {alert.triggered_at && (
                          <span>Last: {timeAgo(alert.triggered_at)}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create / Edit modal — rendered above the panel */}
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