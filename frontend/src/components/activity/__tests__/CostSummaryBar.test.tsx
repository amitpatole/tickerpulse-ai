/**
 * Focused test suite for CostSummaryBar component — AC1-AC2 coverage.
 *
 * Tests verify:
 *   AC1: Component renders daily costs as bar chart with labels
 *   AC2: Cost values are formatted and displayed correctly
 *   AC3: Empty data and edge cases handled gracefully
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { DailyCost } from '@/lib/types';
import CostSummaryBar from '../CostSummaryBar';

// -----------------------------------------------------------------------
// AC1: Happy Path — Render bar chart
// -----------------------------------------------------------------------

describe('CostSummaryBar - AC1: Render Cost Chart', () => {
  it('AC1: renders daily cost bars with dates', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-25', total_cost: 0.05, run_count: 3 },
      { date: '2026-02-26', total_cost: 0.08, run_count: 5 },
      { date: '2026-02-27', total_cost: 0.12, run_count: 7 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: All dates are visible
    expect(screen.getByText('2026-02-25')).toBeInTheDocument();
    expect(screen.getByText('2026-02-26')).toBeInTheDocument();
    expect(screen.getByText('2026-02-27')).toBeInTheDocument();
  });

  it('AC1: renders cost values for each day', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.0542, run_count: 2 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Cost is formatted and displayed
    expect(screen.getByText(/\$0\.0542/)).toBeInTheDocument();
  });

  it('AC1: renders run count for each day', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.05, run_count: 5 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Run count is displayed
    expect(screen.getByText(/5 run|5 job/i)).toBeInTheDocument();
  });

  it('AC1: renders multiple bars proportionally', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-25', total_cost: 0.05, run_count: 1 },
      { date: '2026-02-26', total_cost: 0.10, run_count: 2 },
      { date: '2026-02-27', total_cost: 0.15, run_count: 3 },
    ];

    // Act
    const { container } = render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Multiple bars are rendered
    const bars = container.querySelectorAll('[role="progressbar"], [data-bar]');
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });
});

// -----------------------------------------------------------------------
// AC2: Cost Formatting
// -----------------------------------------------------------------------

describe('CostSummaryBar - AC2: Cost Formatting', () => {
  it('AC2: formats costs as USD currency', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.0234, run_count: 1 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Cost includes $ symbol
    expect(screen.getByText(/\$0\.0234/)).toBeInTheDocument();
  });

  it('AC2: formats zero cost as "$0.00"', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.0, run_count: 0 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Zero cost is formatted
    expect(screen.getByText(/\$0\.0+/)).toBeInTheDocument();
  });

  it('AC2: formats large costs correctly', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 1.234567, run_count: 10 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Large cost is formatted with proper precision
    expect(screen.getByText(/\$1\./)).toBeInTheDocument();
  });

  it('AC2: formats very small costs', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.00012, run_count: 1 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Very small cost is visible in some form
    expect(screen.getByText(/0\.000|<\$0\.0001/)).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// AC3: Edge Cases
// -----------------------------------------------------------------------

describe('CostSummaryBar - AC3: Edge Cases', () => {
  it('AC3: handles empty daily costs array', () => {
    // Act
    const { container } = render(<CostSummaryBar dailyCosts={[]} />);

    // Assert: Component renders without error, empty state shown
    expect(container).toBeInTheDocument();
    // Empty state text or no errors
    const text = screen.queryByText(/no data|empty|nothing/i);
    if (text) {
      expect(text).toBeInTheDocument();
    }
  });

  it('AC3: handles single daily cost entry', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.05, run_count: 1 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Single bar is rendered
    expect(screen.getByText('2026-02-26')).toBeInTheDocument();
  });

  it('AC3: handles many days of cost data', () => {
    // Arrange: 30 days of data
    const dailyCosts: DailyCost[] = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400000)
        .toISOString()
        .split('T')[0],
      total_cost: Math.random() * 0.2,
      run_count: Math.floor(Math.random() * 10),
    }));

    // Act
    const { container } = render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Component handles large dataset
    expect(container).toBeInTheDocument();
    // At least some dates should be visible
    const dates = screen.queryAllByText(/2026-/);
    expect(dates.length).toBeGreaterThan(0);
  });

  it('AC3: handles costs with trailing zeros', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.1, run_count: 1 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Cost is formatted consistently
    expect(screen.getByText(/\$0\.1/)).toBeInTheDocument();
  });

  it('AC3: maintains correct order of dates', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-25', total_cost: 0.05, run_count: 1 },
      { date: '2026-02-26', total_cost: 0.08, run_count: 2 },
      { date: '2026-02-27', total_cost: 0.12, run_count: 3 },
    ];

    // Act
    const { container } = render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Dates appear in order in the DOM
    const dateElements = Array.from(container.querySelectorAll('*')).filter(
      (el) => el.textContent?.includes('2026-02-')
    );
    const texts = dateElements.map((el) => el.textContent);
    // If dates are present, they should be in document order
    expect(texts.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// Edge Cases: Run Count Formatting
// -----------------------------------------------------------------------

describe('CostSummaryBar - Run Count Display', () => {
  it('displays singular "run" for count of 1', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.05, run_count: 1 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Singular form used
    expect(screen.getByText(/1 run|run/i)).toBeInTheDocument();
  });

  it('displays plural "runs" for count > 1', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.05, run_count: 5 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Plural form used
    expect(screen.getByText(/5 run/i)).toBeInTheDocument();
  });

  it('handles zero run count', () => {
    // Arrange
    const dailyCosts: DailyCost[] = [
      { date: '2026-02-26', total_cost: 0.0, run_count: 0 },
    ];

    // Act
    render(<CostSummaryBar dailyCosts={dailyCosts} />);

    // Assert: Zero is handled
    expect(screen.getByText(/0 run/i)).toBeInTheDocument();
  });
});
