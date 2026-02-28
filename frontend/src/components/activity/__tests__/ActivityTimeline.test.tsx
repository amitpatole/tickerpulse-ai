/**
 * Focused test suite for ActivityTimeline component — AC1-AC3 coverage.
 *
 * Tests verify:
 *   AC1: Component renders event timeline with type icons and status badges
 *   AC2: Relative time formatting (e.g., "2h ago") works correctly
 *   AC3: Loading and error states display appropriate UI
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ActivityEvent } from '@/lib/types';
import ActivityTimeline from '../ActivityTimeline';

// -----------------------------------------------------------------------
// AC1: Happy Path — Render events
// -----------------------------------------------------------------------

describe('ActivityTimeline - AC1: Render Events', () => {
  it('AC1: renders event timeline with all event types', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'DataFetcher',
        status: 'success',
        cost: 0.05,
        duration_ms: 1500,
        timestamp: now,
        summary: null,
      },
      {
        id: 'job_1',
        type: 'job',
        name: 'DailySync',
        status: 'completed',
        cost: 0.02,
        duration_ms: 3000,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        summary: 'Synced 150 records',
      },
      {
        id: 'error_1',
        type: 'error',
        name: 'StockAPI',
        status: 'critical',
        cost: 0.0,
        duration_ms: null,
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        summary: 'Rate limit exceeded',
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: All events are rendered
    expect(screen.getByText('DataFetcher')).toBeInTheDocument();
    expect(screen.getByText('DailySync')).toBeInTheDocument();
    expect(screen.getByText('StockAPI')).toBeInTheDocument();
  });

  it('AC1: renders cost and duration for agent/job events', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.0042,
        duration_ms: 2500,
        timestamp: now,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Cost and duration are formatted
    expect(screen.getByText(/\$0\.0042/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5s|2500ms/)).toBeInTheDocument();
  });

  it('AC1: renders summary for events that have it', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'job_1',
        type: 'job',
        name: 'DailySync',
        status: 'completed',
        cost: 0.02,
        duration_ms: 3000,
        timestamp: now,
        summary: 'Processed 150 records successfully',
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Summary is displayed
    expect(
      screen.getByText('Processed 150 records successfully')
    ).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// AC2: Relative Time Formatting
// -----------------------------------------------------------------------

describe('ActivityTimeline - AC2: Relative Time', () => {
  it('AC2: formats timestamps as "Xs ago" for recent events', () => {
    // Arrange: Event from 30 seconds ago
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.01,
        duration_ms: 1000,
        timestamp: thirtySecondsAgo,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Time is formatted as "XXs ago"
    expect(screen.getByText(/\d+s ago/)).toBeInTheDocument();
  });

  it('AC2: formats timestamps as "Xm ago" for events within an hour', () => {
    // Arrange: Event from 25 minutes ago
    const twentyFiveMinutesAgo = new Date(
      Date.now() - 25 * 60 * 1000
    ).toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.01,
        duration_ms: 1000,
        timestamp: twentyFiveMinutesAgo,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Time is formatted as "XXm ago"
    expect(screen.getByText(/\d+m ago/)).toBeInTheDocument();
  });

  it('AC2: formats timestamps as "Xh ago" for events within a day', () => {
    // Arrange: Event from 5 hours ago
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.01,
        duration_ms: 1000,
        timestamp: fiveHoursAgo,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Time is formatted as "Xh ago"
    expect(screen.getByText(/\d+h ago/)).toBeInTheDocument();
  });

  it('AC2: formats timestamps as "Xd ago" for older events', () => {
    // Arrange: Event from 3 days ago
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 3600 * 1000
    ).toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.01,
        duration_ms: 1000,
        timestamp: threeDaysAgo,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Time is formatted as "Xd ago"
    expect(screen.getByText(/\d+d ago/)).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// AC3: Loading and Error States
// -----------------------------------------------------------------------

describe('ActivityTimeline - AC3: Loading and Error States', () => {
  it('AC3: renders loading skeleton when loading=true', () => {
    // Act
    const { container } = render(
      <ActivityTimeline events={[]} loading={true} error={null} />
    );

    // Assert: Skeleton elements are present
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('AC3: renders error message when error is set', () => {
    // Arrange
    const errorMsg = 'Failed to load activity feed';

    // Act
    render(
      <ActivityTimeline
        events={[]}
        loading={false}
        error={errorMsg}
      />
    );

    // Assert: Error message is displayed
    expect(screen.getByText(new RegExp(errorMsg, 'i'))).toBeInTheDocument();
  });

  it('AC3: renders empty state when no events and not loading', () => {
    // Act
    render(
      <ActivityTimeline events={[]} loading={false} error={null} />
    );

    // Assert: Empty state message is shown
    expect(
      screen.getByText(/no activity|nothing to show|empty/i)
    ).toBeInTheDocument();
  });

  it('AC3: renders events when loading=false and error=null', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.01,
        duration_ms: 1000,
        timestamp: now,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Event is visible
    expect(screen.getByText('Analyst')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Edge Cases: Formatting
// -----------------------------------------------------------------------

describe('ActivityTimeline - Edge Cases', () => {
  it('displays "—" for null duration', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'error_1',
        type: 'error',
        name: 'API',
        status: 'error',
        cost: 0.0,
        duration_ms: null,
        timestamp: now,
        summary: 'Connection timeout',
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Null duration shows as dash
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays "—" for zero cost', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'error_1',
        type: 'error',
        name: 'API',
        status: 'error',
        cost: 0.0,
        duration_ms: 100,
        timestamp: now,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Zero cost shows as dash
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('displays "<$0.0001" for very small costs', () => {
    // Arrange
    const now = new Date().toISOString();
    const events: ActivityEvent[] = [
      {
        id: 'agent_1',
        type: 'agent',
        name: 'Analyst',
        status: 'success',
        cost: 0.00005,
        duration_ms: 100,
        timestamp: now,
        summary: null,
      },
    ];

    // Act
    render(
      <ActivityTimeline events={events} loading={false} error={null} />
    );

    // Assert: Very small cost shows special formatting
    expect(screen.getByText(/<\$0\.0001/)).toBeInTheDocument();
  });
});
