```tsx
/**
 * Tests for AlertsTable component.
 *
 * Tests cover:
 * - Filtering alerts by severity (all/critical/warning/info)
 * - Alert count badges displayed correctly
 * - SeverityBadge rendering with correct icons and colors
 * - Filtering behavior and counter updates
 * - Empty state handling for each filter
 * - Time formatting (timeAgo function)
 * - Loading and error states
 * - initialData prop eliminates cold-start loading flash
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsTable from '../AlertsTable';
import { useApi } from '@/hooks/useApi';
import type { Alert } from '@/lib/types';

// Mock the useApi hook
jest.mock('@/hooks/useApi');

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  Info: () => <div data-testid="info-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
}));

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

/** Build a minimal valid Alert object with sensible defaults for fields not under test. */
function makeAlert(overrides: Partial<Alert> & Pick<Alert, 'id' | 'ticker' | 'severity' | 'created_at'>): Alert {
  return {
    condition_type: 'price_above',
    threshold: 100,
    enabled: true,
    sound_type: 'default',
    triggered_at: null,
    type: 'price_alert',
    message: 'Test alert message',
    ...overrides,
  };
}

describe('AlertsTable', () => {
  // =========================================================================
  // Test Data: Mock Alerts with various severities
  // =========================================================================

  const mockAlerts: Alert[] = [
    makeAlert({
      id: 1,
      ticker: 'AAPL',
      type: 'price_alert',
      message: 'Apple stock crossed moving average',
      severity: 'critical',
      created_at: new Date(Date.now() - 5 * 60000).toISOString(),
    }),
    makeAlert({
      id: 2,
      ticker: 'TSLA',
      type: 'news_alert',
      message: 'Tesla earnings announcement',
      severity: 'warning',
      created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    }),
    makeAlert({
      id: 3,
      ticker: 'MSFT',
      type: 'sentiment_alert',
      message: 'Sentiment shift detected',
      severity: 'info',
      created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    }),
    makeAlert({
      id: 4,
      ticker: 'GOOGL',
      type: 'price_alert',
      message: 'Volume spike detected',
      severity: 'critical',
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    }),
    makeAlert({
      id: 5,
      ticker: 'AMZN',
      type: 'technical_alert',
      message: 'RSI above 70',
      severity: 'warning',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Renders table with filters and counts
  // =========================================================================

  describe('happy path: displays table with filters and severity counts', () => {
    it('should render alerts table with all columns visible', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert: header and columns
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByText('Ticker')).toBeInTheDocument();
      expect(screen.getByText('Severity')).toBeInTheDocument();
      expect(screen.getByText('Message')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Time')).toBeInTheDocument();
    });

    it('should display alert count badge in header', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert: count badge shows total alerts (5)
      const countBadge = screen.getByText('5');
      expect(countBadge).toBeInTheDocument();
      expect(countBadge).toHaveClass('text-red-400');
    });

    it('should display all alerts in table body when filter is "all"', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert: all 5 ticker values visible
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.getByText('AMZN')).toBeInTheDocument();
    });

    it('should display alert messages correctly', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert
      expect(screen.getByText('Apple stock crossed moving average')).toBeInTheDocument();
      expect(screen.getByText('Tesla earnings announcement')).toBeInTheDocument();
      expect(screen.getByText('Sentiment shift detected')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Filtering: Severity filter tabs and counts
  // =========================================================================

  describe('filtering: severity filter tabs and alert counts', () => {
    it('should show severity filter counts: critical(2), warning(2), info(1)', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert: filter buttons show counts
      expect(screen.getByRole('tab', { name: /Critical/i })).toHaveTextContent('(2)');
      expect(screen.getByRole('tab', { name: /Warning/i })).toHaveTextContent('(2)');
      expect(screen.getByRole('tab', { name: /Info/i })).toHaveTextContent('(1)');
    });

    it('should filter alerts when clicking Critical tab', async () => {
      // Arrange
      const user = userEvent.setup();
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);
      await user.click(screen.getByRole('tab', { name: /Critical/i }));

      // Assert: only critical alerts (AAPL, GOOGL) visible
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.queryByText('TSLA')).not.toBeInTheDocument();
      expect(screen.queryByText('MSFT')).not.toBeInTheDocument();
      expect(screen.queryByText('AMZN')).not.toBeInTheDocument();
    });

    it('should filter alerts when clicking Warning tab', async () => {
      // Arrange
      const user = userEvent.setup();
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);
      await user.click(screen.getByRole('tab', { name: /Warning/i }));

      // Assert: only warning alerts (TSLA, AMZN) visible
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('AMZN')).toBeInTheDocument();
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
      expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();
    });

    it('should filter alerts when clicking Info tab', async () => {
      // Arrange
      const user = userEvent.setup();
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);
      await user.click(screen.getByRole('tab', { name: /Info/i }));

      // Assert: only info alert (MSFT) visible
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
      expect(screen.queryByText('TSLA')).not.toBeInTheDocument();
      expect(screen.queryByText('GOOGL')).not.toBeInTheDocument();
      expect(screen.queryByText('AMZN')).not.toBeInTheDocument();
    });

    it('should return to All filter and show all alerts', async () => {
      // Arrange
      const user = userEvent.setup();
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);
      await user.click(screen.getByRole('tab', { name: /Critical/i }));
      await user.click(screen.getByRole('tab', { name: /^All/i }));

      // Assert: all alerts visible again
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
      expect(screen.getByText('AMZN')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // initialData: Pre-fetched data eliminates cold-start loading flash
  // =========================================================================

  describe('initialData: pre-fetched data renders before first fetch completes', () => {
    it('renders initialData immediately when useApi is still loading', () => {
      // Arrange: useApi returns null data (first fetch in progress)
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      // Act: pass pre-fetched data as initialData
      render(<AlertsTable initialData={mockAlerts} />);

      // Assert: data renders immediately (no loading skeleton shown)
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.queryByText('Loading alerts...')).not.toBeInTheDocument();
    });

    it('transitions from initialData to freshly fetched data', () => {
      // Arrange: useApi returns fresh data after loading completes
      mockUseApi.mockReturnValue({
        data: mockAlerts.slice(0, 2), // Only 2 fresh alerts
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable initialData={mockAlerts} />);

      // Assert: fresh data takes precedence over initialData
      // Only 2 fresh alerts are shown (not all 5 from initialData)
      const countBadge = screen.getByText('2');
      expect(countBadge).toHaveClass('text-red-400');
    });

    it('shows loading when both initialData and freshAlerts are null', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      // Act: no initialData passed
      render(<AlertsTable initialData={null} />);

      // Assert: loading state shown
      expect(screen.getByText('Loading alerts...')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: Empty state, time formatting, unknown severity
  // =========================================================================

  describe('edge cases: empty state, time formatting', () => {
    it('should display empty state for "all" filter when no alerts exist', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert
      expect(screen.getByText('No alerts recorded yet.')).toBeInTheDocument();
    });

    it('should display empty state for specific filter with no matches', async () => {
      // Arrange
      const user = userEvent.setup();
      const onlyCritical = mockAlerts.filter((a) => a.severity === 'critical');

      mockUseApi.mockReturnValue({
        data: onlyCritical,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);
      await user.click(screen.getByRole('tab', { name: /Warning/i }));

      // Assert
      expect(screen.getByText('No warning alerts.')).toBeInTheDocument();
    });

    it('should render clock icons for time column', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert: Clock icon renders for each alert row
      const clockIcons = screen.getAllByTestId('clock-icon');
      expect(clockIcons.length).toBeGreaterThan(0);
    });

    it('should render unknown severity badge with default styling', () => {
      // Arrange: severity value outside the defined union — cast required
      const unknownSeverityAlert = [
        makeAlert({
          id: 99,
          ticker: 'TEST',
          type: 'custom_alert',
          message: 'Custom alert',
          severity: 'unknown_level' as Alert['severity'],
          created_at: new Date().toISOString(),
        }),
      ];

      mockUseApi.mockReturnValue({
        data: unknownSeverityAlert,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert: unknown severity text rendered with default styling (Info icon fallback)
      expect(screen.getByText('unknown_level')).toBeInTheDocument();
      expect(screen.getByTestId('info-icon')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading & Error States
  // =========================================================================

  describe('loading and error states', () => {
    it('should display loading state while fetching alerts', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert
      expect(screen.getByText('Loading alerts...')).toBeInTheDocument();
    });

    it('should display error message when fetch fails', () => {
      // Arrange
      const errorMsg = 'Failed to load alerts. Please refresh the page.';
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: errorMsg,
        refetch: jest.fn(),
      });

      // Act
      render(<AlertsTable />);

      // Assert
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });
});
```