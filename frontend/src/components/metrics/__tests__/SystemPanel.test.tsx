import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SystemPanel from '../SystemPanel';

// Type definitions for system metrics (AC1-AC5 from design spec)
interface ApiEndpointMetric {
  endpoint: string;
  method: string;
  status_class: '2xx' | '4xx' | '5xx';
  call_count: number;
  p95_ms: number;
  avg_ms: number;
  last_seen: string;
}

interface SystemMetricsSnapshot {
  cpu_pct: number;
  mem_pct: number;
  db_pool_active: number;
  db_pool_idle: number;
  recorded_at: string;
}

interface SystemMetricsResponse {
  period_days: number;
  snapshots: SystemMetricsSnapshot[];
  endpoints: ApiEndpointMetric[];
}

// Helper factory to create test system metrics data
function createSystemMetrics(overrides?: Partial<SystemMetricsResponse>): SystemMetricsResponse {
  return {
    period_days: 7,
    snapshots: [
      {
        cpu_pct: 45.5,
        mem_pct: 62.3,
        db_pool_active: 5,
        db_pool_idle: 3,
        recorded_at: '2024-02-28T10:00:00',
      },
      {
        cpu_pct: 52.1,
        mem_pct: 65.8,
        db_pool_active: 7,
        db_pool_idle: 1,
        recorded_at: '2024-02-28T11:00:00',
      },
    ],
    endpoints: [
      {
        endpoint: '/api/stocks',
        method: 'GET',
        status_class: '2xx',
        call_count: 150,
        p95_ms: 250.5,
        avg_ms: 150.3,
        last_seen: '2024-02-28',
      },
      {
        endpoint: '/api/news',
        method: 'GET',
        status_class: '2xx',
        call_count: 80,
        p95_ms: 500.2,
        avg_ms: 350.1,
        last_seen: '2024-02-28',
      },
      {
        endpoint: '/api/chat',
        method: 'POST',
        status_class: '5xx',
        call_count: 5,
        p95_ms: 5000.0,
        avg_ms: 4500.0,
        last_seen: '2024-02-27',
      },
    ],
    ...overrides,
  } as SystemMetricsResponse;
}

describe('SystemPanel', () => {
  describe('Loading State (AC1: Skeleton placeholders)', () => {
    it('renders CPU and memory gauge skeletons while loading', () => {
      render(<SystemPanel data={null} loading={true} error={null} />);

      // Should render skeleton placeholders for gauges
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);

      // Should NOT render gauge values while loading
      expect(screen.queryByText('CPU')).not.toBeInTheDocument();
      expect(screen.queryByText('Memory')).not.toBeInTheDocument();
    });

    it('does not render endpoint table while loading', () => {
      render(<SystemPanel data={null} loading={true} error={null} />);

      expect(screen.queryByText('/api/stocks')).not.toBeInTheDocument();
      expect(screen.queryByText('GET')).not.toBeInTheDocument();
    });
  });

  describe('Happy Path: System Metrics Rendered (AC2-AC3)', () => {
    it('renders CPU and memory gauges with values and pool counters', () => {
      const metrics = createSystemMetrics();
      render(<SystemPanel data={metrics} loading={false} error={null} />);

      // Verify gauge labels and latest values
      expect(screen.getByText('CPU')).toBeInTheDocument();
      expect(screen.getByText('Memory')).toBeInTheDocument();

      // Latest snapshot values: 52.1% CPU, 65.8% memory
      expect(screen.getByText(/52\.1/)).toBeInTheDocument();
      expect(screen.getByText(/65\.8/)).toBeInTheDocument();

      // DB pool counters from latest snapshot: 7 active, 1 idle
      expect(screen.getByText('7')).toBeInTheDocument(); // active
      expect(screen.getByText('1')).toBeInTheDocument(); // idle
    });

    it('renders endpoint latency table with all rows', () => {
      const metrics = createSystemMetrics();
      render(<SystemPanel data={metrics} loading={false} error={null} />);

      // Verify table headers
      expect(screen.getByText('Endpoint')).toBeInTheDocument();
      expect(screen.getByText('Method')).toBeInTheDocument();
      expect(screen.getByText('Calls')).toBeInTheDocument();

      // Verify all three endpoint rows are present
      expect(screen.getByText('/api/stocks')).toBeInTheDocument();
      expect(screen.getByText('/api/news')).toBeInTheDocument();
      expect(screen.getByText('/api/chat')).toBeInTheDocument();

      // Verify call counts
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('displays latency values (P95 and average) in milliseconds', () => {
      const metrics = createSystemMetrics();
      render(<SystemPanel data={metrics} loading={false} error={null} />);

      // Verify P95 latencies
      expect(screen.getByText(/250\.5/)).toBeInTheDocument(); // /api/stocks P95
      expect(screen.getByText(/500\.2/)).toBeInTheDocument(); // /api/news P95
      expect(screen.getByText(/5000\.0/)).toBeInTheDocument(); // /api/chat P95

      // Verify average latencies
      expect(screen.getByText(/150\.3/)).toBeInTheDocument(); // /api/stocks avg
      expect(screen.getByText(/350\.1/)).toBeInTheDocument(); // /api/news avg
      expect(screen.getByText(/4500\.0/)).toBeInTheDocument(); // /api/chat avg
    });
  });

  describe('Edge Cases: Empty Data & Boundaries (AC4)', () => {
    it('renders gauge cards but with no endpoint rows when endpoints list is empty', () => {
      const metrics = createSystemMetrics({ endpoints: [] });
      render(<SystemPanel data={metrics} loading={false} error={null} />);

      // Gauges should still render
      expect(screen.getByText('CPU')).toBeInTheDocument();
      expect(screen.getByText('Memory')).toBeInTheDocument();

      // Endpoint table should show empty state
      expect(screen.getByText('No API endpoints recorded')).toBeInTheDocument();
      expect(screen.queryByText('/api/stocks')).not.toBeInTheDocument();
    });

    it('handles large latency values with proper formatting', () => {
      const metrics = createSystemMetrics({
        endpoints: [
          {
            endpoint: '/api/expensive',
            method: 'POST',
            status_class: '2xx',
            call_count: 10,
            p95_ms: 15000.75, // 15+ seconds
            avg_ms: 12000.25,
            last_seen: '2024-02-28',
          },
        ],
      });
      render(<SystemPanel data={metrics} loading={false} error={null} />);

      // Large values should still display correctly
      expect(screen.getByText('/api/expensive')).toBeInTheDocument();
      expect(screen.getByText(/15000\.75/)).toBeInTheDocument();
      expect(screen.getByText(/12000\.25/)).toBeInTheDocument();
    });

    it('renders null/zero latency values without errors', () => {
      const metrics = createSystemMetrics({
        endpoints: [
          {
            endpoint: '/api/test',
            method: 'GET',
            status_class: '2xx',
            call_count: 1,
            p95_ms: 0.0,
            avg_ms: 0.0,
            last_seen: '2024-02-28',
          },
        ],
      });
      render(<SystemPanel data={metrics} loading={false} error={null} />);

      expect(screen.getByText('/api/test')).toBeInTheDocument();
      expect(screen.getByText('0.0')).toBeInTheDocument();
    });
  });

  describe('Status Badge Colors (AC5: 2xx/4xx/5xx)', () => {
    it('renders 2xx status badges in green', () => {
      const metrics = createSystemMetrics({
        endpoints: [
          {
            endpoint: '/api/stocks',
            method: 'GET',
            status_class: '2xx',
            call_count: 100,
            p95_ms: 200.0,
            avg_ms: 100.0,
            last_seen: '2024-02-28',
          },
        ],
      });
      const { container } = render(<SystemPanel data={metrics} loading={false} error={null} />);

      const badge = container.querySelector('[class*="bg-emerald"]') ||
                   container.querySelector('[class*="bg-green"]') ||
                   container.querySelector('[class*="emerald"]');
      expect(badge).toBeInTheDocument();
    });

    it('renders 4xx status badges in amber/yellow', () => {
      const metrics = createSystemMetrics({
        endpoints: [
          {
            endpoint: '/api/invalid',
            method: 'POST',
            status_class: '4xx',
            call_count: 20,
            p95_ms: 300.0,
            avg_ms: 200.0,
            last_seen: '2024-02-28',
          },
        ],
      });
      const { container } = render(<SystemPanel data={metrics} loading={false} error={null} />);

      const badge = container.querySelector('[class*="bg-amber"]') ||
                   container.querySelector('[class*="bg-yellow"]') ||
                   container.querySelector('[class*="amber"]');
      expect(badge).toBeInTheDocument();
    });

    it('renders 5xx status badges in red', () => {
      const metrics = createSystemMetrics({
        endpoints: [
          {
            endpoint: '/api/broken',
            method: 'GET',
            status_class: '5xx',
            call_count: 5,
            p95_ms: 5000.0,
            avg_ms: 4000.0,
            last_seen: '2024-02-28',
          },
        ],
      });
      const { container } = render(<SystemPanel data={metrics} loading={false} error={null} />);

      const badge = container.querySelector('[class*="bg-red"]') ||
                   container.querySelector('[class*="red"]');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error message when API fails', () => {
      render(
        <SystemPanel
          data={null}
          loading={false}
          error="Failed to load system metrics"
        />
      );

      expect(screen.getByText('Failed to load system metrics')).toBeInTheDocument();
      expect(screen.queryByText('CPU')).not.toBeInTheDocument();
    });
  });
});
