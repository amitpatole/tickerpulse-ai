```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getAlerts,
  createAlert as apiCreateAlert,
  updateAlert as apiUpdateAlert,
  deleteAlert as apiDeleteAlert,
} from '@/lib/api';
import type { Alert, AlertSoundType } from '@/lib/types';

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAlerts()
      .then((data) => {
        if (!cancelled) setAlerts(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load alerts');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createAlert = useCallback(
    async (
      payload: Omit<Alert, 'id' | 'active' | 'enabled' | 'created_at' | 'triggered_at'>,
    ): Promise<Alert> => {
      const newAlert = await apiCreateAlert(
        payload as Omit<Alert, 'id' | 'active' | 'created_at' | 'triggered_at'>,
      );
      setAlerts((prev) => [newAlert, ...prev]);
      return newAlert;
    },
    [],
  );

  const updateAlert = useCallback(
    async (id: number, data: Partial<Alert>): Promise<Alert> => {
      const updated = await apiUpdateAlert(id, data);
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      return updated;
    },
    [],
  );

  const removeAlert = useCallback(async (id: number): Promise<void> => {
    await apiDeleteAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleAlert = useCallback(
    async (id: number): Promise<void> => {
      const alert = alerts.find((a) => a.id === id);
      if (!alert) return;
      const updated = await apiUpdateAlert(id, { enabled: !alert.enabled });
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    },
    [alerts],
  );

  return { alerts, loading, error, createAlert, updateAlert, removeAlert, toggleAlert };
}
```