'use client';

import AgentScheduleForm from '@/components/scheduler/AgentScheduleForm';
import { useApi } from '@/hooks/useApi';
import { listKnownAgents } from '@/lib/api';
import type { KnownAgent } from '@/lib/api';
import type { AgentSchedule, ScheduledJob } from '@/lib/types';

export interface AgentScheduleModalProps {
  open: boolean;
  schedule: AgentSchedule | null;
  /**
   * System jobs used as fallback agent list when /api/scheduler/agents
   * returns an empty response or the fetch has not yet resolved.
   */
  systemJobs: ScheduledJob[];
  onClose: () => void;
  onSave: (data: {
    job_id: string;
    label: string;
    description?: string;
    trigger: 'cron' | 'interval';
    trigger_args: Record<string, number | string>;
  }) => Promise<void>;
}

/**
 * Self-contained wrapper around AgentScheduleForm.
 *
 * Fetches the canonical agent list from /api/scheduler/agents when the modal
 * is open, and falls back to deriving KnownAgent entries from systemJobs so
 * the form always has something to show even before the endpoint responds.
 */
export default function AgentScheduleModal({
  open,
  schedule,
  systemJobs,
  onClose,
  onSave,
}: AgentScheduleModalProps) {
  const { data: knownAgents } = useApi<KnownAgent[]>(listKnownAgents, [], {
    enabled: open,
  });

  const agents: KnownAgent[] =
    knownAgents && knownAgents.length > 0
      ? knownAgents
      : systemJobs.map((j) => ({
          job_id: j.id,
          name: j.name,
          description: '',
        }));

  return (
    <AgentScheduleForm
      open={open}
      schedule={schedule}
      agents={agents}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
