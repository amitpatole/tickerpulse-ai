/**
 * Tests for AlertBell component
 *
 * Tests cover:
 * - Badge visibility and count (shows new triggered alerts since last open)
 * - Last opened timestamp tracking
 * - Panel open/close
 * - Polling interval (30s)
 * - Aria labels for accessibility
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertBell from '../AlertBell';
import * as useApiModule from '@/hooks/useApi';
import * as apiModule from '@/lib/api';
import type { Alert } from '@/lib/types';

// Mock the hooks and API
jest.mock('@/hooks/useApi');
jest.mock('@/lib/api');
const mockUseApi = jest.mocked(useApiModule.useApi);
const mockGetAlerts = jest.mocked(apiModule.getAlerts);

// Mock AlertsPanel to simplify testing
jest.mock('@/components/alerts/AlertsPanel', () => {
  return function DummyPanel({ onClose }: { onClose: () => void }) {
    return (
      <div data-testid="alerts-panel">
        <button onClick={onClose}>Close Panel</button>
      </div>
    );
  };
});

describe('AlertBell', () => {
  const mockAlerts: Alert[] = [
    {
      id: 1,
      ticker: 'AAPL',
      message: 'Test alert',
      condition_type: 'price_above',
      threshold: 150,
      enabled: true,
      sound_type: 'chime',
      triggered_at: null,
      fire_count: 0,
      created_at: '2026-02-27T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('happy path: renders bell icon and badge count correctly', () => {
    it('renders bell icon with no badge when no alerts triggered', () => {
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: Bell icon rendered
      const bellBtn = screen.getByLabelText('View price alerts');
      expect(bellBtn).toBeInTheDocument();

      // Assert: No badge visible (all alerts have triggered_at = null)
      expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it('shows badge with count of new triggered alerts since panel was opened', async () => {
      const user = userEvent.setup({ delay: null });
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
      const recentAlert = new Date(now.getTime() - 600000).toISOString(); // 10 min ago

      const alertsWithTriggered: Alert[] = [
        ...mockAlerts,
        {
          id: 2,
          ticker: 'MSFT',
          message: 'MSFT alert',
          condition_type: 'price_below',
          threshold: 300,
          enabled: true,
          sound_type: 'bell',
          triggered_at: oneHourAgo, // Old trigger
          fire_count: 1,
          created_at: '2026-02-27T08:00:00Z',
        },
        {
          id: 3,
          ticker: 'TSLA',
          message: 'TSLA alert',
          condition_type: 'pct_change',
          threshold: 5,
          enabled: true,
          sound_type: 'chime',
          triggered_at: recentAlert, // Recent trigger
          fire_count: 1,
          created_at: '2026-02-27T09:00:00Z',
        },
      ];

      mockUseApi.mockReturnValue({
        data: alertsWithTriggered,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Before opening, badge shows 2 (all triggered alerts)
      expect(screen.getByText('2')).toBeInTheDocument();

      // Open panel
      const bellBtn = screen.getByRole('button', {
        name: /2 new price alerts/,
      });
      await user.click(bellBtn);

      // Assert: Panel opened
      expect(screen.getByTestId('alerts-panel')).toBeInTheDocument();

      // Close panel (this updates lastOpenedAtRef to now)
      const closeBtn = screen.getByText('Close Panel');
      await user.click(closeBtn);

      // Assert: Panel closed, badge count resets (no triggered alerts after now)
      await waitFor(() => {
        expect(screen.queryByTestId('alerts-panel')).not.toBeInTheDocument();
      });

      // Badge should now be hidden or show 0
      const badge = screen.queryByText('2');
      expect(badge).not.toBeInTheDocument();
    });

    it('displays "9+" when alert count exceeds 9', () => {
      const now = new Date().toISOString();
      const triggeredAlerts = Array.from({ length: 15 }, (_, i) => ({
        id: i,
        ticker: `TICK${i}`,
        message: `Alert ${i}`,
        condition_type: 'price_above' as const,
        threshold: 100,
        enabled: true,
        sound_type: 'chime' as const,
        triggered_at: now, // All triggered
        fire_count: 1,
        created_at: now,
      }));

      mockUseApi.mockReturnValue({
        data: triggeredAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: Badge shows "9+" instead of "15"
      expect(screen.getByText('9+')).toBeInTheDocument();
      expect(screen.queryByText('15')).not.toBeInTheDocument();
    });
  });

  describe('edge cases: empty alerts, null timestamps, badge logic', () => {
    it('handles empty alerts list gracefully', () => {
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: Bell rendered without badge
      const bellBtn = screen.getByLabelText('View price alerts');
      expect(bellBtn).toBeInTheDocument();
      expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it('counts only alerts with triggered_at set', () => {
      const now = new Date().toISOString();
      const mixedAlerts: Alert[] = [
        {
          id: 1,
          ticker: 'AAPL',
          message: 'Test',
          condition_type: 'price_above',
          threshold: 150,
          enabled: true,
          sound_type: 'chime',
          triggered_at: null, // Not triggered
          fire_count: 0,
          created_at: now,
        },
        {
          id: 2,
          ticker: 'MSFT',
          message: 'Test',
          condition_type: 'price_below',
          threshold: 300,
          enabled: true,
          sound_type: 'chime',
          triggered_at: now, // Triggered
          fire_count: 1,
          created_at: now,
        },
        {
          id: 3,
          ticker: 'TSLA',
          message: 'Test',
          condition_type: 'pct_change',
          threshold: 5,
          enabled: true,
          sound_type: 'chime',
          triggered_at: null, // Not triggered
          fire_count: 0,
          created_at: now,
        },
      ];

      mockUseApi.mockReturnValue({
        data: mixedAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: Only 1 alert counted (MSFT)
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('correctly handles alerts triggered at exactly lastOpenedAt boundary', async () => {
      const user = userEvent.setup({ delay: null });
      const baseTime = new Date('2026-02-27T10:00:00Z');

      // First render with old alert
      mockUseApi.mockReturnValue({
        data: [
          {
            id: 1,
            ticker: 'AAPL',
            message: 'Test',
            condition_type: 'price_above',
            threshold: 150,
            enabled: true,
            sound_type: 'chime',
            triggered_at: '2026-02-27T09:00:00Z', // Before panel open
            fire_count: 1,
            created_at: '2026-02-27T08:00:00Z',
          },
        ],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);
      expect(screen.getByText('1')).toBeInTheDocument();

      // Open panel (captures current time as lastOpenedAt)
      const bellBtn = screen.getByLabelText(/1 new price alert/);
      await user.click(bellBtn);

      // Close panel
      const closeBtn = screen.getByText('Close Panel');
      await user.click(closeBtn);

      // Update with alert triggered at exactly lastOpenedAt (should NOT count as new)
      const openTime = new Date().toISOString();
      mockUseApi.mockReturnValue({
        data: [
          {
            id: 1,
            ticker: 'AAPL',
            message: 'Test',
            condition_type: 'price_above',
            threshold: 150,
            enabled: true,
            sound_type: 'chime',
            triggered_at: openTime, // At boundary
            fire_count: 1,
            created_at: '2026-02-27T08:00:00Z',
          },
        ],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      // Re-render after close
      const { rerender } = render(<AlertBell />);
      rerender(<AlertBell />);

      // Alert at boundary should NOT count (using > not >=)
      await waitFor(() => {
        expect(screen.queryByText(/1|2/)).not.toBeInTheDocument();
      });
    });
  });

  describe('acceptance: aria labels and polling interval', () => {
    it('has correct aria-label based on alert count', async () => {
      const now = new Date().toISOString();
      const triggeredAlerts: Alert[] = [
        {
          id: 1,
          ticker: 'AAPL',
          message: 'Test',
          condition_type: 'price_above',
          threshold: 150,
          enabled: true,
          sound_type: 'chime',
          triggered_at: now,
          fire_count: 1,
          created_at: now,
        },
        {
          id: 2,
          ticker: 'MSFT',
          message: 'Test',
          condition_type: 'price_below',
          threshold: 300,
          enabled: true,
          sound_type: 'chime',
          triggered_at: now,
          fire_count: 1,
          created_at: now,
        },
      ];

      mockUseApi.mockReturnValue({
        data: triggeredAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: Plural form when count > 1
      expect(screen.getByLabelText('2 new price alerts')).toBeInTheDocument();
    });

    it('uses singular "alert" form when count is 1', () => {
      const now = new Date().toISOString();
      mockUseApi.mockReturnValue({
        data: [
          {
            id: 1,
            ticker: 'AAPL',
            message: 'Test',
            condition_type: 'price_above',
            threshold: 150,
            enabled: true,
            sound_type: 'chime',
            triggered_at: now,
            fire_count: 1,
            created_at: now,
          },
        ],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: Singular form when count = 1
      expect(screen.getByLabelText('1 new price alert')).toBeInTheDocument();
    });

    it('calls useApi with 30s refresh interval', () => {
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      // Assert: useApi called with 30_000ms interval
      expect(mockUseApi).toHaveBeenCalledWith(
        expect.any(Function),
        [],
        {
          refreshInterval: 30_000,
        }
      );
    });

    it('has aria-haspopup="dialog" for accessibility', () => {
      mockUseApi.mockReturnValue({
        data: mockAlerts,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      render(<AlertBell />);

      const bellBtn = screen.getByRole('button');
      expect(bellBtn).toHaveAttribute('aria-haspopup', 'dialog');
    });
  });
});
