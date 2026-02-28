/**
 * SystemPanel Component Tests
 * Covers: db_pool_in_use rendering, Sparkline chart visualization, latency table
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SystemPanel from '../SystemPanel';
import type { SystemMetricsResponse, SystemMetricsSnapshot } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Happy path - renders db_pool_in_use and db_pool_idle with latest snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe('SystemPanel - DB Pool Rendering', () => {
  it('should render db_pool_in_use field (not db_pool_active) with latest snapshot data', () => {
    const mockData: SystemMetricsResponse = {
      snapshots: [
        {
          recorded_at: '2026-02-28T10:00:00',
          cpu_pct: 25,
          mem_pct: 45,
          db_pool_in_use: 3,
          db_pool_idle: 7,
        },
      ],
      endpoints: [],
    };

    render(<SystemPanel data={mockData} loading={false} error={null} />);

    // AC1: DB pool fields render with correct values
    expect(screen.getByText('DB Active')).toBeInTheDocument();
    expect(screen.getByText('DB Idle')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // db_pool_in_use
    expect(screen.getByText('7')).toBeInTheDocument(); // db_pool_idle
  });

  it('should show dashes when no snapshots available', () => {
    const mockData: SystemMetricsResponse = {
      snapshots: [],
      endpoints: [],
    };

    render(<SystemPanel data={mockData} loading={false} error={null} />);

    // AC2: Edge case - empty snapshots show dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Sparkline edge case - shows placeholder when <2 snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe('SystemPanel - Sparkline Placeholder', () => {
  it('should render "Collecting snapshots" message when fewer than 2 snapshots', () => {
    const mockData: SystemMetricsResponse = {
      snapshots: [
        {
          recorded_at: '2026-02-28T10:00:00',
          cpu_pct: 20,
          mem_pct: 40,
          db_pool_in_use: 2,
          db_pool_idle: 8,
        },
      ],
      endpoints: [],
    };

    render(<SystemPanel data={mockData} loading={false} error={null} />);

    // AC3: Placeholder shows during initial data collection
    expect(screen.getByText(/Collecting snapshots/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Sparkline happy path - renders SVG chart with 2+ snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe('SystemPanel - Sparkline Chart', () => {
  it('should render SVG sparkline when 2 or more snapshots available', () => {
    const mockData: SystemMetricsResponse = {
      snapshots: [
        {
          recorded_at: '2026-02-28T10:00:00',
          cpu_pct: 20,
          mem_pct: 40,
          db_pool_in_use: 2,
          db_pool_idle: 8,
        },
        {
          recorded_at: '2026-02-28T10:05:00',
          cpu_pct: 35,
          mem_pct: 55,
          db_pool_in_use: 4,
          db_pool_idle: 6,
        },
      ],
      endpoints: [],
    };

    render(<SystemPanel data={mockData} loading={false} error={null} />);

    // AC4: Sparkline renders as SVG with aria-label
    const sparkline = screen.getByLabelText(/CPU and memory sparkline/i);
    expect(sparkline).toBeInTheDocument();
    expect(sparkline.tagName).toBe('svg');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Loading and error states
// ─────────────────────────────────────────────────────────────────────────────

describe('SystemPanel - States', () => {
  it('should render loading skeleton when loading=true', () => {
    render(<SystemPanel data={null} loading={true} error={null} />);

    // AC5: Loading state shows animated skeleton
    const skeletons = screen.getAllByRole('generic').filter((el) =>
      el.className.includes('animate-pulse')
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render error message when error prop provided', () => {
    const errorMsg = 'Failed to load system metrics';
    render(<SystemPanel data={null} loading={false} error={errorMsg} />);

    // AC6: Error state displays message
    expect(screen.getByText(errorMsg)).toBeInTheDocument();
  });

  it('should render nothing when data is null and not loading/error', () => {
    const { container } = render(<SystemPanel data={null} loading={false} error={null} />);

    // Component returns null, so container should be empty
    expect(container.firstChild).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: API endpoint latency table rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('SystemPanel - Latency Table', () => {
  it('should render latency table with endpoint data', () => {
    const mockData: SystemMetricsResponse = {
      snapshots: [
        {
          recorded_at: '2026-02-28T10:00:00',
          cpu_pct: 25,
          mem_pct: 45,
          db_pool_in_use: 3,
          db_pool_idle: 7,
        },
      ],
      endpoints: [
        {
          endpoint: '/api/health',
          method: 'GET',
          call_count: 150,
          p95_ms: 5.0,
          avg_ms: 2.5,
          status_class: '2xx',
        },
        {
          endpoint: '/api/stocks',
          method: 'GET',
          call_count: 42,
          p95_ms: 150.0,
          avg_ms: 95.3,
          status_class: '2xx',
        },
      ],
    };

    render(<SystemPanel data={mockData} loading={false} error={null} />);

    // AC7: Table shows endpoint rows with latency data
    expect(screen.getByText('/api/health')).toBeInTheDocument();
    expect(screen.getByText('/api/stocks')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument(); // call_count for /api/stocks
    expect(screen.getByText('5.0')).toBeInTheDocument(); // p95_ms with .0 formatting
  });

  it('should show "No API endpoints recorded" when endpoints array is empty', () => {
    const mockData: SystemMetricsResponse = {
      snapshots: [
        {
          recorded_at: '2026-02-28T10:00:00',
          cpu_pct: 25,
          mem_pct: 45,
          db_pool_in_use: 3,
          db_pool_idle: 7,
        },
      ],
      endpoints: [],
    };

    render(<SystemPanel data={mockData} loading={false} error={null} />);

    // AC8: Empty endpoints state
    expect(screen.getByText('No API endpoints recorded')).toBeInTheDocument();
  });
});
