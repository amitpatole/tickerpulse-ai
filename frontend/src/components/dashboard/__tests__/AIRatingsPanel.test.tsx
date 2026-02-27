/**
 * Tests for AIRatingsPanel component.
 *
 * All data flows in via the `ratings` prop from useDashboardData — no hook
 * self-fetch.  Tests cover:
 * - Rendering ratings list with all columns visible
 * - Sorting by different columns (score, confidence, price change)
 * - Loading state when ratings prop is null
 * - Empty state when ratings is an empty array
 * - Ticker links navigate to /stocks/[ticker]
 * - Score bar accessibility with role="meter"
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
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

// Mock lucide-react Brain icon
jest.mock('lucide-react', () => ({
  Brain: () => <div data-testid="brain-icon" />,
}));

describe('AIRatingsPanel', () => {
  // =========================================================================
  // Test Data: Mock Ratings
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
  // Happy Path: Renders list with all columns visible
  // =========================================================================

  describe('happy path: renders ratings list with correct columns', () => {
    it('displays header and all rating data in columns', () => {
      // Arrange & Act
      render(<AIRatingsPanel ratings={mockRatings} />);

      // Assert: header
      expect(screen.getByText('AI Ratings')).toBeInTheDocument();
      expect(screen.getByTestId('brain-icon')).toBeInTheDocument();

      // Assert: column headers
      expect(screen.getByText('Ticker')).toBeInTheDocument();
      expect(screen.getByText('AI Score')).toBeInTheDocument();
      expect(screen.getByText('Conf.')).toBeInTheDocument();
      expect(screen.getByText('Chg %')).toBeInTheDocument();

      // Assert: ticker data
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();

      // Assert: score values
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText('72')).toBeInTheDocument();
      expect(screen.getByText('55')).toBeInTheDocument();
      expect(screen.getByText('35')).toBeInTheDocument();

      // Assert: confidence percentages
      expect(screen.getByText('92%')).toBeInTheDocument();
      expect(screen.getByText('78%')).toBeInTheDocument();

      // Assert: price changes with correct signs
      expect(screen.getByText('+2.50%')).toBeInTheDocument();
      expect(screen.getByText('-1.20%')).toBeInTheDocument();
    });

    it('sorts by score descending by default (highest score first)', () => {
      // Arrange & Act
      render(<AIRatingsPanel ratings={mockRatings} />);

      // Assert: tickers should appear in score order (85, 72, 55, 35)
      const tickers = screen.getAllByText(/^(AAPL|TSLA|MSFT|GOOGL)$/);
      expect(tickers[0]).toHaveTextContent('AAPL'); // score 85
      expect(tickers[1]).toHaveTextContent('TSLA'); // score 72
      expect(tickers[2]).toHaveTextContent('MSFT'); // score 55
      expect(tickers[3]).toHaveTextContent('GOOGL'); // score 35
    });
  });

  // =========================================================================
  // Sorting: Reorders list when sort button clicked
  // =========================================================================

  describe('sorting: reorders list when sort button clicked', () => {
    it('reorders by confidence when Confidence button clicked', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act: render and click confidence sort
      render(<AIRatingsPanel ratings={mockRatings} />);
      const confidenceBtn = screen.getByRole('button', { name: 'Confidence' });
      await user.click(confidenceBtn);

      // Assert: should sort by confidence descending (0.92, 0.78, 0.71, 0.65)
      const tickers = screen.getAllByText(/^(AAPL|TSLA|MSFT|GOOGL)$/);
      expect(tickers[0]).toHaveTextContent('AAPL');  // confidence 0.92
      expect(tickers[1]).toHaveTextContent('TSLA');  // confidence 0.78
      expect(tickers[2]).toHaveTextContent('GOOGL'); // confidence 0.71
      expect(tickers[3]).toHaveTextContent('MSFT');  // confidence 0.65
    });

    it('reorders by price change when % Change button clicked', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      render(<AIRatingsPanel ratings={mockRatings} />);
      const changeBtn = screen.getByRole('button', { name: '% Change' });
      await user.click(changeBtn);

      // Assert: should sort by price change descending (2.5, 0.5, -1.2, -3.1)
      const tickers = screen.getAllByText(/^(AAPL|TSLA|MSFT|GOOGL)$/);
      expect(tickers[0]).toHaveTextContent('AAPL');  // price_change_pct: 2.5
      expect(tickers[1]).toHaveTextContent('MSFT');  // price_change_pct: 0.5
      expect(tickers[2]).toHaveTextContent('TSLA');  // price_change_pct: -1.2
      expect(tickers[3]).toHaveTextContent('GOOGL'); // price_change_pct: -3.1
    });
  });

  // =========================================================================
  // Loading State: null ratings prop
  // =========================================================================

  describe('loading state: null ratings prop', () => {
    it('shows skeleton while loading (ratings is null)', () => {
      render(<AIRatingsPanel ratings={null} />);

      const skeletons = screen.getAllByRole('generic');
      const pulseElements = skeletons.filter((el) =>
        el.className?.includes('animate-pulse')
      );
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('does not show column headers or rating rows in loading state', () => {
      render(<AIRatingsPanel ratings={null} />);

      expect(screen.queryByText('Ticker')).not.toBeInTheDocument();
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    });

    it('sets aria-busy when loading', () => {
      const { container } = render(<AIRatingsPanel ratings={null} />);
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toHaveAttribute('aria-busy', 'true');
    });
  });

  // =========================================================================
  // Edge Cases: Empty state
  // =========================================================================

  describe('edge cases: empty state', () => {
    it('shows "No stocks in watchlist" when ratings array is empty', () => {
      render(<AIRatingsPanel ratings={[]} />);

      expect(screen.getByText('No stocks in watchlist.')).toBeInTheDocument();
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    });

    it('does not show column headers when watchlist is empty', () => {
      render(<AIRatingsPanel ratings={[]} />);
      expect(screen.queryByText('Ticker')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Drill-down: Ticker links navigate to stock detail
  // =========================================================================

  describe('drill-down: ticker links navigate to stock detail page', () => {
    it('renders ticker as a link to /stocks/[ticker]', () => {
      // Arrange
      render(<AIRatingsPanel ratings={[mockRatings[0]]} />);

      // Assert: the ticker text is an anchor linking to the detail page
      const tickerLink = screen.getByRole('link', { name: 'AAPL' });
      expect(tickerLink).toHaveAttribute('href', '/stocks/AAPL');
    });

    it('renders a separate link for each ticker in the list', () => {
      // Arrange
      render(<AIRatingsPanel ratings={mockRatings} />);

      // Assert: one link per ticker
      const links = screen.getAllByRole('link');
      expect(links.length).toBe(mockRatings.length);
      expect(links.some((l) => l.getAttribute('href') === '/stocks/AAPL')).toBe(true);
      expect(links.some((l) => l.getAttribute('href') === '/stocks/TSLA')).toBe(true);
    });
  });

  // =========================================================================
  // Accessibility: Meter role and aria attributes
  // =========================================================================

  describe('accessibility: score bar with role="meter"', () => {
    it('renders meter elements with correct aria attributes', () => {
      // Arrange
      render(<AIRatingsPanel ratings={mockRatings} />);

      // Assert: find meter elements
      const meters = screen.getAllByRole('meter');
      expect(meters.length).toBeGreaterThan(0);

      // Assert: first meter (AAPL, score 85) has correct attributes
      const firstMeter = meters[0];
      expect(firstMeter).toHaveAttribute('aria-valuenow', '85');
      expect(firstMeter).toHaveAttribute('aria-valuemin', '0');
      expect(firstMeter).toHaveAttribute('aria-valuemax', '100');
      expect(firstMeter).toHaveAttribute('aria-label', 'AI score: 85 out of 100');
    });
  });
});
