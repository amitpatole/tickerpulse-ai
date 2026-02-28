'use client';

import { useState, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { getAlerts } from '@/lib/api';
import AlertsPanel from '@/components/alerts/AlertsPanel';
import type { Alert } from '@/lib/types';

/**
 * Bell icon with a red badge showing the count of alerts that have
 * fired (triggered_at is set) since the panel was last opened.
 *
 * Polls GET /api/alerts every 30 s so the badge stays current even
 * when the panel is closed.  Clicking the bell opens AlertsPanel.
 */
export default function AlertBell() {
  const [panelOpen, setPanelOpen] = useState(false);
  // ISO timestamp of the last time the user opened the panel.
  // Alerts triggered after this timestamp are counted as "new".
  const lastOpenedAtRef = useRef<string | null>(null);

  const { data: alerts } = useApi<Alert[]>(() => getAlerts(), [], {
    refreshInterval: 30_000,
  });

  const triggeredCount = (alerts ?? []).filter((a) => {
    if (!a.triggered_at) return false;
    if (!lastOpenedAtRef.current) return true;
    // Compare ISO strings lexicographically — valid because they're UTC.
    return a.triggered_at > lastOpenedAtRef.current;
  }).length;

  const handleOpen = useCallback(() => {
    lastOpenedAtRef.current = new Date().toISOString();
    setPanelOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={
          triggeredCount > 0
            ? `${triggeredCount} new price alert${triggeredCount > 1 ? 's' : ''}`
            : 'View price alerts'
        }
        aria-haspopup="dialog"
        className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {triggeredCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
          >
            {triggeredCount > 9 ? '9+' : triggeredCount}
          </span>
        )}
      </button>

      {panelOpen && <AlertsPanel onClose={handleClose} />}
    </>
  );
}
