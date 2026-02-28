'use client';

import { useState, useCallback } from 'react';
import { Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useApi } from '@/hooks/useApi';
import { useAgentSchedules } from '@/hooks/useAgentSchedules';
import { createAgentSchedule, updateAgentSchedule, getKnownAgents } from '@/lib/api';
import type { AgentSchedule, KnownAgent, ScheduleFormValues } from '@/lib/types';
import AgentScheduleList from './AgentScheduleList';
import AgentScheduleModal from './AgentScheduleModal';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentScheduleManager() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<AgentSchedule | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const {
    schedules,
    loading,
    error,
    refetch,
    toggleEnabled,
    deleteSchedule,
    triggerSchedule,
  } = useAgentSchedules();

  const { data: agentsData } = useApi(getKnownAgents, []);
  const agents: KnownAgent[] = agentsData?.agents ?? [];

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function withLoading(id: number, action: string, fn: () => Promise<void>) {
    setActionLoading((prev) => ({ ...prev, [id]: action }));
    fn().finally(() => {
      setActionLoading((prev) => { const n = { ...prev }; delete n[id]; return n; });
    });
  }

  const handleCreate = useCallback(async (data: ScheduleFormValues) => {
    await createAgentSchedule(data);
    setShowCreateModal(false);
    showToast('ok', 'Schedule created.');
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  const handleUpdate = useCallback(async (data: ScheduleFormValues) => {
    if (!editingSchedule) return;
    await updateAgentSchedule(editingSchedule.id, data);
    setEditingSchedule(null);
    showToast('ok', 'Schedule updated.');
    refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSchedule, refetch]);

  function handleToggle(id: number, enabled: boolean) {
    withLoading(id, 'toggle', async () => {
      try {
        await toggleEnabled(id, enabled);
      } catch {
        showToast('err', `Failed to ${enabled ? 'enable' : 'disable'} schedule.`);
      }
    });
  }

  function handleDelete(id: number) {
    withLoading(id, 'delete', async () => {
      try {
        await deleteSchedule(id);
        showToast('ok', 'Schedule deleted.');
      } catch (err) {
        showToast('err', err instanceof Error ? err.message : 'Delete failed.');
      }
    });
  }

  function handleTrigger(id: number) {
    withLoading(id, 'trigger', async () => {
      try {
        await triggerSchedule(id);
        showToast('ok', 'Job triggered.');
      } catch (err) {
        showToast('err', err instanceof Error ? err.message : 'Trigger failed.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {schedules.length} custom schedule{schedules.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => { setShowCreateModal(true); setEditingSchedule(null); }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
        >
          <Plus className="h-3.5 w-3.5" />
          New Schedule
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium',
            toast.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
          )}
        >
          {toast.type === 'ok'
            ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && schedules.length === 0 && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-700/30" />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && schedules.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load schedules: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && schedules.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700/50 py-12 text-center">
          <p className="text-sm text-slate-500">No custom schedules yet.</p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mt-3 text-xs text-blue-400 hover:underline"
          >
            Create your first schedule
          </button>
        </div>
      )}

      {/* Schedule list */}
      <AgentScheduleList
        schedules={schedules}
        actionLoading={actionLoading}
        onEdit={(id) => {
          const s = schedules.find((s) => s.id === id) ?? null;
          setEditingSchedule(s);
          setShowCreateModal(false);
        }}
        onDelete={handleDelete}
        onTrigger={handleTrigger}
        onToggle={handleToggle}
      />

      {/* Create modal */}
      {showCreateModal && (
        <AgentScheduleModal
          agents={agents}
          onSave={handleCreate}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit modal */}
      {editingSchedule && (
        <AgentScheduleModal
          agents={agents}
          initial={editingSchedule}
          onSave={handleUpdate}
          onClose={() => setEditingSchedule(null)}
        />
      )}
    </div>
  );
}
