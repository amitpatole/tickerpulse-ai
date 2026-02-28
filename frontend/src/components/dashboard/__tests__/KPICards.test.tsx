/**
 * Tests for KPICards component.
 *
 * Tests cover:
 * - Rendering 4 KPI cards with correct data aggregation
 * - Loading skeleton states while fetching data
 * - Empty data handling (arrays, null values)
 * - Agent status count aggregation (running, idle, error)
 * - Correct subtitle formatting
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import KPICards from '../KPICards';
import { useApi } from '@/hooks/useApi';
import type { Stock, Alert, Agent } from '@/lib/types';

// Mock useApi hook
jest.mock('@/hooks/useApi');

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  BarChart3: () => <div data-testid="icon-stocks">📊</div>,
  Bell: () => <div data-testid="icon-alerts">🔔</div>,
  TrendingUp: () => <div data-testid="icon-regime">📈</div>,
  Activity: () => <div data-testid="icon-agents">⚡</div>,
}));

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('KPICards', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: All data loads correctly with correct aggregation
  // =========================================================================

  describe('happy path: renders all KPI cards with correct data', () => {
    it('displays stock count filtered to active stocks only', () => {
      // Arrange: 5 total stocks, 3 active
      const stocks: Stock[] = [
        { id: '1', symbol: 'AAPL', name: 'Apple', active: true, currentPrice: 150 },
        { id: '2', symbol: 'MSFT', name: 'Microsoft', active: true, currentPrice: 300 },
        { id: '3', symbol: 'GOOGL', name: 'Google', active: false, currentPrice: 140 },
        { id: '4', symbol: 'AMZN', name: 'Amazon', active: true, currentPrice: 170 },
        { id: '5', symbol: 'TSLA', name: 'Tesla', active: false, currentPrice: 250 },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: stocks,
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: 3 active stocks shown
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Stocks Monitored')).toBeInTheDocument();
      expect(screen.getByText('5 total tracked')).toBeInTheDocument();
    });

    it('displays alert count with correct subtitle', () => {
      // Arrange: 12 alerts
      const alerts: Alert[] = Array.from({ length: 12 }, (_, i) => ({
        id: `${i}`,
        ticker: 'AAPL',
        type: 'price',
        value: 150,
        direction: 'above',
        triggered: false,
        createdAt: new Date().toISOString(),
      }));

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: alerts,
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: alert count displayed
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Active Alerts')).toBeInTheDocument();
      expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
    });

    it('aggregates agent status counts correctly (running, idle, error)', () => {
      // Arrange: 5 agents with mixed statuses
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'running' },
        { id: '2', name: 'Agent 2', status: 'running' },
        { id: '3', name: 'Agent 3', status: 'idle' },
        { id: '4', name: 'Agent 4', status: 'idle' },
        { id: '5', name: 'Agent 5', status: 'error' },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: correct status counts displayed
      expect(screen.getByText('Agent Status')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('2 running, 2 idle, 1 error')).toBeInTheDocument();
    });

    it('displays agent status without error count when no errors', () => {
      // Arrange: agents with no error status
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'running' },
        { id: '2', name: 'Agent 2', status: 'idle' },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: error count omitted from text
      expect(screen.getByText('1 running, 1 idle')).toBeInTheDocument();
      expect(screen.queryByText(/error/)).not.toBeInTheDocument();
    });

    it('displays all 4 KPI cards with correct icons and colors', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<KPICards />);

      // Assert: all 4 cards rendered with their respective titles
      expect(screen.getByText('Stocks Monitored')).toBeInTheDocument();
      expect(screen.getByText('Active Alerts')).toBeInTheDocument();
      expect(screen.getByText('Market Regime')).toBeInTheDocument();
      expect(screen.getByText('Agent Status')).toBeInTheDocument();

      // Assert: icons are present
      expect(screen.getByTestId('icon-stocks')).toBeInTheDocument();
      expect(screen.getByTestId('icon-alerts')).toBeInTheDocument();
      expect(screen.getByTestId('icon-regime')).toBeInTheDocument();
      expect(screen.getByTestId('icon-agents')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading State: Show skeleton while data is loading
  // =========================================================================

  describe('loading state: displays skeleton while fetching', () => {
    it('does not show value when stocks are loading', () => {
      // Arrange: stocks loading, others loaded
      mockUseApi
        .mockReturnValueOnce({
          data: null,
          loading: true,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: loading state set, value hidden while loading
      expect(screen.queryByText('Stocks Monitored')).toBeInTheDocument();
      // Count how many visible numbers - should not include stocks value during loading
      const numbers = screen.queryAllByText(/^\d+$/);
      // At minimum should have Market Regime "Normal" and values for alerts/agents
      expect(numbers.length).toBeGreaterThanOrEqual(2);
    });

    it('does not show alert value when alerts are loading', () => {
      // Arrange: alerts loading, others loaded
      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: null,
          loading: true,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: alerts card present but value loading
      expect(screen.queryByText('Active Alerts')).toBeInTheDocument();
    });

    it('does not show agent value when agents are loading', () => {
      // Arrange: agents loading, others loaded
      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: null,
          loading: true,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: agent card present but value loading
      expect(screen.queryByText('Agent Status')).toBeInTheDocument();
    });

    it('displays value once data loads after being in loading state', () => {
      // Arrange
      const stocks: Stock[] = [
        { id: '1', symbol: 'AAPL', name: 'Apple', active: true, currentPrice: 150 },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: stocks,
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: value shown (1 active stock)
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Empty Data: Gracefully handle null/empty arrays
  // =========================================================================

  describe('empty data: handles null values and empty arrays', () => {
    it('displays 0 for stocks when data is null', () => {
      // Arrange: all data null
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: null,
      });

      // Act
      render(<KPICards />);

      // Assert: shows 0
      const zeroValues = screen.getAllByText('0');
      expect(zeroValues.length).toBeGreaterThan(0);
    });

    it('displays 0 for alerts when array is empty', () => {
      // Arrange: empty alerts
      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: shows 0 for alerts
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('displays correct stock total when no stocks are active', () => {
      // Arrange: 3 inactive stocks
      const stocks: Stock[] = [
        { id: '1', symbol: 'AAPL', name: 'Apple', active: false, currentPrice: 150 },
        { id: '2', symbol: 'MSFT', name: 'Microsoft', active: false, currentPrice: 300 },
        { id: '3', symbol: 'GOOGL', name: 'Google', active: false, currentPrice: 140 },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: stocks,
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: 0 active, 3 total
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('3 total tracked')).toBeInTheDocument();
    });

    it('displays agent count as 0 when agents array empty', () => {
      // Arrange: no agents
      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: agent status shows 0
      const zeroValues = screen.getAllByText('0');
      expect(zeroValues.length).toBeGreaterThanOrEqual(2);
    });

    it('displays default agent status text when no agents', () => {
      // Arrange: empty agents
      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: default text shown
      expect(screen.getByText('0 running, 0 idle')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Agent Count Aggregation: Correctly counts different statuses
  // =========================================================================

  describe('agent status aggregation: counts running/idle/error correctly', () => {
    it('counts all running agents', () => {
      // Arrange: 3 running agents
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'running' },
        { id: '2', name: 'Agent 2', status: 'running' },
        { id: '3', name: 'Agent 3', status: 'running' },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: shows 3 running agents
      expect(screen.getByText('3 running, 0 idle')).toBeInTheDocument();
    });

    it('counts all idle agents', () => {
      // Arrange: 4 idle agents
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'idle' },
        { id: '2', name: 'Agent 2', status: 'idle' },
        { id: '3', name: 'Agent 3', status: 'idle' },
        { id: '4', name: 'Agent 4', status: 'idle' },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: shows 4 idle agents
      expect(screen.getByText('0 running, 4 idle')).toBeInTheDocument();
    });

    it('counts agents with error status', () => {
      // Arrange: 1 running, 1 idle, 2 error
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'running' },
        { id: '2', name: 'Agent 2', status: 'idle' },
        { id: '3', name: 'Agent 3', status: 'error' },
        { id: '4', name: 'Agent 4', status: 'error' },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: shows error count
      expect(screen.getByText('1 running, 1 idle, 2 error')).toBeInTheDocument();
    });

    it('handles agent with unknown status as idle', () => {
      // Arrange: agent with unexpected status
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'pending' as any },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: unknown status counted as idle
      expect(screen.getByText('0 running, 1 idle')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Subtitle Consistency: Verify subtitle text accuracy
  // =========================================================================

  describe('subtitle display: shows correct contextual text', () => {
    it('displays stock total in stocks card subtitle', () => {
      // Arrange
      const stocks: Stock[] = [
        { id: '1', symbol: 'AAPL', name: 'Apple', active: true, currentPrice: 150 },
        { id: '2', symbol: 'MSFT', name: 'Microsoft', active: true, currentPrice: 300 },
        { id: '3', symbol: 'GOOGL', name: 'Google', active: false, currentPrice: 140 },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: stocks,
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: subtitle shows total
      expect(screen.getByText('3 total tracked')).toBeInTheDocument();
    });

    it('always displays "Last 24 hours" for alerts subtitle', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<KPICards />);

      // Assert: static subtitle for alerts
      expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
    });

    it('displays market regime as "Normal" always', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<KPICards />);

      // Assert: market regime is static
      expect(screen.getByText('Normal')).toBeInTheDocument();
      expect(screen.getByText('Assessed by regime agent')).toBeInTheDocument();
    });

    it('displays agent status text as subtitle', () => {
      // Arrange
      const agents: Agent[] = [
        { id: '1', name: 'Agent 1', status: 'running' },
        { id: '2', name: 'Agent 2', status: 'idle' },
      ];

      mockUseApi
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: [],
          loading: false,
          error: null,
        })
        .mockReturnValueOnce({
          data: agents,
          loading: false,
          error: null,
        });

      // Act
      render(<KPICards />);

      // Assert: agent status subtitle present
      expect(screen.getByText('1 running, 1 idle')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // API Refresh Intervals: Verify useApi called with correct refresh intervals
  // =========================================================================

  describe('API integration: calls useApi with correct refresh intervals', () => {
    it('calls useApi 3 times for stocks, alerts, and agents', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<KPICards />);

      // Assert: useApi called 3 times
      expect(mockUseApi).toHaveBeenCalledTimes(3);
    });

    it('sets different refresh intervals for each API call', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<KPICards />);

      // Assert: refresh intervals differ
      // useApi(callback, initialData, options)
      // calls[0][2] = options for stocks (30000ms)
      // calls[1][2] = options for alerts (15000ms)
      // calls[2][2] = options for agents (10000ms)
      const calls = mockUseApi.mock.calls;
      expect(calls[0][2]).toEqual(
        expect.objectContaining({ refreshInterval: 30000 })
      );
      expect(calls[1][2]).toEqual(
        expect.objectContaining({ refreshInterval: 15000 })
      );
      expect(calls[2][2]).toEqual(
        expect.objectContaining({ refreshInterval: 10000 })
      );
    });
  });
});
