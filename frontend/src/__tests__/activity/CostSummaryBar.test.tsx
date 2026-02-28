import { render, screen, fireEvent } from '@testing-library/react';
import CostSummaryBar from '@/components/activity/CostSummaryBar';
import type { DailyCost } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDay(daysAgo: number, cost: number, runs: number): DailyCost {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    date: d.toISOString().split('T')[0],
    total_cost: cost,
    run_count: runs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CostSummaryBar', () => {
  it('renders without error for empty daily costs', () => {
    render(<CostSummaryBar dailyCosts={[]} days={7} />);
    expect(screen.getByText('Daily Costs')).toBeInTheDocument();
  });

  it('shows "Last 7 days" label when days=7', () => {
    render(<CostSummaryBar dailyCosts={[]} days={7} />);
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });

  it('caps display at 7 bars even when days=30', () => {
    const { container } = render(<CostSummaryBar dailyCosts={[]} days={30} />);
    // 7 bar divs
    const bars = container.querySelectorAll('.flex-1');
    expect(bars.length).toBeLessThanOrEqual(7);
  });

  it('renders date range labels', () => {
    const costs = [makeDay(6, 0.01, 3), makeDay(0, 0.02, 5)];
    render(<CostSummaryBar dailyCosts={costs} days={7} />);
    // MM-DD format dates appear at the bottom
    const { container } = render(<CostSummaryBar dailyCosts={costs} days={7} />);
    const labels = container.querySelectorAll('.text-\\[10px\\]');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('shows tooltip on hover with cost and run count', () => {
    const today = makeDay(0, 0.0025, 4);
    const { container } = render(<CostSummaryBar dailyCosts={[today]} days={1} />);
    const bar = container.querySelector('.group');
    expect(bar).toBeTruthy();
    fireEvent.mouseEnter(bar!);
    expect(screen.getByText('$0.0025')).toBeInTheDocument();
    expect(screen.getByText('4 runs')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    const today = makeDay(0, 0.001, 2);
    const { container } = render(<CostSummaryBar dailyCosts={[today]} days={1} />);
    const bar = container.querySelector('.group');
    fireEvent.mouseEnter(bar!);
    fireEvent.mouseLeave(bar!);
    expect(screen.queryByText('$0.0010')).not.toBeInTheDocument();
  });

  it('shows singular "run" for a single run', () => {
    const today = makeDay(0, 0.001, 1);
    const { container } = render(<CostSummaryBar dailyCosts={[today]} days={1} />);
    const bar = container.querySelector('.group');
    fireEvent.mouseEnter(bar!);
    expect(screen.getByText('1 run')).toBeInTheDocument();
  });
});
