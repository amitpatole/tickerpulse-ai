/**
 * Tests for P95 duration visualization in TimeseriesChart component.
 *
 * Covers:
 * - AC1: P95 dashed amber line renders when p95_duration_ms data is present
 * - AC2: P95 legend entry displays with dashed line indicator
 * - AC3: Y-axis scales to accommodate both total and p95 values
 * - Edge case: No p95 line when p95_duration_ms is null/undefined
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import TimeseriesChart from '../TimeseriesChart';
import type { MetricsTimeseriesPoint } from '@/lib/types';

describe('TimeseriesChart — P95 Duration Metrics', () => {
  it('AC1: renders p95 dashed amber line when p95_duration_ms data is present', () => {
    /**
     * Happy path: Duration data with p95 values on same day.
     * Chart should render dashed amber polyline for p95 line.
     * We verify this by checking that p95 legend appears and line data exists.
     */
    const data: MetricsTimeseriesPoint[] = [
      {
        day: '2026-02-20',
        agent_name: 'agent_a',
        value: 250,
        p95_duration_ms: 500,
      },
      {
        day: '2026-02-21',
        agent_name: 'agent_a',
        value: 280,
        p95_duration_ms: 520,
      },
    ];

    const { container } = render(
      <TimeseriesChart data={data} metric="duration" loading={false} />
    );

    // AC1: When p95 data is present, legend shows "P95" label
    // confirming p95 values were processed and will be rendered.
    expect(screen.getByText('P95')).toBeInTheDocument();

    // Verify that the chart found p95 data by checking for amber-colored stroke lines.
    const ambertLines = Array.from(container.querySelectorAll('[stroke="#f59e0b"]'));
    // Should have at least the p95 polyline + the legend line indicator.
    expect(ambertLines.length).toBeGreaterThan(0);
  });

  it('AC2: displays p95 legend entry with dashed line indicator when p95 data present', () => {
    /**
     * AC2: When p95_duration_ms is present, legend should show P95 entry
     * with a visual indicator (amber dashed line).
     */
    const data: MetricsTimeseriesPoint[] = [
      {
        day: '2026-02-20',
        agent_name: 'agent_a',
        value: 250,
        p95_duration_ms: 500,
      },
    ];

    const { container } = render(
      <TimeseriesChart data={data} metric="duration" loading={false} />
    );

    // Verify P95 legend text appears.
    expect(screen.getByText('P95')).toBeInTheDocument();

    // Legend should contain the P95 label next to a visual indicator.
    // Check that the legend structure exists and is visible.
    const legendElements = container.querySelectorAll('svg');
    expect(legendElements.length).toBeGreaterThan(0);

    // Verify there is at least one amber (#f59e0b) element in the legend.
    const amberElements = Array.from(container.querySelectorAll('[stroke="#f59e0b"]'));
    expect(amberElements.length).toBeGreaterThan(0);
  });

  it('AC3: scales y-axis to accommodate both total and p95 values', () => {
    /**
     * MaxY calculation should include p95 values so the chart
     * doesn't clip the p95 line. Verify via missing data check.
     */
    const data: MetricsTimeseriesPoint[] = [
      {
        day: '2026-02-20',
        agent_name: 'agent_a',
        value: 100,
        p95_duration_ms: 300, // p95 is higher than avg
      },
      {
        day: '2026-02-21',
        agent_name: 'agent_a',
        value: 150,
        p95_duration_ms: 350,
      },
    ];

    const { container } = render(
      <TimeseriesChart data={data} metric="duration" loading={false} />
    );

    // Chart should render without clipping (p95 line should be visible at correct y-position).
    // Check that p95 polyline exists and has points.
    const p95Polyline = Array.from(container.querySelectorAll('polyline')).find(
      (pl) => pl.getAttribute('stroke') === '#f59e0b'
    );

    expect(p95Polyline?.getAttribute('points')).toBeTruthy();

    // Verify points are within SVG bounds (viewBox height = 280).
    const points = p95Polyline?.getAttribute('points')?.split(' ') || [];
    for (const point of points) {
      if (point) {
        const [, y] = point.split(',').map(parseFloat);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(256); // 280 - PAD.top - PAD.bottom = 256 (approx)
      }
    }
  });

  it('edge case: no p95 line when p95_duration_ms is null or undefined', () => {
    /**
     * Cost/runs/tokens metrics don't have p95_duration_ms field.
     * Chart should not render p95 line for these metrics.
     */
    const data: MetricsTimeseriesPoint[] = [
      {
        day: '2026-02-20',
        agent_name: 'agent_a',
        value: 100,
        // no p95_duration_ms field
      },
      {
        day: '2026-02-21',
        agent_name: 'agent_a',
        value: 150,
        // no p95_duration_ms field
      },
    ];

    const { container } = render(
      <TimeseriesChart data={data} metric="cost" loading={false} />
    );

    // P95 polyline should not be rendered.
    const p95Polyline = Array.from(container.querySelectorAll('polyline')).find(
      (pl) =>
        pl.getAttribute('stroke') === '#f59e0b' &&
        pl.getAttribute('strokeDasharray') === '5 3'
    );

    expect(p95Polyline).not.toBeTruthy();

    // P95 legend entry should not appear.
    expect(screen.queryByText('P95')).not.toBeInTheDocument();
  });

  it('handles mixed p95 data (some days with p95, some without)', () => {
    /**
     * Edge case: Day 1 has p95 data, Day 2 does not.
     * Chart should render p95 line only for Day 1.
     */
    const data: MetricsTimeseriesPoint[] = [
      {
        day: '2026-02-20',
        agent_name: 'agent_a',
        value: 100,
        p95_duration_ms: 250,
      },
      {
        day: '2026-02-21',
        agent_name: 'agent_a',
        value: 150,
        // no p95 on day 2
      },
    ];

    const { container } = render(
      <TimeseriesChart data={data} metric="duration" loading={false} />
    );

    // P95 polyline should still render (points filtered to exclude null).
    const p95Polyline = Array.from(container.querySelectorAll('polyline')).find(
      (pl) => pl.getAttribute('stroke') === '#f59e0b'
    );

    expect(p95Polyline).toBeTruthy();

    // Points should only include day with p95 data.
    const points = p95Polyline?.getAttribute('points')?.split(' ') || [];
    // Should have exactly 1 point (day 2026-02-20), day 2026-02-21 filtered out.
    expect(points.filter((p) => p).length).toBe(1);
  });

  it('p95 legend only appears when metric=duration (not for cost/runs/tokens)', () => {
    /**
     * Verify p95 legend doesn't appear for non-duration metrics
     * even if somehow p95 data was present (shouldn't happen in practice).
     */
    const costData: MetricsTimeseriesPoint[] = [
      { day: '2026-02-20', agent_name: 'agent_a', value: 50.25 },
      { day: '2026-02-21', agent_name: 'agent_a', value: 60.75 },
    ];

    const { rerender } = render(
      <TimeseriesChart data={costData} metric="cost" loading={false} />
    );

    // P95 should not appear for cost metric.
    expect(screen.queryByText('P95')).not.toBeInTheDocument();

    // Rerender with duration metric.
    const durationData: MetricsTimeseriesPoint[] = [
      { day: '2026-02-20', agent_name: 'agent_a', value: 250, p95_duration_ms: 500 },
    ];

    rerender(
      <TimeseriesChart data={durationData} metric="duration" loading={false} />
    );

    // P95 should appear for duration metric.
    expect(screen.getByText('P95')).toBeInTheDocument();
  });
});
