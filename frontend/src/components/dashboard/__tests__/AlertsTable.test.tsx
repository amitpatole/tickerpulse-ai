/**
 * Tests for AlertsTable Component
 *
 * Validates alert rendering, severity filtering, cold-start loading pattern,
 * and graceful degradation when data is unavailable.
 *
 * Key design: accepts optional initialData prop from parent useDashboardData
 * to eliminate cold-start loading flash while still self-refreshing every 15s.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AlertsTable from '@/components/dashboard/AlertsTable';
import type { Alert } from '@/lib/types';

// Prevent actual API calls — keep the hook in its loading state throughout tests
jest.mock('@/lib/api', () => ({
  getAlerts: jest.fn(() => new Promise(() => {})),
}));

const mockAlerts: Alert[] = [
  {
    id: 1,
    ticker: 'AAPL',
    condition_type: 'price_above',
    threshold: 150,
    enabled: true,
    sound_type: 'chime',
    triggered_at: '2026-02-27T10:00:00Z',
    created_at: '2026-02-27T10:00:00Z',
    severity: 'critical',
    type: 'price_above',
    message: 'Price exceeded $150',
  },
  {
    id: 2,
    ticker: 'GOOGL',
    condition_type: 'pct_change',
    threshold: 5,
    enabled: true,
    sound_type: 'chime',
    triggered_at: '2026-02-27T09:30:00Z',
    created_at: '2026-02-27T09:30:00Z',
    severity: 'warning',
    type: 'pct_change',
    message: 'Volume spike detected',
  },
  {
    id: 3,
    ticker: 'MSFT',
    condition_type: 'price_below',
    threshold: 300,
    enabled: true,
    sound_type: 'bell',
    triggered_at: '2026-02-27T08:45:00Z',
    created_at: '2026-02-27T08:45:00Z',
    severity: 'info',
    type: 'price_below',
    message: 'Price dropped below support',
  },
];

describe('AlertsTable', () => {
  describe('Happy Path: Renders alerts with proper filtering and display', () => {
    it('displays all alerts when initialData is provided and filter is "all"', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('Price exceeded $150')).toBeInTheDocument();
      expect(screen.getByText('Volume spike detected')).toBeInTheDocument();
    });

    it('displays correct alert count badge', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      // Component should show "Alerts 3" in the header
      expect(screen.getByText(/Alerts/)).toBeInTheDocument();
      const badge = screen.getByText('3');
      expect(badge).toBeInTheDocument();
    });

    it('shows severity badge with appropriate styling for each alert', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      // Severity badges should be rendered
      const severityElements = screen.getAllByText(/critical|warning|info/i);
      expect(severityElements.length).toBeGreaterThanOrEqual(3);
    });

    it('renders alert type with underscores replaced by spaces', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      // price_above should render as "price above"
      expect(screen.getByText(/price above/i)).toBeInTheDocument();
      // pct_change should render as "pct change"
      expect(screen.getByText(/pct change/i)).toBeInTheDocument();
      // price_below should render as "price below"
      expect(screen.getByText(/price below/i)).toBeInTheDocument();
    });
  });

  describe('Edge Case: Severity filtering works correctly', () => {
    it('filters alerts by severity when Critical tab is clicked', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      const criticalTab = screen.getByRole('tab', { name: /Critical \(1\)/i });
      fireEvent.click(criticalTab);

      // Should show only critical alert
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();
      expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
    });

    it('displays count badges for each severity filter', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      // Should show filter counts: Critical (1), Warning (1), Info (1)
      expect(screen.getByText(/Critical \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Warning \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Info \(1\)/i)).toBeInTheDocument();
    });

    it('returns to All filter and shows all alerts after filtering', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      // Filter by critical
      const criticalTab = screen.getByRole('tab', { name: /Critical/i });
      fireEvent.click(criticalTab);
      expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();

      // Switch back to All
      const allTab = screen.getByRole('tab', { name: /^All$/i });
      fireEvent.click(allTab);

      // All alerts should be visible again
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });
  });

  describe('Edge Case: Empty and null data handling', () => {
    it('displays empty state when initialData is an empty array', () => {
      render(<AlertsTable initialData={[]} />);

      expect(screen.getByText(/no alerts recorded yet/i)).toBeInTheDocument();
    });

    it('displays empty state message for filtered severity with no matches', () => {
      const singleAlert: Alert[] = [mockAlerts[0]]; // Only critical alert

      render(<AlertsTable initialData={singleAlert} />);

      // Filter to Warning (should have no matches)
      const warningTab = screen.getByRole('tab', { name: /Warning/i });
      fireEvent.click(warningTab);

      expect(screen.getByText(/no warning alerts/i)).toBeInTheDocument();
    });

    it('shows loading state when initialData prop is undefined', () => {
      render(<AlertsTable />);

      // Without initialData, component shows loading while internal useApi fetches
      expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
    });

    it('shows loading state when initialData is null (parent still loading)', () => {
      render(<AlertsTable initialData={null} />);

      // null prop indicates parent is loading
      expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
    });
  });

  describe('Edge Case: Time formatting in alert rows', () => {
    it('displays time-ago format for recent alerts', () => {
      // Create alert created just now
      const recentAlert: Alert[] = [
        {
          id: 1,
          ticker: 'TEST',
          condition_type: 'price_above',
          threshold: 100,
          enabled: true,
          sound_type: 'chime',
          triggered_at: null,
          created_at: new Date().toISOString(),
          severity: 'info',
          type: 'price_above',
          message: 'Test alert',
        },
      ];

      render(<AlertsTable initialData={recentAlert} />);

      // Recent alert should show "Just now"
      expect(screen.getByText(/just now/i)).toBeInTheDocument();
    });
  });

  describe('Error Case: Graceful degradation when data is unavailable', () => {
    it('renders safely without crashing when initialData is undefined', () => {
      const { container } = render(<AlertsTable />);

      expect(container).toBeInTheDocument();
      // Should show loading state, not crash
      expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
    });

    it('maintains filter state and UI structure even with edge case data', () => {
      render(<AlertsTable initialData={mockAlerts} />);

      // UI structure should be intact: header, filter tabs, and table
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByText(/Alerts/)).toBeInTheDocument();

      // Should have 4 filter tabs: All, Critical, Warning, Info
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(4);
    });
  });
});
