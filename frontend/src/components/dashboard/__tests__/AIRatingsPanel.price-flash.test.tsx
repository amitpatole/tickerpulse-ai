/**
 * Tests for AIRatingsPanel price flash animation and sort stability.
 *
 * Focus areas:
 * - Price updates trigger flash animation
 * - Flash animation clears after 800ms
 * - Price updates DO NOT cause re-sort (sort order is stable)
 * - Multiple rapid price updates handled gracefully
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIRatingsPanel from '../AIRatingsPanel';
import type { AIRating } from '@/lib/types';

// Mock next/link
jest.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Brain: () => <div data-testid="brain-icon" />,
}));

describe('AIRatingsPanel — Price Flash & Sort Stability', () => {
  // =========================================================================
  // Test Data: Ratings in score order (85, 72, 55, 35)
  // =========================================================================

  const mockRatings: AIRating[] = [
    {
      ticker: 'AAPL',
      rating: 'STRONG_BUY',
      score: 85,
      confidence: 0.92,
      current_price: 150.25,
      price_change_pct: 2.5,
      rsi: 65,
    },
    {
      ticker: 'TSLA',
      rating: 'BUY',
      score: 72,
      confidence: 0.78,
      current_price: 250.0,
      price_change_pct: -1.2,
      rsi: 45,
    },
    {
      ticker: 'MSFT',
      rating: 'HOLD',
      score: 55,
      confidence: 0.65,
      current_price: 380.0,
      price_change_pct: 0.5,
      rsi: 50,
    },
    {
      ticker: 'GOOGL',
      rating: 'SELL',
      score: 35,
      confidence: 0.71,
      current_price: 140.0,
      price_change_pct: -3.1,
      rsi: 28,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Price Flash Animation: Triggers on price change
  // =========================================================================

  describe('price flash animation: visual feedback on price updates', () => {
    it('applies animate-price-flash class when price changes', async () => {
      // Arrange
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Act: update AAPL price from 150.25 to 152.0
      const updatedRatings: AIRating[] = [
        { ...mockRatings[0], current_price: 152.0 }, // changed
        mockRatings[1],
        mockRatings[2],
        mockRatings[3],
      ];
      rerender(<AIRatingsPanel ratings={updatedRatings} />);

      // Assert: flash class applied to AAPL price
      await waitFor(() => {
        const allSpans = screen.getAllByText('$152.00');
        const flashedPrice = allSpans[0]; // Should be first occurrence (AAPL)
        expect(flashedPrice.className).toContain('animate-price-flash');
      });
    });

    it('removes flash class after 800ms', async () => {
      // Arrange
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Act: trigger price change
      const updated: AIRating[] = [
        { ...mockRatings[0], current_price: 155.0 },
        mockRatings[1],
        mockRatings[2],
        mockRatings[3],
      ];
      rerender(<AIRatingsPanel ratings={updated} />);

      // Assert: flash exists initially
      await waitFor(() => {
        const flashed = screen.getAllByText('$155.00');
        expect(flashed[0].className).toContain('animate-price-flash');
      });

      // Act: wait for animation to clear
      await waitFor(
        () => {
          const notFlashed = screen.getAllByText('$155.00');
          expect(notFlashed[0].className).not.toContain('animate-price-flash');
        },
        { timeout: 1000 }
      );
    });

    it('does not flash on initial render', () => {
      // Arrange & Act
      render(<AIRatingsPanel ratings={mockRatings} />);

      // Assert: no flash class on mount
      const priceSpans = screen.getAllByText(/\$/);
      priceSpans.forEach((span) => {
        expect(span.className).not.toContain('animate-price-flash');
      });
    });

    it('flashes multiple tickers independently when their prices change', async () => {
      // Arrange
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Act: update both AAPL and TSLA prices
      const updated: AIRating[] = [
        { ...mockRatings[0], current_price: 151.0 }, // AAPL changed
        { ...mockRatings[1], current_price: 251.0 }, // TSLA changed
        mockRatings[2],
        mockRatings[3],
      ];
      rerender(<AIRatingsPanel ratings={updated} />);

      // Assert: both prices are flashing
      await waitFor(() => {
        const aapl = screen.getAllByText('$151.00');
        const tsla = screen.getAllByText('$251.00');
        expect(aapl[0].className).toContain('animate-price-flash');
        expect(tsla[0].className).toContain('animate-price-flash');
      });
    });
  });

  // =========================================================================
  // Sort Stability: Price updates do not re-sort
  // =========================================================================

  describe('sort stability: price updates preserve sort order', () => {
    it('keeps sort order stable when price updates are applied', async () => {
      // Arrange: sort by score (default)
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Assert: initial sort order (85, 72, 55, 35)
      let rows = screen.getAllByRole('link', { name: /AAPL|TSLA|MSFT|GOOGL/ });
      expect(rows[0]).toHaveTextContent('AAPL');
      expect(rows[1]).toHaveTextContent('TSLA');
      expect(rows[2]).toHaveTextContent('MSFT');
      expect(rows[3]).toHaveTextContent('GOOGL');

      // Act: update GOOGL price (lowest score) — it should NOT move up
      const updated: AIRating[] = [
        mockRatings[0],
        mockRatings[1],
        mockRatings[2],
        { ...mockRatings[3], current_price: 500.0 }, // big price change
      ];
      rerender(<AIRatingsPanel ratings={updated} />);

      // Assert: GOOGL still in 4th position (sorted by score, not price)
      await waitFor(() => {
        rows = screen.getAllByRole('link', { name: /AAPL|TSLA|MSFT|GOOGL/ });
        expect(rows[0]).toHaveTextContent('AAPL');
        expect(rows[1]).toHaveTextContent('TSLA');
        expect(rows[2]).toHaveTextContent('MSFT');
        expect(rows[3]).toHaveTextContent('GOOGL');
      });
    });

    it('preserves sort when switching sort keys and prices update', async () => {
      // Arrange
      const user = userEvent.setup();
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Act: switch to confidence sort
      const confidenceBtn = screen.getByRole('button', { name: 'Confidence' });
      await user.click(confidenceBtn);

      // Assert: sorted by confidence (0.92, 0.78, 0.71, 0.65)
      await waitFor(() => {
        const rows = screen.getAllByRole('link', { name: /AAPL|TSLA|MSFT|GOOGL/ });
        expect(rows[0]).toHaveTextContent('AAPL'); // 0.92
        expect(rows[1]).toHaveTextContent('TSLA'); // 0.78
        expect(rows[2]).toHaveTextContent('GOOGL'); // 0.71
        expect(rows[3]).toHaveTextContent('MSFT'); // 0.65
      });

      // Act: update a price
      const updated: AIRating[] = [
        { ...mockRatings[0], current_price: 200.0 },
        mockRatings[1],
        mockRatings[2],
        mockRatings[3],
      ];
      rerender(<AIRatingsPanel ratings={updated} />);

      // Assert: confidence sort order preserved
      await waitFor(() => {
        const rows = screen.getAllByRole('link', { name: /AAPL|TSLA|MSFT|GOOGL/ });
        expect(rows[0]).toHaveTextContent('AAPL');
        expect(rows[1]).toHaveTextContent('TSLA');
        expect(rows[2]).toHaveTextContent('GOOGL');
        expect(rows[3]).toHaveTextContent('MSFT');
      });
    });
  });

  // =========================================================================
  // Edge Cases: Rapid updates and cleanup
  // =========================================================================

  describe('edge cases: rapid price updates and cleanup', () => {
    it('handles multiple rapid price updates without errors', async () => {
      // Arrange
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Act: simulate rapid price updates
      for (let i = 0; i < 10; i++) {
        const updated: AIRating[] = mockRatings.map((r) => ({
          ...r,
          current_price: (r.current_price ?? 0) + i * 0.1,
        }));
        rerender(<AIRatingsPanel ratings={updated} />);
      }

      // Assert: component still renders without errors
      expect(screen.getByText('AI Ratings')).toBeInTheDocument();
      expect(screen.getAllByRole('link').length).toBe(mockRatings.length);
    });

    it('cleans up flash timers on unmount', () => {
      // Arrange: spy on clearTimeout
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Act: render and unmount while flash active
      const { unmount, rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Trigger price change to create timer
      const updated: AIRating[] = [
        { ...mockRatings[0], current_price: 160.0 },
        mockRatings[1],
        mockRatings[2],
        mockRatings[3],
      ];
      rerender(<AIRatingsPanel ratings={updated} />);

      unmount();

      // Assert: timers were cleaned up
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('handles null price in updated ratings gracefully', async () => {
      // Arrange: price is null instead of number
      const withNullPrice: AIRating[] = [
        { ...mockRatings[0], current_price: null },
        mockRatings[1],
        mockRatings[2],
        mockRatings[3],
      ];

      // Act & Assert: should render without crashing
      render(<AIRatingsPanel ratings={withNullPrice} />);
      expect(screen.getByText('AI Ratings')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument(); // null price displays as dash
    });
  });

  // =========================================================================
  // Integration: Price flash + sort interaction
  // =========================================================================

  describe('integration: price flash with sort changes', () => {
    it('flashing price does not cause re-sort when toggling sort keys', async () => {
      // Arrange
      const user = userEvent.setup();
      const { rerender } = render(
        <AIRatingsPanel ratings={mockRatings} />
      );

      // Act: change to % Change sort
      const changeBtn = screen.getByRole('button', { name: '% Change' });
      await user.click(changeBtn);

      // Assert: sorted by price change (2.5, 0.5, -1.2, -3.1)
      await waitFor(() => {
        const rows = screen.getAllByRole('link', { name: /AAPL|TSLA|MSFT|GOOGL/ });
        expect(rows[0]).toHaveTextContent('AAPL'); // 2.5
        expect(rows[1]).toHaveTextContent('MSFT'); // 0.5
        expect(rows[2]).toHaveTextContent('TSLA'); // -1.2
        expect(rows[3]).toHaveTextContent('GOOGL'); // -3.1
      });

      // Act: update a price while in % Change sort
      const updated: AIRating[] = [
        { ...mockRatings[0], current_price: 200.0 }, // AAPL price changes
        mockRatings[1],
        mockRatings[2],
        mockRatings[3],
      ];
      rerender(<AIRatingsPanel ratings={updated} />);

      // Assert: % Change order is preserved (price update doesn't trigger re-sort)
      await waitFor(() => {
        const rows = screen.getAllByRole('link', { name: /AAPL|TSLA|MSFT|GOOGL/ });
        expect(rows[0]).toHaveTextContent('AAPL');
        expect(rows[1]).toHaveTextContent('MSFT');
        expect(rows[2]).toHaveTextContent('TSLA');
        expect(rows[3]).toHaveTextContent('GOOGL');
      });
    });
  });
});