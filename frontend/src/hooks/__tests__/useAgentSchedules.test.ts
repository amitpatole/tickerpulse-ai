import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useAgentSchedules } from '@/hooks/useAgentSchedules';
import * as api from '@/lib/api';
import type { AgentSchedule } from '@/lib/types';

vi.mock('@/lib/api');

function makeSchedule(id: number, enabled: boolean): AgentSchedule {
  return {
    id,
    job_id: `agent-${id}`,
    label: `Schedule ${id}`,
    description: null,
    trigger: 'cron',
    trigger_args: { hour: 9, minute: 0 },
    enabled,
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  };
}

const mockSchedules = [makeSchedule(1, true), makeSchedule(2, false)];

describe('useAgentSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAgentSchedules).mockResolvedValue({ schedules: mockSchedules, total: 2 });
  });

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------

  it('starts with loading=true and empty schedules', () => {
    const { result } = renderHook(() => useAgentSchedules());
    expect(result.current.loading).toBe(true);
    expect(result.current.schedules).toHaveLength(0);
  });

  it('populates schedules after fetch resolves', async () => {
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.schedules).toEqual(mockSchedules);
    expect(result.current.error).toBeNull();
  });

  it('sets error when getAgentSchedules rejects', async () => {
    vi.mocked(api.getAgentSchedules).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});
    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
    expect(result.current.schedules).toHaveLength(0);
  });

  it('calls getAgentSchedules once on mount', async () => {
    renderHook(() => useAgentSchedules());
    await act(async () => {});
    expect(api.getAgentSchedules).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // toggleEnabled — optimistic update
  // -------------------------------------------------------------------------

  it('optimistically flips enabled flag before API responds', async () => {
    vi.mocked(api.updateAgentSchedule).mockResolvedValue({ ...mockSchedules[0], enabled: false });
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    expect(result.current.schedules[0].enabled).toBe(true);

    // Fire without await to see the optimistic update before the promise settles
    act(() => { result.current.toggleEnabled(1, false); });

    expect(result.current.schedules[0].enabled).toBe(false);
  });

  it('reverts optimistic toggle on API error', async () => {
    vi.mocked(api.updateAgentSchedule).mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await act(async () => {
      try { await result.current.toggleEnabled(1, false); } catch {}
    });

    // Should be reverted to original enabled=true
    expect(result.current.schedules[0].enabled).toBe(true);
  });

  it('throws when toggleEnabled API call fails', async () => {
    vi.mocked(api.updateAgentSchedule).mockRejectedValue(new Error('Failed'));
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await expect(
      act(async () => { await result.current.toggleEnabled(1, false); }),
    ).rejects.toThrow('Failed');
  });

  it('calls updateAgentSchedule with { enabled } payload', async () => {
    vi.mocked(api.updateAgentSchedule).mockResolvedValue({ ...mockSchedules[1], enabled: true });
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await act(async () => { await result.current.toggleEnabled(2, true); });

    expect(api.updateAgentSchedule).toHaveBeenCalledWith(2, { enabled: true });
  });

  // -------------------------------------------------------------------------
  // deleteSchedule
  // -------------------------------------------------------------------------

  it('removes schedule from list on successful delete', async () => {
    vi.mocked(api.deleteAgentSchedule).mockResolvedValue({ success: true, id: 1 });
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await act(async () => { await result.current.deleteSchedule(1); });

    expect(result.current.schedules).toHaveLength(1);
    expect(result.current.schedules[0].id).toBe(2);
  });

  it('propagates deleteSchedule error without modifying list', async () => {
    vi.mocked(api.deleteAgentSchedule).mockRejectedValue(new Error('Delete failed'));
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await expect(
      act(async () => { await result.current.deleteSchedule(1); }),
    ).rejects.toThrow('Delete failed');

    expect(result.current.schedules).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // triggerSchedule
  // -------------------------------------------------------------------------

  it('calls triggerAgentSchedule with the correct id', async () => {
    vi.mocked(api.triggerAgentSchedule).mockResolvedValue({ success: true, job_id: 'agent-1' });
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await act(async () => { await result.current.triggerSchedule(1); });

    expect(api.triggerAgentSchedule).toHaveBeenCalledWith(1);
  });

  it('propagates triggerSchedule error to caller', async () => {
    vi.mocked(api.triggerAgentSchedule).mockRejectedValue(new Error('Trigger failed'));
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    await expect(
      act(async () => { await result.current.triggerSchedule(1); }),
    ).rejects.toThrow('Trigger failed');
  });

  // -------------------------------------------------------------------------
  // refetch
  // -------------------------------------------------------------------------

  it('refetch re-invokes getAgentSchedules', async () => {
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});
    expect(api.getAgentSchedules).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.refetch(); });

    expect(api.getAgentSchedules).toHaveBeenCalledTimes(2);
  });

  it('refetch updates schedules with new data', async () => {
    const { result } = renderHook(() => useAgentSchedules());
    await act(async () => {});

    const updated = [makeSchedule(3, true)];
    vi.mocked(api.getAgentSchedules).mockResolvedValue({ schedules: updated, total: 1 });

    await act(async () => { result.current.refetch(); });

    expect(result.current.schedules).toHaveLength(1);
    expect(result.current.schedules[0].id).toBe(3);
  });
});
