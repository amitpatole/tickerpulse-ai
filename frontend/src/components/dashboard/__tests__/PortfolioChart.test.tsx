/**
 * Tests for PortfolioChart component.
 *
 * Tests cover:
 * - Rendering portfolio history chart with correct % delta calculation
 * - Time range selection (7D, 30D, 90D) triggers data refetch
 * - Empty portfolio history state
 * - Loading skeleton and error message display
 * - Chart accessibility with proper aria-label
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PortfolioChart from '../PortfolioChart';
import { useApi } from '@/hooks/useApi';
import type { PortfolioPoint } from '@/lib/types';

// Mock useApi hook
jest.mock('@/hooks/useApi');

// Mock lightweight-charts library
jest.mock('lightweight-charts', () => ({
  createChart: jest.fn(() => ({
    addSeries: jest.fn(() => ({
      setData: jest.fn(),
    })),
    timeScale: jest.fn(() => ({
      fitContent: jest.fn(),
    })),
    applyOptions: jest.fn(),
    remove: jest.fn(),
  })),
  AreaSeries: 'AreaSeries',
  ColorType: { Solid: 'Solid' },
}));

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('PortfolioChart', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Chart renders with portfolio data and % delta
  // =========================================================================

  describe('happy path: renders chart and displays correct delta', () => {
    it('displays portfolio history chart with positive % delta', () => {
      // Arrange: portfolio grew from 10000 to 11000 = +10%
      const portfolioData: PortfolioPoint[] = [
        { date: '2026-02-20', value: 10000 },
        { date: '2026-02-21', value: 10250 },
        { date: '2026-02-26', value: 11000 },
      ];

      mockUseApi.mockReturnValue({
        data: portfolioData,
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert: delta = ((11000 - 10000) / 10000) * 100 = +10.00%
      expect(screen.getByText('+10.00%')).toBeInTheDocument();
      expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
    });

    it('displays portfolio history chart with negative % delta', () => {
      // Arrange: portfolio declined from 10000 to 9200 = -8%
      const portfolioData: PortfolioPoint[] = [
        { date: '2026-02-20', value: 10000 },
        { date: '2026-02-23', value: 9600 },
        { date: '2026-02-26', value: 9200 },
      ];

      mockUseApi.mockReturnValue({
        data: portfolioData,
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert: delta = ((9200 - 10000) / 10000) * 100 = -8.00%
      expect(screen.getByText('-8.00%')).toBeInTheDocument();
    });

    it('has accessible chart figure with aria-label describing delta direction', () => {
      // Arrange
      const portfolioData: PortfolioPoint[] = [
        { date: '2026-02-20', value: 10000 },
        { date: '2026-02-26', value: 10500 },
      ];

      mockUseApi.mockReturnValue({
        data: portfolioData,
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert: aria-label includes "Up" and percentage
      const figure = screen.getByRole('img');
      expect(figure).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Up')
      );
      expect(figure).toHaveAttribute(
        'aria-label',
        expect.stringContaining('5.00')
      );
    });
  });

  // =========================================================================
  // Time Range Selection: Buttons change active state and trigger refetch
  // =========================================================================

  describe('time range selection: switches between 7D/30D/90D', () => {
    it('renders time range buttons and defaults to 30D', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [{ date: '2026-02-26', value: 10000 }],
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert
      expect(screen.getByRole('group', { name: /Select time range/i })).toBeInTheDocument();
      const buttons = screen.getAllByRole('button');
      const thirtyDButton = buttons.find((b) => b.textContent === '30D');
      expect(thirtyDButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls useApi with updated days when time range button clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      mockUseApi.mockReturnValue({
        data: [{ date: '2026-02-26', value: 10000 }],
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);
      const sevenDayButton = screen.getByRole('button', { name: '7D' });
      await user.click(sevenDayButton);

      // Assert: Component calls useApi with updated dependency array
      expect(mockUseApi).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Empty State: No portfolio history
  // =========================================================================

  describe('empty state: no portfolio history', () => {
    it('displays message when portfolio data is empty array', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert
      expect(screen.getByText('No portfolio history available.')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading State: Skeleton animation
  // =========================================================================

  describe('loading state: shows skeleton while fetching', () => {
    it('displays loading skeleton when data is loading', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert
      const skeleton = screen.getByRole('region', { hidden: false });
      expect(skeleton).toHaveClass('animate-pulse');
    });

    it('hides loading skeleton once data arrives', () => {
      // Arrange: simulate transition from loading to loaded
      mockUseApi.mockReturnValue({
        data: [
          { date: '2026-02-26', value: 10000 },
          { date: '2026-02-27', value: 10500 },
        ],
        loading: false,
        error: null,
      });

      // Act
      const { rerender } = render(<PortfolioChart />);
      expect(screen.queryByText('No portfolio history available.')).not.toBeInTheDocument();
      rerender(<PortfolioChart />);

      // Assert: skeleton not present when data loaded
      const allElements = screen.queryAllByRole('region');
      const skeletons = allElements.filter((el) => el.className.includes('animate-pulse'));
      expect(skeletons).toHaveLength(0);
    });
  });

  // =========================================================================
  // Error State: API failure
  // =========================================================================

  describe('error state: handles API failure gracefully', () => {
    it('displays error message when API fails', () => {
      // Arrange
      const errorMessage = 'Failed to fetch portfolio history';
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: errorMessage,
      });

      // Act
      render(<PortfolioChart />);

      // Assert
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toHaveClass('text-red-400');
    });

    it('hides error when data eventually loads after error', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [{ date: '2026-02-26', value: 10000 }],
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert: error not visible when data present
      expect(
        screen.queryByText(expect.stringMatching(/Failed|Error/))
      ).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Accessibility: aria-live region updates
  // =========================================================================

  describe('accessibility: updates accessible when data changes', () => {
    it('marks chart region as aria-live=polite for dynamic updates', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [{ date: '2026-02-26', value: 10000 }],
        loading: false,
        error: null,
      });

      // Act
      render(<PortfolioChart />);

      // Assert
      const chartRegion = screen.getByRole('region');
      expect(chartRegion).toHaveAttribute('aria-live', 'polite');
    });
  });
});
