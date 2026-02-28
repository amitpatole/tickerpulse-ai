/**
 * Tests for AlertsPanel component
 *
 * Tests cover:
 * - Tab switching (Active / History)
 * - Alert filtering (active = not triggered, history = triggered at least once)
 * - Delete with confirmation
 * - Toggle enable/disable
 * - Create/Edit modal control
 * - Error handling
 * - Loading and empty states
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertsPanel from '../AlertsPanel';
import * as useAlertsModule from '@/hooks/useAlerts';
import type { Alert } from '@/lib/types';

// Mock the useAlerts hook
jest.mock('@/hooks/useAlerts');
const mockUseAlerts = jest.mocked(useAlertsModule.useAlerts);

// Mock AlertFormModal to avoid nested complexity
jest.mock('@/components/alerts/AlertFormModal', () => {
  return function DummyModal() {
    return <div data-testid="alert-form-modal">Modal</div>;
  };
});

describe('AlertsPanel', () => {
  const mockOnClose = jest.fn();

  const mockAlerts: Alert[] = [
    {
      id: 1,
      ticker: 'AAPL',
      message: 'Apple above $150',
      condition_type: 'price_above',
      threshold: 150,
      enabled: true,
      sound_type: 'chime',
      triggered_at: null, // Active
      fire_count: 0,
      created_at: '2026-02-27T10:00:00Z',
    },
    {
      id: 2,
      ticker: 'MSFT',
      message: 'Microsoft below $300',
      condition_type: 'price_below',
      threshold: 300,
      enabled: true,
      sound_type: 'bell',
      triggered_at: '2026-02-27T09:00:00Z', // History
      fire_count: 2,
      created_at: '2026-02-27T08:00:00Z',
    },
    {
      id: 3,
      ticker: 'TSLA',
      message: 'Tesla price change 5%',
      condition_type: 'pct_change',
      threshold: 5,
      enabled: false,
      sound_type: 'chime',
      triggered_at: null, // Active but disabled
      fire_count: 0,
      created_at: '2026-02-27T09:30:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnClose.mockClear();
  });

  describe('happy path: renders and switches tabs correctly', () => {
    it('renders active alerts tab by default with alert count', () => {
      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      // Assert: Active tab selected by default with count (2 active alerts: id 1, 3)
      const activeTab = screen.getByRole('tab', { name: /Active \(2\)/ });
      expect(activeTab).toHaveAttribute('aria-selected', 'true');

      // Assert: Active alert visible
      expect(screen.getByText(/Apple above/)).toBeInTheDocument();
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    it('switches to history tab and displays triggered alerts sorted by triggered_at DESC', async () => {
      const user = userEvent.setup();
      mockUseAlerts.mockReturnValue({
        alerts: [
          ...mockAlerts,
          {
            id: 4,
            ticker: 'NVDA',
            message: 'NVIDIA price change',
            condition_type: 'pct_change',
            threshold: 10,
            enabled: true,
            sound_type: 'chime',
            triggered_at: '2026-02-27T11:00:00Z', // More recent
            fire_count: 1,
            created_at: '2026-02-27T09:00:00Z',
          },
        ],
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const historyTab = screen.getByRole('tab', { name: /History/ });
      await user.click(historyTab);

      // Assert: History tab selected, shows triggered alerts (count = 2)
      expect(historyTab).toHaveAttribute('aria-selected', 'true');

      // Assert: Alerts sorted by triggered_at DESC (NVDA first, then MSFT)
      const alertTexts = screen.getAllByText(/NVIDIA price change|Microsoft below/);
      expect(alertTexts.length).toBe(2);
      // NVIDIA (11:00) should appear before MSFT (09:00)
      expect(alertTexts[0]).toHaveTextContent('NVIDIA price change');
    });
  });

  describe('error cases: handles delete, toggle failures gracefully', () => {
    it('displays action error when delete fails and allows retry', async () => {
      const user = userEvent.setup();
      const mockRemoveAlert = jest.fn().mockRejectedValue(new Error('Delete failed'));

      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: mockRemoveAlert,
        toggleAlert: jest.fn(),
      });

      window.confirm = jest.fn(() => true);

      render(<AlertsPanel onClose={mockOnClose} />);

      const deleteBtn = screen.getAllByLabelText(/Delete alert/)[0]; // AAPL delete button
      await user.click(deleteBtn);

      // Assert: Error message displayed
      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });

      // Assert: Delete button no longer disabled (can retry)
      await waitFor(() => {
        expect(deleteBtn).not.toBeDisabled();
      });
    });

    it('shows fetch error when alerts API fails', () => {
      mockUseAlerts.mockReturnValue({
        alerts: [],
        loading: false,
        error: 'Failed to fetch alerts',
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      // Assert: Error message visible
      expect(screen.getByText('Failed to fetch alerts')).toBeInTheDocument();
    });

    it('displays error when toggle fails', async () => {
      const user = userEvent.setup();
      const mockToggleAlert = jest.fn().mockRejectedValue(new Error('Toggle error'));

      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: mockToggleAlert,
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const toggleBtn = screen.getAllByLabelText(/Disable alert|Enable alert/)[0]; // AAPL toggle
      await user.click(toggleBtn);

      // Assert: Error displayed
      await waitFor(() => {
        expect(screen.getByText('Toggle error')).toBeInTheDocument();
      });
    });
  });

  describe('edge cases: empty states, disabled alerts, confirmation dialogs', () => {
    it('shows empty state message in active tab when no alerts exist', () => {
      mockUseAlerts.mockReturnValue({
        alerts: [],
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      // Assert: Empty state message with "Create one" link
      expect(screen.getByText(/No active alerts/)).toBeInTheDocument();
      expect(screen.getByText('Create one')).toBeInTheDocument();
    });

    it('shows empty history state when no alerts have triggered', () => {
      const user = userEvent.setup();
      mockUseAlerts.mockReturnValue({
        alerts: [
          {
            id: 1,
            ticker: 'AAPL',
            message: 'Test',
            condition_type: 'price_above',
            threshold: 150,
            enabled: true,
            sound_type: 'chime',
            triggered_at: null,
            fire_count: 0,
            created_at: '2026-02-27T10:00:00Z',
          },
        ],
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const historyTab = screen.getByRole('tab', { name: /History/ });
      userEvent.click(historyTab);

      // Assert: Empty history message
      expect(screen.getByText(/No alerts have fired yet/)).toBeInTheDocument();
    });

    it('displays disabled alert with reduced opacity', () => {
      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      const { container } = render(<AlertsPanel onClose={mockOnClose} />);

      // Find TSLA alert (disabled, id=3)
      const alertItems = container.querySelectorAll('li');
      const disabledAlert = Array.from(alertItems).find((li) =>
        li.textContent?.includes('TSLA')
      );

      // Assert: Disabled alert has opacity-50 class
      expect(disabledAlert).toHaveClass('opacity-50');
    });

    it('requires confirmation before deleting alert', async () => {
      const user = userEvent.setup();
      const mockRemoveAlert = jest.fn();
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: mockRemoveAlert,
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const deleteBtn = screen.getAllByLabelText(/Delete alert/)[0];
      await user.click(deleteBtn);

      // Assert: Confirmation dialog shown
      expect(confirmSpy).toHaveBeenCalledWith('Delete this alert?');

      // Assert: removeAlert NOT called when user cancels
      expect(mockRemoveAlert).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('displays fire count correctly in history tab', async () => {
      const user = userEvent.setup();
      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const historyTab = screen.getByRole('tab', { name: /History/ });
      await user.click(historyTab);

      // Assert: Fire count shown (MSFT has fire_count: 2)
      expect(screen.getByText(/Fired 2 times/)).toBeInTheDocument();
    });
  });

  describe('acceptance: modal control and header buttons', () => {
    it('opens create modal when "New" button clicked', async () => {
      const user = userEvent.setup();
      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      const { rerender } = render(<AlertsPanel onClose={mockOnClose} />);

      const newBtn = screen.getByLabelText('Create new price alert');
      await user.click(newBtn);

      // Assert: Modal rendered (mocked component visible)
      expect(screen.getByTestId('alert-form-modal')).toBeInTheDocument();
    });

    it('closes panel when X button clicked', async () => {
      const user = userEvent.setup();
      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const closeBtn = screen.getByLabelText('Close alerts panel');
      await user.click(closeBtn);

      // Assert: onClose callback invoked
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('opens edit modal when edit button clicked', async () => {
      const user = userEvent.setup();
      mockUseAlerts.mockReturnValue({
        alerts: mockAlerts,
        loading: false,
        error: null,
        createAlert: jest.fn(),
        updateAlert: jest.fn(),
        removeAlert: jest.fn(),
        toggleAlert: jest.fn(),
      });

      render(<AlertsPanel onClose={mockOnClose} />);

      const editBtn = screen.getByLabelText(/Edit alert for AAPL/);
      await user.click(editBtn);

      // Assert: Modal rendered
      expect(screen.getByTestId('alert-form-modal')).toBeInTheDocument();
    });
  });
});
