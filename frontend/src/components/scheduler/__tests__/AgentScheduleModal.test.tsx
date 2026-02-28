import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentScheduleModal from '../AgentScheduleModal';
import type { KnownAgent, AgentSchedule } from '@/lib/types';

// Stub CronBuilder so modal tests focus on form logic, not cron picker details
vi.mock('../CronBuilder', () => ({
  default: () => <div data-testid="cron-builder" />,
}));

const mockAgents: KnownAgent[] = [
  { job_id: 'daily-brief', name: 'Daily Brief', description: 'Morning briefing' },
  { job_id: 'earnings-check', name: 'Earnings Check', description: 'Check earnings' },
];

const mockInitial: AgentSchedule = {
  id: 1,
  job_id: 'daily-brief',
  label: 'Morning Run',
  description: 'Runs at 9 AM',
  trigger: 'cron',
  trigger_args: { hour: 9, minute: 0 },
  enabled: true,
  created_at: '2026-02-28T00:00:00Z',
  updated_at: '2026-02-28T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Create mode
// ---------------------------------------------------------------------------

describe('AgentScheduleModal — create mode', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
    onClose = vi.fn();
    vi.clearAllMocks();
  });

  it('renders "New Schedule" heading', () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('New Schedule', { selector: '#schedule-modal-title' })).toBeInTheDocument();
  });

  it('renders agent options in the selector', () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('Daily Brief')).toBeInTheDocument();
    expect(screen.getByText('Earnings Check')).toBeInTheDocument();
  });

  it('shows "No agents available" when agents list is empty', () => {
    render(<AgentScheduleModal agents={[]} onSave={onSave} onClose={onClose} />);
    expect(screen.getByText('No agents available')).toBeInTheDocument();
  });

  it('shows validation error when label is empty on submit', async () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByText('Create Schedule'));
    expect(await screen.findByText('Label is required.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows validation error when agents list is empty on submit', async () => {
    render(<AgentScheduleModal agents={[]} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning Briefing at 8:30 AM'), {
      target: { value: 'My Schedule' },
    });
    fireEvent.click(screen.getByText('Create Schedule'));
    expect(await screen.findByText('Please select an agent.')).toBeInTheDocument();
  });

  it('calls onSave with trimmed label and description', async () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning Briefing at 8:30 AM'), {
      target: { value: '  Test Schedule  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Brief description of this schedule'), {
      target: { value: '  A description  ' },
    });
    fireEvent.click(screen.getByText('Create Schedule'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Test Schedule',
          description: 'A description',
          job_id: 'daily-brief',
        }),
      );
    });
  });

  it('shows inline error when onSave rejects', async () => {
    onSave.mockRejectedValue(new Error('API failure'));
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning Briefing at 8:30 AM'), {
      target: { value: 'Test' },
    });
    fireEvent.click(screen.getByText('Create Schedule'));
    expect(await screen.findByText('API failure')).toBeInTheDocument();
  });

  it('does not close modal on API failure', async () => {
    onSave.mockRejectedValue(new Error('Error'));
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Morning Briefing at 8:30 AM'), {
      target: { value: 'Test' },
    });
    fireEvent.click(screen.getByText('Create Schedule'));
    await screen.findByText('Error');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the X icon button is clicked', () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog').previousSibling as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders CronBuilder stub', () => {
    render(<AgentScheduleModal agents={mockAgents} onSave={onSave} onClose={onClose} />);
    expect(screen.getByTestId('cron-builder')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

describe('AgentScheduleModal — edit mode', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
    onClose = vi.fn();
  });

  it('renders "Edit Schedule" heading', () => {
    render(
      <AgentScheduleModal agents={mockAgents} initial={mockInitial} onSave={onSave} onClose={onClose} />,
    );
    expect(screen.getByText('Edit Schedule', { selector: '#schedule-modal-title' })).toBeInTheDocument();
  });

  it('pre-fills label from initial', () => {
    render(
      <AgentScheduleModal agents={mockAgents} initial={mockInitial} onSave={onSave} onClose={onClose} />,
    );
    expect(screen.getByDisplayValue('Morning Run')).toBeInTheDocument();
  });

  it('pre-fills description from initial', () => {
    render(
      <AgentScheduleModal agents={mockAgents} initial={mockInitial} onSave={onSave} onClose={onClose} />,
    );
    expect(screen.getByDisplayValue('Runs at 9 AM')).toBeInTheDocument();
  });

  it('disables the agent selector in edit mode', () => {
    render(
      <AgentScheduleModal agents={mockAgents} initial={mockInitial} onSave={onSave} onClose={onClose} />,
    );
    expect(screen.getByDisplayValue('Daily Brief').closest('select')).toBeDisabled();
  });

  it('shows "Update Schedule" submit button text', () => {
    render(
      <AgentScheduleModal agents={mockAgents} initial={mockInitial} onSave={onSave} onClose={onClose} />,
    );
    expect(screen.getByText('Update Schedule')).toBeInTheDocument();
  });

  it('calls onSave with updated label', async () => {
    render(
      <AgentScheduleModal agents={mockAgents} initial={mockInitial} onSave={onSave} onClose={onClose} />,
    );
    const input = screen.getByDisplayValue('Morning Run');
    fireEvent.change(input, { target: { value: 'Renamed Schedule' } });
    fireEvent.click(screen.getByText('Update Schedule'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Renamed Schedule', job_id: 'daily-brief' }),
      );
    });
  });
});
