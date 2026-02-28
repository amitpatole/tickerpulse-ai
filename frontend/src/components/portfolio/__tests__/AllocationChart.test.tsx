/**
 * Test suite for AllocationChart component — SVG arc rendering, legend, and empty state.
 *
 * Focus: Empty/zero allocation handling, single vs multi-position arcs, legend accuracy.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AllocationChart from '../AllocationChart';
import type { PortfolioPosition } from '@/lib/types';


function makePos(id: number, ticker: string, allocationPct: number | null): PortfolioPosition {
  return {
    id,
    ticker,
    quantity: 100,
    avg_cost: 100.0,
    currency: 'USD',
    cost_basis: 10000.0,
    opened_at: '2026-01-01',
    allocation_pct: allocationPct,
  };
}

describe('AllocationChart', () => {
  /**
   * TEST: Empty state — no positions
   *
   * Given: Empty positions array
   * Expected: "No allocation data yet." message shown
   */
  it('shows empty state when no positions provided', () => {
    render(<AllocationChart positions={[]} />);
    expect(screen.getByText('No allocation data yet.')).toBeInTheDocument();
  });


  /**
   * TEST: Empty state — null allocation_pct
   *
   * Given: Position with null allocation_pct
   * Expected: falls through to empty state (null > 0 is false)
   */
  it('shows empty state when all positions have null allocation_pct', () => {
    render(<AllocationChart positions={[makePos(1, 'AAPL', null)]} />);
    expect(screen.getByText('No allocation data yet.')).toBeInTheDocument();
  });


  /**
   * TEST: Empty state — zero allocation_pct
   *
   * Given: Position with allocation_pct = 0
   * Expected: filtered out, empty state shown
   */
  it('shows empty state when all positions have zero allocation_pct', () => {
    render(<AllocationChart positions={[makePos(1, 'AAPL', 0)]} />);
    expect(screen.getByText('No allocation data yet.')).toBeInTheDocument();
  });


  /**
   * TEST: Accessible SVG role
   *
   * Given: Position with valid allocation
   * Expected: SVG renders with role="img" and descriptive aria-label
   */
  it('renders SVG donut chart with accessible role', () => {
    render(<AllocationChart positions={[makePos(1, 'AAPL', 100)]} />);
    expect(
      screen.getByRole('img', { name: /Portfolio allocation donut chart/ })
    ).toBeInTheDocument();
  });


  /**
   * TEST: Single 100% position — full circle element
   *
   * Given: One position at 100% allocation (360° sweep)
   * Expected: Segment rendered as <circle>, not <path> (avoids degenerate arc)
   */
  it('renders a circle element for a single full-circle position', () => {
    const { container } = render(
      <AllocationChart positions={[makePos(1, 'AAPL', 100)]} />
    );
    const circles = container.querySelectorAll('svg circle');
    const paths = container.querySelectorAll('svg path');

    // Background ring + segment circle = at least 2 circles
    expect(circles.length).toBeGreaterThanOrEqual(2);
    // Single 100% position uses circle, so no arc paths
    expect(paths.length).toBe(0);
  });


  /**
   * TEST: Multiple positions — arc path elements
   *
   * Given: Two positions (60% + 40%)
   * Expected: Two <path> arc elements (one per segment)
   */
  it('renders path elements for multiple partial-allocation positions', () => {
    const positions = [
      makePos(1, 'AAPL', 60),
      makePos(2, 'MSFT', 40),
    ];
    const { container } = render(<AllocationChart positions={positions} />);
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(2);
  });


  /**
   * TEST: Three positions — three arc paths
   *
   * Given: Three positions with different allocations
   * Expected: Three <path> elements
   */
  it('renders the correct number of paths for three positions', () => {
    const positions = [
      makePos(1, 'AAPL', 50),
      makePos(2, 'MSFT', 30),
      makePos(3, 'GOOGL', 20),
    ];
    const { container } = render(<AllocationChart positions={positions} />);
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(3);
  });


  /**
   * TEST: Legend ticker names
   *
   * Given: Three positions
   * Expected: Each ticker symbol appears in the legend
   */
  it('renders ticker name in legend for each segment', () => {
    const positions = [
      makePos(1, 'AAPL', 50),
      makePos(2, 'MSFT', 30),
      makePos(3, 'GOOGL', 20),
    ];
    render(<AllocationChart positions={positions} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('GOOGL')).toBeInTheDocument();
  });


  /**
   * TEST: Legend percentage values
   *
   * Given: Two positions (75% and 25%)
   * Expected: Legend shows "75.0%" and "25.0%" formatted to one decimal
   */
  it('shows allocation percentage in legend for each segment', () => {
    const positions = [
      makePos(1, 'AAPL', 75),
      makePos(2, 'MSFT', 25),
    ];
    render(<AllocationChart positions={positions} />);
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });


  /**
   * TEST: Centre label — plural "positions"
   *
   * Given: Two positions
   * Expected: Centre of donut shows "2" and "positions"
   */
  it('shows position count and plural label in the donut centre', () => {
    const positions = [
      makePos(1, 'AAPL', 50),
      makePos(2, 'TSLA', 50),
    ];
    render(<AllocationChart positions={positions} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('positions')).toBeInTheDocument();
  });


  /**
   * TEST: Centre label — singular "position"
   *
   * Given: One position
   * Expected: Centre of donut shows "1" and "position" (not "positions")
   */
  it('shows singular "position" label for a single segment', () => {
    render(<AllocationChart positions={[makePos(1, 'AAPL', 100)]} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('position')).toBeInTheDocument();
    expect(screen.queryByText('positions')).not.toBeInTheDocument();
  });


  /**
   * TEST: Mixed active and zero-allocation positions
   *
   * Given: One active (100%), one zero (0%), one null
   * Expected: Only the active ticker appears in legend
   */
  it('filters out zero and null allocation positions from legend', () => {
    const positions = [
      makePos(1, 'AAPL', 100),
      makePos(2, 'TSLA', 0),
      makePos(3, 'MSFT', null),
    ];
    render(<AllocationChart positions={positions} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.queryByText('TSLA')).not.toBeInTheDocument();
    expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
  });
});
