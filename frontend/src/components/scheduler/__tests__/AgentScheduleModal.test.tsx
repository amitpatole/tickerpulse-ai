import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentScheduleModal from '../AgentScheduleModal';
import type { AgentSchedule, ScheduledJob } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture every props object passed to AgentScheduleForm for assertions.
const captureFormProps = jest.fn();

jest.mock('@/components/scheduler/AgentScheduleForm', () => ({
  __esModule: true,
  default: (props: {
    open: boolean;
    schedule: AgentSchedule | null;
    agents: Array<{ job_id: string; name: string; description: string }>;
    onClose: () => void;
    onSave: (data: unknown) => Promise<void>;
  }) => {
    captureFormProps(props);
    if (!props.open) return null;
    return (
      <div data-testid="agent-schedule-form">
        <span data-testid="agents-count">{props.agents.length}</span>
        <span data-testid="first-agent-id">{props.agents[0]?.job_id ?? ''}</span>
        <button onClick={props.onClose}>MockClose</button>
        <button
          onClick={() =>
            props.onSave({
              job_id: 'test_job',
              label: 'Test Label',
              trigger: 'interval' as const,
              trigger_args: { seconds: 3600 },
            })
          }
        >
          MockSave
        </button>
      </div>
    );
  },
}));

// Control what useApi returns per test.
const mockUseApi = jest.fn();
jest.mock('@/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

// listKnownAgents only needs to exist as a stable reference; useApi is mocked.
jest.mock('@/lib/api', () => ({
  listKnownAgents: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SYSTEM_JOBS: ScheduledJob[] = [
  {
    id: 'price_refresh',
    name: 'Price Refresh',
    trigger: 'interval',
    trigger_args: { seconds: 300 },
    paused: false,
  },
  {
    id: 'earnings_sync',
    name: 'Earnings Sync',
    trigger: 'cron',
    trigger_args: { hour: 6, minute: 0 },
    paused: false,
  },
];

const KNOWN_AGENTS = [
  { job_id: 'morning_briefing', name: 'Morning Briefing', description: 'Pre-market summary' },
  { job_id: 'sentiment_monitor', name: 'Sentiment Monitor', description: 'StockTwits sentiment' },
];

const EXISTING_SCHEDULE: AgentSchedule = {
  id: 7,
  job_id: 'morning_briefing',
  label: 'Morning Briefing (custom)',
  trigger: 'interval',
  trigger_args: { seconds: 1800 },
  enabled: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultUseApiReturn(data: unknown = null) {
  return { data, loading: false, error: null, refetch: jest.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentScheduleModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseApi.mockReturnValue(defaultUseApiReturn(null));
  });

  // ---- Visibility ----

  it('does not render the form when open=false', () => {
    render(
      <AgentScheduleModal
        open={false}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );
    expect(screen.queryByTestId('agent-schedule-form')).not.toBeInTheDocument();
  });

  it('renders the form when open=true', () => {
    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );
    expect(screen.getByTestId('agent-schedule-form')).toBeInTheDocument();
  });

  // ---- Agent resolution — knownAgents path ----

  it('passes knownAgents to form when API returns a non-empty list', () => {
    mockUseApi.mockReturnValue(defaultUseApiReturn(KNOWN_AGENTS));

    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(screen.getByTestId('agents-count')).toHaveTextContent('2');
    expect(screen.getByTestId('first-agent-id')).toHaveTextContent('morning_briefing');
  });

  it('ignores systemJobs when knownAgents is non-empty', () => {
    mockUseApi.mockReturnValue(defaultUseApiReturn(KNOWN_AGENTS));

    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    // KNOWN_AGENTS has 2 items; SYSTEM_JOBS also has 2 but different ids
    const firstId = screen.getByTestId('first-agent-id').textContent;
    expect(firstId).toBe('morning_briefing'); // from knownAgents, not systemJobs
  });

  // ---- Agent resolution — systemJobs fallback ----

  it('falls back to systemJobs when knownAgents is null (fetch pending)', () => {
    mockUseApi.mockReturnValue(defaultUseApiReturn(null));

    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(screen.getByTestId('agents-count')).toHaveTextContent('2');
    expect(screen.getByTestId('first-agent-id')).toHaveTextContent('price_refresh');
  });

  it('falls back to systemJobs when knownAgents is an empty array', () => {
    mockUseApi.mockReturnValue(defaultUseApiReturn([]));

    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(screen.getByTestId('agents-count')).toHaveTextContent('2');
    expect(screen.getByTestId('first-agent-id')).toHaveTextContent('price_refresh');
  });

  it('maps systemJob to KnownAgent shape — uses id as job_id, name as name, empty description', () => {
    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    const passedProps = captureFormProps.mock.calls[0][0];
    expect(passedProps.agents[0]).toEqual({
      job_id: 'price_refresh',
      name: 'Price Refresh',
      description: '',
    });
    expect(passedProps.agents[1]).toEqual({
      job_id: 'earnings_sync',
      name: 'Earnings Sync',
      description: '',
    });
  });

  it('passes empty agents when both knownAgents and systemJobs are empty', () => {
    mockUseApi.mockReturnValue(defaultUseApiReturn([]));

    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={[]}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(screen.getByTestId('agents-count')).toHaveTextContent('0');
  });

  // ---- Prop forwarding ----

  it('forwards null schedule to AgentScheduleForm (create mode)', () => {
    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    const passedProps = captureFormProps.mock.calls[0][0];
    expect(passedProps.schedule).toBeNull();
  });

  it('forwards existing schedule to AgentScheduleForm (edit mode)', () => {
    render(
      <AgentScheduleModal
        open={true}
        schedule={EXISTING_SCHEDULE}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    const passedProps = captureFormProps.mock.calls[0][0];
    expect(passedProps.schedule).toBe(EXISTING_SCHEDULE);
  });

  it('calls onClose when the form triggers close', () => {
    const onClose = jest.fn();
    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={onClose}
        onSave={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('MockClose'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSave with forwarded payload when form triggers save', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('MockSave'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        job_id: 'test_job',
        label: 'Test Label',
        trigger: 'interval',
        trigger_args: { seconds: 3600 },
      });
    });
  });

  // ---- useApi options ----

  it('calls useApi with enabled=false when open=false — skips agent fetch', () => {
    render(
      <AgentScheduleModal
        open={false}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(mockUseApi).toHaveBeenCalledWith(
      expect.any(Function),
      [],
      expect.objectContaining({ enabled: false })
    );
  });

  it('calls useApi with enabled=true when open=true — triggers agent fetch', () => {
    render(
      <AgentScheduleModal
        open={true}
        schedule={null}
        systemJobs={SYSTEM_JOBS}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
    );

    expect(mockUseApi).toHaveBeenCalledWith(
      expect.any(Function),
      [],
      expect.objectContaining({ enabled: true })
    );
  });
});
