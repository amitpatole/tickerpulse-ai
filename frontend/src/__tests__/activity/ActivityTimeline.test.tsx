import { render, screen } from '@testing-library/react';
import ActivityTimeline from '@/components/activity/ActivityTimeline';
import type { ActivityEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'agent_1',
    type: 'agent',
    name: 'market_analyst',
    status: 'success',
    cost: 0.0012,
    duration_ms: 1500,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
    summary: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActivityTimeline', () => {
  it('renders events with name and relative time', () => {
    render(
      <ActivityTimeline
        events={[makeEvent()]}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText('market_analyst')).toBeInTheDocument();
  });

  it('renders a summary when provided', () => {
    render(
      <ActivityTimeline
        events={[makeEvent({ summary: 'Completed analysis run' })]}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText('Completed analysis run')).toBeInTheDocument();
  });

  it('shows skeleton rows while loading', () => {
    const { container } = render(
      <ActivityTimeline events={[]} loading={true} error={null} />,
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when events array is empty', () => {
    render(
      <ActivityTimeline events={[]} loading={false} error={null} />,
    );
    expect(screen.getByText('No activity in this period')).toBeInTheDocument();
  });

  it('shows error state when error is provided', () => {
    render(
      <ActivityTimeline events={[]} loading={false} error="Network error" />,
    );
    expect(screen.getByText('Failed to load activity')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders multiple events', () => {
    const events = [
      makeEvent({ id: 'agent_1', name: 'analyst' }),
      makeEvent({ id: 'job_1',   name: 'Price Refresh', type: 'job' }),
      makeEvent({ id: 'error_1', name: 'api_gateway',   type: 'error', status: 'critical' }),
    ];
    render(<ActivityTimeline events={events} loading={false} error={null} />);
    expect(screen.getByText('analyst')).toBeInTheDocument();
    expect(screen.getByText('Price Refresh')).toBeInTheDocument();
    expect(screen.getByText('api_gateway')).toBeInTheDocument();
  });

  it('shows zero-cost events without a dollar sign', () => {
    render(
      <ActivityTimeline
        events={[makeEvent({ cost: 0, type: 'job' })]}
        loading={false}
        error={null}
      />,
    );
    // cost display should show '—' for zero
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays status badge text', () => {
    render(
      <ActivityTimeline
        events={[makeEvent({ status: 'error' })]}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText('error')).toBeInTheDocument();
  });
});
