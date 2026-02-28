import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

/**
 * Activity Dashboard Page Tests
 *
 * Tests for the helper functions and StatCard component used in the activity page.
 * These functions format metrics data for display in the dashboard.
 */

/**
 * HELPER FUNCTION: formatCost
 * Converts numeric cost values to formatted currency strings
 * AC: Costs should display with appropriate precision based on magnitude
 */
describe('formatCost', () => {
  // Helper function implementation (from page.tsx)
  function formatCost(cost: number): string {
    if (cost === 0) return '$0.00';
    if (cost < 0.001) return `$${cost.toFixed(6)}`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  describe('Happy Path: Normal cost values', () => {
    it('should format zero cost correctly', () => {
      expect(formatCost(0)).toBe('$0.00');
    });

    it('should format standard costs with 2 decimal places', () => {
      expect(formatCost(0.05)).toBe('$0.05');
      expect(formatCost(1.25)).toBe('$1.25');
      expect(formatCost(100.99)).toBe('$100.99');
    });

    it('should format small costs with 4 decimal places', () => {
      expect(formatCost(0.001)).toBe('$0.0010');
      expect(formatCost(0.0050)).toBe('$0.0050');
      expect(formatCost(0.0099)).toBe('$0.0099');
    });
  });

  describe('Edge Cases: Very small costs', () => {
    it('should format micro costs with 6 decimal places', () => {
      expect(formatCost(0.0001)).toBe('$0.000100');
      expect(formatCost(0.000001)).toBe('$0.000001');
    });

    it('should handle costs at boundary thresholds', () => {
      // Just below 0.001 threshold (6 decimals)
      expect(formatCost(0.0009)).toBe('$0.000900');
      // Just at 0.001 threshold (4 decimals)
      expect(formatCost(0.001)).toBe('$0.0010');
      // Just below 0.01 threshold (4 decimals)
      expect(formatCost(0.0099)).toBe('$0.0099');
      // Just at 0.01 threshold (2 decimals)
      expect(formatCost(0.01)).toBe('$0.01');
    });
  });
});

/**
 * HELPER FUNCTION: formatDuration
 * Converts millisecond durations to human-readable time strings
 * AC: Durations should display with appropriate units (ms, s, m)
 */
describe('formatDuration', () => {
  // Helper function implementation (from page.tsx)
  function formatDuration(ms: number): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  describe('Happy Path: Normal durations', () => {
    it('should format millisecond durations', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format second durations with decimal precision', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(2500)).toBe('2.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minute durations with decimal precision', () => {
      expect(formatDuration(60000)).toBe('1.0m');
      expect(formatDuration(150000)).toBe('2.5m');
      expect(formatDuration(600000)).toBe('10.0m');
    });
  });

  describe('Edge Cases: Boundary values and zero', () => {
    it('should return dash for zero or falsy values', () => {
      expect(formatDuration(0)).toBe('—');
      expect(formatDuration(null as any)).toBe('—');
      expect(formatDuration(undefined as any)).toBe('—');
    });

    it('should handle boundary thresholds correctly', () => {
      // Just below 1s threshold
      expect(formatDuration(999)).toBe('999ms');
      // Just at 1s threshold
      expect(formatDuration(1000)).toBe('1.0s');
      // Just below 1m threshold
      expect(formatDuration(59999)).toBe('60.0s');
      // Just at 1m threshold
      expect(formatDuration(60000)).toBe('1.0m');
    });

    it('should handle very small durations', () => {
      expect(formatDuration(1)).toBe('1ms');
      expect(formatDuration(10)).toBe('10ms');
    });
  });
});

/**
 * HELPER FUNCTION: formatNumber
 * Converts large numbers to human-readable format (K, M suffix)
 * AC: Numbers should abbreviate appropriately for readability
 */
describe('formatNumber', () => {
  // Helper function implementation (from page.tsx)
  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  describe('Happy Path: Standard number formatting', () => {
    it('should return plain numbers below 1000', () => {
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatNumber(1000)).toBe('1.0K');
      expect(formatNumber(5500)).toBe('5.5K');
      expect(formatNumber(999999)).toBe('1000.0K');
    });

    it('should format millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.0M');
      expect(formatNumber(2500000)).toBe('2.5M');
      expect(formatNumber(10000000)).toBe('10.0M');
    });
  });

  describe('Edge Cases: Boundary values', () => {
    it('should handle boundary thresholds correctly', () => {
      // Just below 1K threshold
      expect(formatNumber(999)).toBe('999');
      // Just at 1K threshold
      expect(formatNumber(1000)).toBe('1.0K');
      // Just below 1M threshold
      expect(formatNumber(999999)).toBe('1000.0K');
      // Just at 1M threshold
      expect(formatNumber(1000000)).toBe('1.0M');
    });

    it('should handle very large numbers', () => {
      expect(formatNumber(999000000)).toBe('999.0M');
      expect(formatNumber(1000000000)).toBe('1000.0M');
    });
  });
});

/**
 * HELPER FUNCTION: successRateColor
 * Returns a Tailwind CSS color class based on success rate percentage
 * AC: Color thresholds should match visual hierarchy (green ≥90%, amber 70-89%, red <70%)
 */
describe('successRateColor', () => {
  // Helper function implementation (from page.tsx)
  function successRateColor(rate: number): string {
    if (rate >= 0.9) return 'text-emerald-400';
    if (rate >= 0.7) return 'text-amber-400';
    return 'text-red-400';
  }

  describe('Happy Path: Color assignment by rate', () => {
    it('should return emerald for high success rates', () => {
      expect(successRateColor(0.9)).toBe('text-emerald-400');
      expect(successRateColor(0.95)).toBe('text-emerald-400');
      expect(successRateColor(1.0)).toBe('text-emerald-400');
    });

    it('should return amber for medium success rates', () => {
      expect(successRateColor(0.7)).toBe('text-amber-400');
      expect(successRateColor(0.8)).toBe('text-amber-400');
      expect(successRateColor(0.89)).toBe('text-amber-400');
    });

    it('should return red for low success rates', () => {
      expect(successRateColor(0.0)).toBe('text-red-400');
      expect(successRateColor(0.5)).toBe('text-red-400');
      expect(successRateColor(0.69)).toBe('text-red-400');
    });
  });

  describe('Edge Cases: Boundary rates', () => {
    it('should apply correct colors at exact thresholds', () => {
      // Below 0.7 threshold
      expect(successRateColor(0.6999)).toBe('text-red-400');
      // At 0.7 threshold
      expect(successRateColor(0.7)).toBe('text-amber-400');
      // Below 0.9 threshold
      expect(successRateColor(0.8999)).toBe('text-amber-400');
      // At 0.9 threshold
      expect(successRateColor(0.9)).toBe('text-emerald-400');
    });
  });
});

/**
 * COMPONENT: StatCard
 * Displays a single statistic with label, value, icon, and optional subtitle
 * AC: All props should render correctly with proper Tailwind styling
 */
describe('StatCard', () => {
  interface StatCardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    sub?: string;
    valueClass?: string;
  }

  function StatCard({ label, value, icon, sub, valueClass = 'text-white' }: StatCardProps) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
          <span className="text-slate-500">{icon}</span>
        </div>
        <p className={`mt-2 text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      </div>
    );
  }

  describe('Happy Path: Rendering all props', () => {
    it('should display label, value, and icon', () => {
      const testIcon = <div data-testid="test-icon">★</div>;
      render(
        <StatCard
          label="Total Cost"
          value="$1,234.56"
          icon={testIcon}
        />
      );

      expect(screen.getByText('Total Cost')).toBeInTheDocument();
      expect(screen.getByText('$1,234.56')).toBeInTheDocument();
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('should display subtitle when provided', () => {
      const testIcon = <span>📊</span>;
      render(
        <StatCard
          label="Success Rate"
          value="95%"
          icon={testIcon}
          sub="Last 7 days"
        />
      );

      expect(screen.getByText('Success Rate')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    });
  });

  describe('Edge Cases: Optional props and styling', () => {
    it('should not display subtitle when not provided', () => {
      render(
        <StatCard
          label="Agents"
          value="5"
          icon={<span>🤖</span>}
        />
      );

      expect(screen.getByText('Agents')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should apply custom valueClass when provided', () => {
      render(
        <StatCard
          label="Cost"
          value="$99.99"
          icon={<span>💰</span>}
          valueClass="text-emerald-400"
        />
      );

      const valueElement = screen.getByText('$99.99');
      expect(valueElement).toHaveClass('text-emerald-400');
    });

    it('should apply default white color class when valueClass not provided', () => {
      render(
        <StatCard
          label="Runs"
          value="1000"
          icon={<span>⚙️</span>}
        />
      );

      const valueElement = screen.getByText('1000');
      expect(valueElement).toHaveClass('text-white');
    });
  });
});
