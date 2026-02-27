/**
 * Tests for FinancialsCard component.
 *
 * Tests cover:
 * - Happy path: All extended financials fields display with correct formatting
 * - Extended fields: dividend_yield, beta, avg_volume, book_value render when present
 * - Edge cases: Null/undefined fields, missing data, zero values
 * - Formatting: Large numbers, percentages, volumes formatted correctly
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import FinancialsCard from '../FinancialsCard';
import type { StockDetailQuote } from '@/lib/types';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  BarChart2: () => <span data-testid="icon-chart">📊</span>,
}));

describe('FinancialsCard', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  const baseQuote: StockDetailQuote = {
    price: 150,
    change_pct: 2.5,
    volume: 5000000,
    name: 'Test Stock Inc.',
    currency: 'USD',
  };

  // =========================================================================
  // Happy Path: All fields present and properly formatted
  // =========================================================================

  describe('happy path: renders all financials with correct formatting', () => {
    it('displays volume in millions when >= 1M', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        volume: 5_000_000,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('5.0M')).toBeInTheDocument();
    });

    it('displays market cap in trillions, billions, or millions', () => {
      // Arrange: Market cap = 2.5 trillion
      const quote: StockDetailQuote = {
        ...baseQuote,
        market_cap: 2_500_000_000_000,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('$2.50T')).toBeInTheDocument();
    });

    it('displays P/E ratio with 1 decimal place', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        pe_ratio: 25.567,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('25.6')).toBeInTheDocument();
    });

    it('displays 52-week range as "low – high"', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        week_52_low: 130.5,
        week_52_high: 165.75,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert: Format is "130.50 – 165.75"
      expect(screen.getByText('130.50 – 165.75')).toBeInTheDocument();
    });

    it('displays currency code when not USD', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        currency: 'GBP',
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('GBP')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Extended Financials Fields (New Acceptance Criteria)
  // =========================================================================

  describe('extended fields: dividend yield, beta, avg volume, book value', () => {
    it('renders dividend yield as percentage when present', () => {
      // Arrange: Stock with 2.75% dividend yield
      const quote: StockDetailQuote = {
        ...baseQuote,
        dividend_yield: 2.75,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('Dividend Yield')).toBeInTheDocument();
      expect(screen.getByText('2.75%')).toBeInTheDocument();
    });

    it('renders beta value with 2 decimal places', () => {
      // Arrange: Beta = 1.35 (moderate volatility)
      const quote: StockDetailQuote = {
        ...baseQuote,
        beta: 1.35,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.getByText('1.35')).toBeInTheDocument();
    });

    it('renders avg volume formatted as millions or thousands', () => {
      // Arrange: Average volume = 4.2 million
      const quote: StockDetailQuote = {
        ...baseQuote,
        avg_volume: 4_200_000,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('Average Volume')).toBeInTheDocument();
      expect(screen.getByText('4.2M')).toBeInTheDocument();
    });

    it('renders book value as formatted currency', () => {
      // Arrange: Book value = $145.50
      const quote: StockDetailQuote = {
        ...baseQuote,
        book_value: 145.5,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('Book Value')).toBeInTheDocument();
      expect(screen.getByText('$145.50')).toBeInTheDocument();
    });

    it('displays all extended fields together in premium data scenario', () => {
      // Arrange: Complete quote with all new fields
      const quote: StockDetailQuote = {
        ...baseQuote,
        market_cap: 3_000_000_000_000,
        pe_ratio: 22,
        eps: 6.82,
        week_52_high: 160,
        week_52_low: 130,
        dividend_yield: 2.5,
        beta: 1.2,
        avg_volume: 4_500_000,
        book_value: 140,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert: All labels present
      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('Market Cap')).toBeInTheDocument();
      expect(screen.getByText('P/E Ratio (TTM)')).toBeInTheDocument();
      expect(screen.getByText('EPS (TTM)')).toBeInTheDocument();
      expect(screen.getByText('52W Range')).toBeInTheDocument();
      expect(screen.getByText('Dividend Yield')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.getByText('Average Volume')).toBeInTheDocument();
      expect(screen.getByText('Book Value')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Edge Cases: Null fields, missing data, boundary values
  // =========================================================================

  describe('edge cases: handles null values and missing optional fields', () => {
    it('omits dividend yield row when field is null', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        dividend_yield: null,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert: Row not rendered
      expect(screen.queryByText('Dividend Yield')).not.toBeInTheDocument();
    });

    it('omits dividend yield row when field is undefined', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        dividend_yield: undefined,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      expect(screen.queryByText('Dividend Yield')).not.toBeInTheDocument();
    });

    it('renders beta of 1.0 (market correlation) correctly', () => {
      // Arrange: Beta = 1.0 means stock moves with market
      const quote: StockDetailQuote = {
        ...baseQuote,
        beta: 1.0,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('1.00')).toBeInTheDocument();
    });

    it('renders zero dividend yield when stock pays no dividend', () => {
      // Arrange: No dividend
      const quote: StockDetailQuote = {
        ...baseQuote,
        dividend_yield: 0,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert: Zero value displays as 0%
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('renders small avg volume < 1K with full number', () => {
      // Arrange: Thinly traded stock
      const quote: StockDetailQuote = {
        ...baseQuote,
        avg_volume: 500,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('500')).toBeInTheDocument();
    });

    it('handles book value of 0.5 correctly', () => {
      render(
        <FinancialsCard quote={{ ...baseQuote, book_value: 0.5 }} />,
      );
      expect(screen.getByText('$0.50')).toBeInTheDocument();
    });

    it('renders only volume and currency when all optional fields are null', () => {
      // Arrange: Minimal quote
      const quote: StockDetailQuote = {
        ...baseQuote,
        market_cap: null,
        pe_ratio: null,
        eps: null,
        week_52_high: null,
        week_52_low: null,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert: Volume always displays
      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('5.0M')).toBeInTheDocument();

      // Optional fields not shown
      expect(screen.queryByText('Market Cap')).not.toBeInTheDocument();
      expect(screen.queryByText('P/E Ratio (TTM)')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Formatting Edge Cases
  // =========================================================================

  describe('formatting: handles boundary values and large numbers correctly', () => {
    it('formats mega-cap market cap (> 10T) correctly', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        market_cap: 10_500_000_000_000,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('$10.50T')).toBeInTheDocument();
    });

    it('formats market cap in billions when < 1T', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        market_cap: 500_000_000_000,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('$500.00B')).toBeInTheDocument();
    });

    it('formats volume in thousands when < 1M', () => {
      // Arrange
      const quote: StockDetailQuote = {
        ...baseQuote,
        volume: 500_000,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('500.0K')).toBeInTheDocument();
    });

    it('formats very low beta (e.g., 0.25)', () => {
      // Arrange: Defensive stock
      const quote: StockDetailQuote = {
        ...baseQuote,
        beta: 0.25,
      };

      // Act
      render(<FinancialsCard quote={quote} />);

      // Assert
      expect(screen.getByText('0.25')).toBeInTheDocument();
    });
  });
});
