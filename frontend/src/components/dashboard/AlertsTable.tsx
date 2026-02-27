'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Clock, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, FlaskConical } from 'lucide-react';
import { clsx } from 'clsx';
import { testAlert } from '@/lib/api';
import { useAlerts } from '@/hooks/useAlerts';
import AlertFormModal from '@/components/alerts/AlertFormModal';
import type { Alert } from '@/lib/types';

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

const SEVERITY_STYLES: Record<string, { badge: string; icon: React.ReactNode }> = {
  critical: {
    badge: 'bg-red-500/10 text-red-400 border-red-500/30',
    icon: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
  },
  warning: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    icon: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
  },
  info: {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    icon: <Info className="h-3 w-3" aria-hidden="true" />,
  },
};

function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? {
    badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    icon: <Info className="h-3 w-3" aria-hidden="true" />,
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
        style.badge
      )}
    >
      {style.icon}
      {severity}
    </span>
  );
}

const FILTERS: { label: string; value: SeverityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
];

interface AlertsTableProps {
  /**
   * Pre-fetched alerts from useDashboardData passed as initial data
   * to eliminate the cold-start loading flash on page load.
   * The component still manages its own state via useAlerts.
   * - undefined: not passed → show loading until first fetch completes
   * - null:      parent is loading → show loading
   * - Alert[]:   use as initial display until hook hydrates
   */
  initialData?: Alert[] | null;
}

export default function AlertsTable({ initialData }: AlertsTableProps = {}) {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [modalAlert, setModalAlert] = useState<Alert | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { alerts: liveAlerts, loading, error, createAlert, updateAlert, removeAlert, toggleAlert } = useAlerts();

  // Prefer live hook data; fall back to initialData during the first load cycle.
  const alerts = liveAlerts.length > 0 ? liveAlerts : (initialData ?? null);

  const filtered = (alerts ?? []).filter(
    (a) => filter === 'all' || a.severity === filter
  );

  const counts = (alerts ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {});

  function openCreate() {
    setModalAlert(undefined);
    setActionError(null);
    setShowModal(true);
  }

  function openEdit(alert: Alert) {
    setModalAlert(alert);
    setActionError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setModalAlert(undefined);
  }

  async function handleDelete(id: number) {
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
  }

  async function handleToggle(id: number) {
    setTogglingId(id);
    setActionError(null);
    try {
      await toggleAlert(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update alert');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTest(id: number) {
    setTestingId(id);
    setActionError(null);
    try {
      await testAlert(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send test notification');
    } finally {
      setTestingId(null);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">
              Alerts
              {alerts && alerts.length > 0 && (
                <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                  {alerts.length}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
              aria-label="Create new price alert"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Add Alert
            </button>
          </div>

          {/* Severity filter tabs */}
          <div role="tablist" aria-label="Filter alerts by severity" className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={clsx(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === f.value
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                )}
              >
                {f.label}
                {f.value !== 'all' && counts[f.value] != null && (
                  <span className="ml-1 text-slate-500">({counts[f.value]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Action error banner */}
        {actionError && (
          <div
            role="alert"
            className="mx-4 mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
          >
            {actionError}
          </div>
        )}

        {/* Table body */}
        <div
          className="overflow-x-auto"
          aria-live="polite"
          aria-busy={loading && !alerts}
        >
          {loading && !alerts && (
            <div className="p-6 text-center text-sm text-slate-500">Loading alerts...</div>
          )}

          {error && !alerts && (
            <div className="p-4 text-center text-sm text-red-400">{error}</div>
          )}

          {alerts && filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              {filter === 'all' ? (
                <span>
                  No alerts yet.{' '}
                  <button
                    type="button"
                    onClick={openCreate}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Add your first alert
                  </button>
                </span>
              ) : (
                `No ${filter} alerts.`
              )}
            </div>
          )}

          {alerts && filtered.length > 0 && (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Alerts list, filtered by {filter}</caption>
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Ticker
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Severity
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Condition
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Fires
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filtered.map((alert, idx) => (
                  <tr
                    key={alert.id ?? idx}
                    className={clsx(
                      'transition-colors hover:bg-slate-700/20',
                      !alert.enabled && 'opacity-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs font-medium text-slate-200">
                        {alert.ticker}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-300">
                      <p className="truncate text-xs" title={alert.message}>
                        {alert.message}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {alert.fire_count ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {timeAgo(alert.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Enable / disable toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggle(alert.id)}
                          disabled={togglingId === alert.id}
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

                        {/* Test notification */}
                        <button
                          type="button"
                          onClick={() => handleTest(alert.id)}
                          disabled={testingId === alert.id}
                          aria-label="Send test notification"
                          title="Test notification"
                          className="rounded p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 disabled:opacity-50"
                        >
                          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <AlertFormModal
          alert={modalAlert}
          onCreate={createAlert}
          onUpdate={updateAlert}
          onSuccess={() => closeModal()}
          onClose={closeModal}
        />
      )}
    </>
  );
}
