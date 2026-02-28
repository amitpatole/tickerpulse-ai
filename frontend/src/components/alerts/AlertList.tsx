'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getAlerts, toggleAlert, deleteAlert, patchAlertSound } from '@/lib/api';
import { SoundTypePicker } from './SoundTypePicker';
import type { PriceAlert, AlertConditionType, AlertSoundType } from '@/lib/types';

function formatCondition(conditionType: AlertConditionType, threshold: number): string {
  switch (conditionType) {
    case 'price_above':
      return `above $${threshold.toFixed(2)}`;
    case 'price_below':
      return `below $${threshold.toFixed(2)}`;
    case 'pct_change':
      return `±${threshold.toFixed(1)}%`;
  }
}

export function AlertList() {
  const { data, loading, error, refetch } = useApi(() => getAlerts(), []);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);

  useEffect(() => {
    if (data) setAlerts(data);
  }, [data]);

  const handleToggle = useCallback(
    async (id: number) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
      );
      try {
        const updated = await toggleAlert(id);
        setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      } catch {
        refetch();
      }
    },
    [refetch],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      try {
        await deleteAlert(id);
      } catch {
        refetch();
      }
    },
    [refetch],
  );

  const handleSoundChange = useCallback(
    async (id: number, soundType: AlertSoundType) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, sound_type: soundType } : a)),
      );
      try {
        await patchAlertSound(id, soundType);
      } catch {
        refetch();
      }
    },
    [refetch],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-400" role="status">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
        Loading alerts…
      </div>
    );
  }

  if (error) {
    return <p className="px-5 py-6 text-sm text-red-400">Failed to load alerts: {error}</p>;
  }

  if (alerts.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-slate-400">
        No price alerts configured. Add alerts from the watchlist.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-700/50">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex items-center gap-3 px-5 py-3.5">
          {/* Ticker + condition */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">{alert.ticker}</span>
              <span className="text-sm text-slate-400">
                {formatCondition(alert.condition_type, alert.threshold)}
              </span>
              {alert.fire_count > 0 && (
                <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[11px] font-medium text-blue-400">
                  {alert.fire_count}×
                </span>
              )}
            </div>
            {alert.triggered_at && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Last fired {new Date(alert.triggered_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* Per-alert sound picker */}
          <div className="flex items-center gap-1.5">
            {alert.sound_type !== 'default' && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-blue-400"
                title="Custom sound override active"
                aria-label="Custom sound override active"
              />
            )}
            <SoundTypePicker
              value={alert.sound_type}
              onChange={(type) => handleSoundChange(alert.id, type)}
            />
          </div>

          {/* Enable / disable toggle */}
          <button
            type="button"
            onClick={() => handleToggle(alert.id)}
            aria-label={alert.enabled ? 'Disable alert' : 'Enable alert'}
            title={alert.enabled ? 'Disable alert' : 'Enable alert'}
            className="text-slate-400 transition-colors hover:text-slate-200"
          >
            {alert.enabled ? (
              <ToggleRight className="h-5 w-5 text-blue-400" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => handleDelete(alert.id)}
            aria-label="Delete alert"
            title="Delete alert"
            className="text-slate-500 transition-colors hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
