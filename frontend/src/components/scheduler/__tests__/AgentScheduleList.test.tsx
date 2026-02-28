import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AgentScheduleList from '../AgentScheduleList';
import type { AgentSchedule } from '@/lib/types';

const mockSchedules: AgentSchedule[] = [
  {
    id: 1,
    job_id: 'daily-brief',
    label: 'Morning Briefing',
    description: 'Daily at 8:30',
    trigger: 'cron',
    trigger_args: { hour: 8, minute: 30, day_of_week: 'mon-fri' },
    enabled: true,
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  },
  {
    id: 2,
    job_id: 'earnings-check',
    label: 'Weekly Earnings',
    description: null,
    trigger: 'interval',
    trigger_args: { seconds: 3600 },
    enabled: false,
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  },
];

const defaultProps = {
  schedules: mockSchedules,
  actionLoading: {} as Record<number, string>,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onTrigger: vi.fn(),
  onToggle: vi.fn(),
};

describe('AgentScheduleList', () => {
  it('renders null when schedules array is empty', () => {
    const { container } = render(
      <AgentScheduleList {...defaultProps} schedules={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders all schedule labels', () => {
    render(<AgentScheduleList {...defaultProps} />);
    expect(screen.getByText('Morning Briefing')).toBeInTheDocument();
    expect(screen.getByText('Weekly Earnings')).toBeInTheDocument();
  });

  it('shows Enabled badge for enabled schedule', () => {
    render(<AgentScheduleList {...defaultProps} />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows Disabled badge for disabled schedule', () => {
    render(<AgentScheduleList {...defaultProps} />);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows cron trigger summary', () => {
    render(<AgentScheduleList {...defaultProps} />);
    expect(screen.getByText(/Weekdays.*8:30 AM/)).toBeInTheDocument();
  });

  it('shows interval trigger summary', () => {
    render(<AgentScheduleList {...defaultProps} />);
    expect(screen.getByText(/Every 1h/)).toBeInTheDocument();
  });

  it('shows description when present', () => {
    render(<AgentScheduleList {...defaultProps} />);
    expect(screen.getByText(/Daily at 8:30/)).toBeInTheDocument();
  });

  it('calls onToggle with flipped enabled=false for an enabled schedule', () => {
    const onToggle = vi.fn();
    render(<AgentScheduleList {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByTitle('Disable'));
    expect(onToggle).toHaveBeenCalledWith(1, false);
  });

  it('calls onToggle with enabled=true for a disabled schedule', () => {
    const onToggle = vi.fn();
    render(<AgentScheduleList {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByTitle('Enable'));
    expect(onToggle).toHaveBeenCalledWith(2, true);
  });

  it('calls onTrigger with schedule id', () => {
    const onTrigger = vi.fn();
    render(<AgentScheduleList {...defaultProps} schedules={[mockSchedules[0]]} onTrigger={onTrigger} />);
    fireEvent.click(screen.getByTitle('Run now'));
    expect(onTrigger).toHaveBeenCalledWith(1);
  });

  it('calls onEdit with schedule id', () => {
    const onEdit = vi.fn();
    render(<AgentScheduleList {...defaultProps} schedules={[mockSchedules[0]]} onEdit={onEdit} />);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('calls onDelete with schedule id', () => {
    const onDelete = vi.fn();
    render(<AgentScheduleList {...defaultProps} schedules={[mockSchedules[0]]} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('disables all action buttons when actionLoading is set for a schedule', () => {
    render(
      <AgentScheduleList
        {...defaultProps}
        schedules={[mockSchedules[0]]}
        actionLoading={{ 1: 'delete' }}
      />,
    );
    expect(screen.getByTitle('Disable')).toBeDisabled();
    expect(screen.getByTitle('Run now')).toBeDisabled();
    expect(screen.getByTitle('Edit')).toBeDisabled();
    expect(screen.getByTitle('Delete')).toBeDisabled();
  });

  it('does not disable buttons for a different schedule id', () => {
    render(
      <AgentScheduleList
        {...defaultProps}
        schedules={[mockSchedules[0]]}
        actionLoading={{ 99: 'delete' }}
      />,
    );
    expect(screen.getByTitle('Disable')).not.toBeDisabled();
    expect(screen.getByTitle('Run now')).not.toBeDisabled();
  });
});
