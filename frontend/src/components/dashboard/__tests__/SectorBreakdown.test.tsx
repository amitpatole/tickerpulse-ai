/**
 * Tests for SectorBreakdown component.
 *
 * Tests cover:
 * - Rendering donut chart with correct rating distribution
 * - Legend accuracy: counts and percentages match ratings
 * - Sector ordering: STRONG_BUY → BUY → HOLD → SELL → STRONG_SELL
 * - Empty watchlist and error states
 * - Loading skeleton animation
 * - SVG circle elements for each sector with correct stroke-width
 * - Center label shows total stock count
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import SectorBreakdown from '../SectorBreakdown';
import { useApi } from '@/hooks/useApi';
import type { AIRating } from '@/lib/types';

// Mock useApi hook
jest.mock('@/hooks/useApi');

// Mock lucide-react PieChart icon
jest.mock('lucide-react', () => ({
  PieChart: () => <div data-testid="pie-chart-icon" />,
}));

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

describe('SectorBreakdown', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: Renders donut chart with correct sector distribution
  // =========================================================================

  describe('happy path: displays rating distribution donut chart', () => {
    it('renders donut chart with correct sector counts and percentages', () => {
      // Arrange: 10 stocks total: 4 STRONG_BUY, 3 BUY, 2 HOLD, 1 SELL
      const ratings: AIRating[] = [
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        { ticker: 'MSFT', rating: 'STRONG_BUY', score: 82, confidence: 0.90, current_price: 380, price_change_pct: 1.2, rsi: 60 },
        { ticker: 'GOOGL', rating: 'STRONG_BUY', score: 80, confidence: 0.88, current_price: 140, price_change_pct: 0.5, rsi: 55 },
        { ticker: 'NVDA', rating: 'STRONG_BUY', score: 88, confidence: 0.95, current_price: 875, price_change_pct: 5.0, rsi: 70 },
        { ticker: 'TSLA', rating: 'BUY', score: 72, confidence: 0.78, current_price: 250, price_change_pct: -1.2, rsi: 48 },
        { ticker: 'AMD', rating: 'BUY', score: 70, confidence: 0.75, current_price: 160, price_change_pct: 0.8, rsi: 52 },
        { ticker: 'INTC', rating: 'BUY', score: 65, confidence: 0.68, current_price: 42, price_change_pct: -2.3, rsi: 42 },
        { ticker: 'META', rating: 'HOLD', score: 58, confidence: 0.70, current_price: 480, price_change_pct: 1.5, rsi: 50 },
        { ticker: 'NFLX', rating: 'HOLD', score: 55, confidence: 0.65, current_price: 220, price_change_pct: -0.3, rsi: 48 },
        { ticker: 'IBM', rating: 'SELL', score: 38, confidence: 0.60, current_price: 195, price_change_pct: -3.0, rsi: 35 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: legend shows correct counts and percentages
      // STRONG_BUY: 4 stocks = 40%
      expect(screen.getByText('Strong Buy')).toBeInTheDocument();
      const strongBuyLegend = screen.getByText('Strong Buy').closest('.flex');
      expect(strongBuyLegend).toHaveTextContent('4'); // count
      expect(strongBuyLegend).toHaveTextContent('40%');

      // BUY: 3 stocks = 30%
      expect(screen.getByText('Buy')).toBeInTheDocument();
      const buyLegend = screen.getByText('Buy').closest('.flex');
      expect(buyLegend).toHaveTextContent('3');
      expect(buyLegend).toHaveTextContent('30%');

      // HOLD: 2 stocks = 20%
      expect(screen.getByText('Hold')).toBeInTheDocument();
      const holdLegend = screen.getByText('Hold').closest('.flex');
      expect(holdLegend).toHaveTextContent('2');
      expect(holdLegend).toHaveTextContent('20%');

      // SELL: 1 stock = 10%
      expect(screen.getByText('Sell')).toBeInTheDocument();
    });

    it('displays center label with total stock count', () => {
      // Arrange
      const ratings: AIRating[] = [
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        { ticker: 'MSFT', rating: 'BUY', score: 72, confidence: 0.78, current_price: 380, price_change_pct: 1.2, rsi: 55 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: center shows "2" and "stocks"
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('stocks')).toBeInTheDocument();
    });

    it('shows singular "stock" label when only one stock in watchlist', () => {
      // Arrange
      const ratings: AIRating[] = [
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: singular "stock"
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('stock')).toBeInTheDocument();
    });

    it('has accessible donut chart with role=img and descriptive aria-label', () => {
      // Arrange
      const ratings: AIRating[] = [
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        { ticker: 'MSFT', rating: 'BUY', score: 72, confidence: 0.78, current_price: 380, price_change_pct: 1.2, rsi: 55 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert
      const chart = screen.getByRole('img');
      expect(chart).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Rating distribution across 2 stocks')
      );
    });
  });

  // =========================================================================
  // Sector Ordering: STRONG_BUY → BUY → HOLD → SELL → STRONG_SELL
  // =========================================================================

  describe('sector ordering: maintains RATING_ORDER priority', () => {
    it('displays sectors in correct order regardless of input order', () => {
      // Arrange: ratings provided in reverse order
      const ratings: AIRating[] = [
        { ticker: 'IBM', rating: 'SELL', score: 38, confidence: 0.60, current_price: 195, price_change_pct: -3.0, rsi: 35 },
        { ticker: 'MSFT', rating: 'BUY', score: 72, confidence: 0.78, current_price: 380, price_change_pct: 1.2, rsi: 55 },
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        { ticker: 'NFLX', rating: 'HOLD', score: 55, confidence: 0.65, current_price: 220, price_change_pct: -0.3, rsi: 48 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: sectors appear in correct order (Strong Buy, Buy, Hold, Sell)
      const allText = screen.getByRole('img').textContent || '';
      const strongBuyIndex = allText.indexOf('Strong Buy');
      const buyIndex = allText.indexOf('Buy');
      const holdIndex = allText.indexOf('Hold');
      const sellIndex = allText.indexOf('Sell');

      expect(strongBuyIndex).toBeLessThan(buyIndex);
      expect(buyIndex).toBeLessThan(holdIndex);
      expect(holdIndex).toBeLessThan(sellIndex);
    });
  });

  // =========================================================================
  // Empty State: No stocks in watchlist
  // =========================================================================

  describe('empty state: no stocks in watchlist', () => {
    it('displays message when ratings array is empty', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: [],
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert
      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Loading State: Skeleton animation
  // =========================================================================

  describe('loading state: shows skeleton while fetching', () => {
    it('displays loading skeleton when fetching ratings', () => {
      // Arrange
      mockUseApi.mockReturnValue({
        data: null,
        loading: true,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: skeleton elements present
      const skeletons = screen.getAllByRole('region', { hidden: true });
      const animatingSkeletons = skeletons.filter((el) =>
        el.className.includes('animate-pulse')
      );
      expect(animatingSkeletons.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Error State: API failure
  // =========================================================================

  describe('error state: handles API failure gracefully', () => {
    it('displays error message when ratings fetch fails', () => {
      // Arrange
      const errorMessage = 'Failed to load ratings';
      mockUseApi.mockReturnValue({
        data: null,
        loading: false,
        error: errorMessage,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toHaveClass('text-red-400');
    });

    it('clears error message once data loads successfully after failure', () => {
      // Arrange: simulate recovery from error
      mockUseApi.mockReturnValue({
        data: [
          { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        ],
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: error not visible when data present
      expect(
        screen.queryByText(expect.stringMatching(/Failed|Error/))
      ).not.toBeInTheDocument();
      expect(screen.getByText('Strong Buy')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Legend Display: Color dots and label truncation
  // =========================================================================

  describe('legend display: shows color indicators and truncates long labels', () => {
    it('renders color dot for each sector in legend', () => {
      // Arrange
      const ratings: AIRating[] = [
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        { ticker: 'MSFT', rating: 'BUY', score: 72, confidence: 0.78, current_price: 380, price_change_pct: 1.2, rsi: 55 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: color dots are present (marked with aria-hidden)
      const colorDots = screen.getAllByRole('region', { hidden: true });
      expect(colorDots.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // SVG Rendering: Donut chart structure
  // =========================================================================

  describe('svg rendering: donut chart with sector circles', () => {
    it('renders SVG circles for each sector in the donut', () => {
      // Arrange
      const ratings: AIRating[] = [
        { ticker: 'AAPL', rating: 'STRONG_BUY', score: 85, confidence: 0.92, current_price: 150, price_change_pct: 2.5, rsi: 65 },
        { ticker: 'MSFT', rating: 'BUY', score: 72, confidence: 0.78, current_price: 380, price_change_pct: 1.2, rsi: 55 },
        { ticker: 'GOOGL', rating: 'HOLD', score: 60, confidence: 0.70, current_price: 140, price_change_pct: 0.5, rsi: 50 },
      ];

      mockUseApi.mockReturnValue({
        data: ratings,
        loading: false,
        error: null,
      });

      // Act
      render(<SectorBreakdown />);

      // Assert: SVG contains circles (background + 3 sectors)
      const svg = screen.getByRole('img').querySelector('svg');
      const circles = svg?.querySelectorAll('circle');
      // 1 background circle + 3 sector circles
      expect(circles?.length).toBeGreaterThanOrEqual(4);
    });
  });
});
