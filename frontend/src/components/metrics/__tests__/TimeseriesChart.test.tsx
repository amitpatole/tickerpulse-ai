import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimeseriesChart from '../TimeseriesChart';
import type { MetricsTimeseriesPoint } from '@/lib/types';

function pt(day: string, agent: string, value: number, p95?: number): MetricsTimeseriesPoint {
  return { day, agent_name: agent, value, ...(p95 != null ? { p95_duration_ms: p95 } : {}) };
}

const SINGLE_AGENT_DATA: MetricsTimeseriesPoint[] = [
  pt('2026-02-20', 'agent_a', 10),
  pt('2026-02-21', 'agent_a', 20),
  pt('2026-02-22', 'agent_a', 15),
];

const TWO_AGENT_DATA: MetricsTimeseriesPoint[] = [
  pt('2026-02-20', 'agent_a', 10),
  pt('2026-02-20', 'agent_b', 5),
  pt('2026-02-21', 'agent_a', 20),
  pt('2026-02-21', 'agent_b', 8),
];

describe('TimeseriesChart', () => {
  describe('Loading State', () => {
    it('renders pulse skeleton while loading', () => {
      render(<TimeseriesChart data={[]} metric="cost" loading={true} />);

      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('does not render SVG while loading', () => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric="cost" loading={true} />);

      expect(document.querySelector('svg')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows "No data for selected period" when data is empty', () => {
      render(<TimeseriesChart data={[]} metric="cost" loading={false} />);

      expect(screen.getByText('No data for selected period')).toBeInTheDocument();
    });

    it('does not render SVG when data is empty', () => {
      render(<TimeseriesChart data={[]} metric="runs" loading={false} />);

      expect(document.querySelector('svg')).not.toBeInTheDocument();
    });
  });

  describe('Chart Rendering', () => {
    it('renders an SVG element when data is present', () => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric="cost" loading={false} />);

      expect(document.querySelector('svg')).toBeInTheDocument();
    });

    it('sets aria-label on the SVG including metric name', () => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric="cost" loading={false} />);

      expect(document.querySelector('svg[aria-label*="cost"]')).toBeInTheDocument();
    });

    it('renders the total aggregate polyline in blue (#3b82f6)', () => {
      const { container } = render(
        <TimeseriesChart data={SINGLE_AGENT_DATA} metric="runs" loading={false} />
      );

      const bluePolyline = Array.from(container.querySelectorAll('polyline')).find(
        (el) => el.getAttribute('stroke') === '#3b82f6'
      );
      expect(bluePolyline).toBeInTheDocument();
    });

    it('renders a filled blue circle for each data day', () => {
      const { container } = render(
        <TimeseriesChart data={SINGLE_AGENT_DATA} metric="runs" loading={false} />
      );

      // 3 days → 3 blue circles on the total line
      const circles = Array.from(container.querySelectorAll('circle')).filter(
        (el) => el.getAttribute('fill') === '#3b82f6'
      );
      expect(circles.length).toBe(3);
    });

    it('renders X-axis date labels in MM-DD format', () => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric="cost" loading={false} />);

      // Last day label is always rendered
      expect(screen.getByText('02-22')).toBeInTheDocument();
    });

    it('renders Y-axis grid lines (Y_TICKS + 1 = 5)', () => {
      const { container } = render(
        <TimeseriesChart data={SINGLE_AGENT_DATA} metric="runs" loading={false} />
      );

      const gridLines = Array.from(container.querySelectorAll('line')).filter(
        (el) => el.getAttribute('stroke') === '#1e293b'
      );
      expect(gridLines.length).toBe(5);
    });
  });

  describe('Metric Labels', () => {
    test.each([
      ['cost', 'Daily Cost ($)'],
      ['runs', 'Daily Run Count'],
      ['duration', 'Avg Duration (ms)'],
      ['tokens', 'Daily Token Usage'],
    ])('metric="%s" shows label "%s"', (metric, expectedLabel) => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric={metric} loading={false} />);
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });

    it('falls back to the raw metric string for an unrecognised metric', () => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric="mystery_metric" loading={false} />);
      expect(screen.getByText('mystery_metric')).toBeInTheDocument();
    });
  });

  describe('Single Agent', () => {
    it('does not render a per-agent legend entry for a single agent', () => {
      render(<TimeseriesChart data={SINGLE_AGENT_DATA} metric="cost" loading={false} />);

      // With one agent there is no legend (no "Total" label and no agent name)
      expect(screen.queryByText('agent_a')).not.toBeInTheDocument();
      expect(screen.queryByText('Total')).not.toBeInTheDocument();
    });

    it('renders only the total polyline (no per-agent polylines) for a single agent', () => {
      const { container } = render(
        <TimeseriesChart data={SINGLE_AGENT_DATA} metric="cost" loading={false} />
      );

      // Only the blue total polyline — no per-agent lines
      const polylines = container.querySelectorAll('polyline');
      expect(polylines.length).toBe(1);
    });
  });

  describe('Multiple Agents', () => {
    it('renders per-agent polylines in addition to the total line', () => {
      const { container } = render(
        <TimeseriesChart data={TWO_AGENT_DATA} metric="cost" loading={false} />
      );

      // 2 per-agent lines + 1 total line = 3
      const polylines = container.querySelectorAll('polyline');
      expect(polylines.length).toBeGreaterThanOrEqual(3);
    });

    it('shows a "Total" legend entry', () => {
      render(<TimeseriesChart data={TWO_AGENT_DATA} metric="runs" loading={false} />);

      expect(screen.getByText('Total')).toBeInTheDocument();
    });

    it('shows each agent name in the legend', () => {
      render(<TimeseriesChart data={TWO_AGENT_DATA} metric="runs" loading={false} />);

      expect(screen.getByText('agent_a')).toBeInTheDocument();
      expect(screen.getByText('agent_b')).toBeInTheDocument();
    });
  });

  describe('Single-day edge case', () => {
    it('renders correctly when only one day of data exists', () => {
      const singleDay = [pt('2026-02-28', 'agent_a', 42)];
      render(<TimeseriesChart data={singleDay} metric="cost" loading={false} />);

      expect(document.querySelector('svg')).toBeInTheDocument();
      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(1);
    });
  });
});
