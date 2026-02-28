import { useState, useCallback, useRef, useEffect } from 'react';
import {
  getAgentSchedules,
  updateAgentSchedule,
  deleteAgentSchedule,
  triggerAgentSchedule,
} from '@/lib/api';
import type { AgentSchedule } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAgentSchedulesResult {
  schedules: AgentSchedule[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  toggleEnabled: (id: number, enabled: boolean) => Promise<void>;
  deleteSchedule: (id: number) => Promise<void>;
  triggerSchedule: (id: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentSchedules(): UseAgentSchedulesResult {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAgentSchedules();
      if (mountedRef.current) setSchedules(data.schedules ?? []);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load schedules.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleEnabled = useCallback(async (id: number, enabled: boolean) => {
    // Optimistic update — flip locally before the API round-trip
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    try {
      await updateAgentSchedule(id, { enabled });
    } catch (err) {
      // Revert on failure
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !enabled } : s)));
      throw err;
    }
  }, []);

  const deleteSchedule = useCallback(async (id: number) => {
    await deleteAgentSchedule(id);
    if (mountedRef.current) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    }
  }, []);

  const triggerSchedule = useCallback(async (id: number) => {
    await triggerAgentSchedule(id);
  }, []);

  return { schedules, loading, error, refetch: fetch, toggleEnabled, deleteSchedule, triggerSchedule };
}
