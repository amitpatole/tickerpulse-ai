'use client';

import { useState, useCallback } from 'react';
import {
  X,
  Bell,
  Clock,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Pencil,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAlerts } from '@/hooks/useAlerts';
import AlertFormModal from '@/components/alerts/AlertFormModal';
import type { Alert } from '@/lib/types';

type Tab = 'active' | 'history';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

interface AlertsPanelProps {
  onClose: () => void;
}

export default function AlertsPanel({ onClose }: AlertsPanelProps) {
  const [tab, setTab] = useState<Tab>('active');
  const [showModal, setShowModal] = useState(false);
  const [editAlert, setEditAlert] = useState<Alert | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

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
                        'flex items-center gap-2 px-4 py-3 transition-colors hover:bg-slate-800/30',
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
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Created {timeAgo(alert.created_at)}
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
