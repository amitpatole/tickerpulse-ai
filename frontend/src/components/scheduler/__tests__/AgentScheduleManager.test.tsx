import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import AgentScheduleManager from '../AgentScheduleManager';
import * as api from '@/lib/api';
import * as useApiModule from '@/hooks/useApi';
import * as useAgentSchedulesModule from '@/hooks/useAgentSchedules';
import type { AgentSchedule, KnownAgent } from '@/lib/types';

vi.mock('@/lib/api');
vi.mock('@/hooks/useApi');
vi.mock('@/hooks/useAgentSchedules');
// Stub CronBuilder — modal tests focus on AgentScheduleManager orchestration
vi.mock('../CronBuilder', () => ({
  default: () => <div data-testid="cron-builder" />,
}));

const mockAgents: KnownAgent[] = [
  { job_id: 'daily-brief', name: 'Daily Brief', description: 'Morning briefing' },
  { job_id: 'earnings-check', name: 'Earnings Check', description: 'Weekly earnings sync' },
];

const mockSchedules: AgentSchedule[] = [
  {
    id: 1,
    job_id: 'daily-brief',
    label: 'Morning Briefing at 8:30 AM',
    description: 'Every weekday at 8:30 AM',
    trigger: 'cron',
    trigger_args: { hour: 8, minute: 30, day_of_week: 'mon-fri' },
    enabled: true,
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  },
  {
    id: 2,
    job_id: 'earnings-check',
    label: 'Weekly Earnings Check',
    description: 'Check earnings every Monday',
    trigger: 'cron',
    trigger_args: { hour: 9, minute: 0, day_of_week: 'mon' },
    enabled: false,
    created_at: '2026-02-27T00:00:00Z',
    updated_at: '2026-02-27T00:00:00Z',
  },
];

interface SetupOptions {
  schedules?: AgentSchedule[];
  agents?: KnownAgent[];
  error?: string | null;
}

function setupMocks({ schedules = [], agents = mockAgents, error = null }: SetupOptions = {}) {
  const mockToggle = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockTrigger = vi.fn().mockResolvedValue(undefined);
  const mockRefetch = vi.fn();

  vi.mocked(useAgentSchedulesModule.useAgentSchedules).mockReturnValue({
    schedules,
    loading: false,
    error,
    refetch: mockRefetch,
    toggleEnabled: mockToggle,
    deleteSchedule: mockDelete,
    triggerSchedule: mockTrigger,
  });

  vi.mocked(useApiModule.useApi).mockReturnValue({
    data: { agents, total: agents.length },
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as ReturnType<typeof useApiModule.useApi>);

  return {
    mockToggle,
    mockDelete,
    mockTrigger,
    mockRefetch,
    mockCreate: vi.mocked(api.createAgentSchedule),
    mockUpdate: vi.mocked(api.updateAgentSchedule),
  };
}

describe('AgentScheduleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // AC1: Load schedules
  // =========================================================================

  it('displays correct schedule count text', () => {
    setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);
    expect(screen.getByText('2 custom schedules')).toBeInTheDocument();
  });

  it('displays singular schedule count text', () => {
    setupMocks({ schedules: [mockSchedules[0]] });
    render(<AgentScheduleManager />);
    expect(screen.getByText('1 custom schedule')).toBeInTheDocument();
  });

  it('renders schedule labels', () => {
    setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);
    expect(screen.getByText('Morning Briefing at 8:30 AM')).toBeInTheDocument();
    expect(screen.getByText('Weekly Earnings Check')).toBeInTheDocument();
  });

  it('shows Enabled and Disabled badges', () => {
    setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows empty state with zero schedules', () => {
    setupMocks({ schedules: [] });
    render(<AgentScheduleManager />);
    expect(screen.getByText('No custom schedules yet.')).toBeInTheDocument();
    expect(screen.getByText('Create your first schedule')).toBeInTheDocument();
  });

  it('shows error banner when hook returns error', () => {
    setupMocks({ schedules: [], error: 'Connection refused' });
    render(<AgentScheduleManager />);
    expect(screen.getByText(/Failed to load schedules: Connection refused/)).toBeInTheDocument();
  });

  // =========================================================================
  // AC2: Create schedule
  // =========================================================================

  it('opens create modal when "New Schedule" button clicked', async () => {
    setupMocks({ schedules: [] });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getByText('New Schedule'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Schedule', { selector: '#schedule-modal-title' })).toBeInTheDocument();
  });

  it('opens create modal from empty-state link', async () => {
    setupMocks({ schedules: [] });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getByText('Create your first schedule'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('creates a schedule and shows success toast', async () => {
    const { mockCreate, mockRefetch } = setupMocks({ schedules: [] });
    mockCreate.mockResolvedValue({ ...mockSchedules[0], id: 3 });
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getByText('New Schedule'));
    const labelInput = await screen.findByPlaceholderText('e.g. Morning Briefing at 8:30 AM');
    fireEvent.change(labelInput, { target: { value: 'New Test Schedule' } });
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'New Test Schedule' }),
      );
    });
    expect(await screen.findByText('Schedule created.')).toBeInTheDocument();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('closes modal after successful create', async () => {
    const { mockCreate } = setupMocks({ schedules: [] });
    mockCreate.mockResolvedValue(mockSchedules[0]);
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getByText('New Schedule'));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning Briefing at 8:30 AM'), {
      target: { value: 'Test' },
    });
    fireEvent.click(screen.getByText('Create Schedule'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // =========================================================================
  // AC3: Validation
  // =========================================================================

  it('shows label required error when submitting with empty label', async () => {
    setupMocks({ schedules: [] });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getByText('New Schedule'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('Create Schedule'));
    expect(await screen.findByText('Label is required.')).toBeInTheDocument();
  });

  it('shows agent-required error when agents list is empty', async () => {
    setupMocks({ schedules: [], agents: [] });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getByText('New Schedule'));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning Briefing at 8:30 AM'), {
      target: { value: 'Label' },
    });
    fireEvent.click(screen.getByText('Create Schedule'));
    expect(await screen.findByText('Please select an agent.')).toBeInTheDocument();
  });

  // =========================================================================
  // AC4: Edit schedule
  // =========================================================================

  it('opens edit modal with pre-filled label on Edit click', async () => {
    setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    expect(await screen.findByText('Edit Schedule', { selector: '#schedule-modal-title' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Morning Briefing at 8:30 AM')).toBeInTheDocument();
  });

  it('updates schedule and shows success toast', async () => {
    const { mockUpdate, mockRefetch } = setupMocks({ schedules: mockSchedules });
    mockUpdate.mockResolvedValue({ ...mockSchedules[0], label: 'Updated' });
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    await screen.findByText('Edit Schedule', { selector: '#schedule-modal-title' });

    const labelInput = screen.getByDisplayValue('Morning Briefing at 8:30 AM');
    fireEvent.change(labelInput, { target: { value: 'Updated Label' } });
    fireEvent.click(screen.getByText('Update Schedule'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(1, expect.objectContaining({ label: 'Updated Label' }));
    });
    expect(await screen.findByText('Schedule updated.')).toBeInTheDocument();
    expect(mockRefetch).toHaveBeenCalled();
  });

  // =========================================================================
  // AC5: Delete schedule
  // =========================================================================

  it('deletes schedule and shows success toast', async () => {
    const { mockDelete } = setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getAllByTitle('Delete')[0]);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Schedule deleted.')).toBeInTheDocument();
  });

  it('shows error toast when delete fails', async () => {
    const { mockDelete } = setupMocks({ schedules: mockSchedules });
    mockDelete.mockRejectedValue(new Error('Permission denied'));
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getAllByTitle('Delete')[0]);

    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
  });

  // =========================================================================
  // AC6: Trigger schedule
  // =========================================================================

  it('triggers schedule and shows success toast', async () => {
    const { mockTrigger } = setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getAllByTitle('Run now')[0]);

    await waitFor(() => expect(mockTrigger).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Job triggered.')).toBeInTheDocument();
  });

  it('shows error toast when trigger fails', async () => {
    const { mockTrigger } = setupMocks({ schedules: mockSchedules });
    mockTrigger.mockRejectedValue(new Error('Job already running'));
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getAllByTitle('Run now')[0]);

    expect(await screen.findByText('Job already running')).toBeInTheDocument();
  });

  // =========================================================================
  // Toggle enabled/disabled
  // =========================================================================

  it('calls toggleEnabled with id=1 and enabled=false when Disable clicked', async () => {
    const { mockToggle } = setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getByTitle('Disable'));

    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith(1, false));
  });

  it('calls toggleEnabled with id=2 and enabled=true when Enable clicked', async () => {
    const { mockToggle } = setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getByTitle('Enable'));

    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith(2, true));
  });

  it('shows error toast when toggle fails', async () => {
    const { mockToggle } = setupMocks({ schedules: mockSchedules });
    mockToggle.mockRejectedValue(new Error('Toggle error'));
    render(<AgentScheduleManager />);

    fireEvent.click(screen.getByTitle('Disable'));

    expect(await screen.findByText(/Failed to disable schedule/)).toBeInTheDocument();
  });

  // =========================================================================
  // Modal close
  // =========================================================================

  it('closes create modal when Cancel is clicked', async () => {
    setupMocks({ schedules: [] });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getByText('New Schedule'));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes edit modal when Cancel is clicked', async () => {
    setupMocks({ schedules: mockSchedules });
    render(<AgentScheduleManager />);
    fireEvent.click(screen.getAllByTitle('Edit')[0]);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
