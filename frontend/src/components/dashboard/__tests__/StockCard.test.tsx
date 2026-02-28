/**
 * Tests for StockCard component.
 *
 * Tests cover:
 * - Happy path: renders ticker, price, change %, rating badge, RSI/sentiment meters, AI score
 * - Drill-down link: ticker name links to /stocks/[ticker]
 * - Price flash: green flash on price increase, red flash on price decrease via SSE re-render
 * - Flash clears after 500ms timeout
 * - Edge case: price=null shows "—"
 * - Edge case: STRONG_SELL badge uses distinct CSS class
 * - Edge case: missing rsi/sentiment_score handled gracefully
 * - Direction icons: TrendingUp / TrendingDown / Minus
 * - Action buttons: shown only when onRemove is provided
 * - Delete modal: opens, confirms with onRemove callback, cancels cleanly
 * - Rename modal: opens, updates display name on confirm
 * - Accessibility: role="meter" with correct aria attributes
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StockCard from '../StockCard';
import type { AIRating } from '@/lib/types';

// ---------------------------------------------------------------------------
// Module Mocks
// ---------------------------------------------------------------------------

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

jest.mock('lucide-react', () => ({
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  TrendingDown: () => <div data-testid="trending-down-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
  X: () => <div data-testid="x-icon" />,
  Pencil: () => <div data-testid="pencil-icon" />,
}));

jest.mock('@/lib/api', () => ({
  addStock: jest.fn().mockResolvedValue(undefined),
}));

// RATING_BG_CLASSES provides CSS class strings keyed by rating name.
// Use distinguishable prefixes so tests can check the right class is applied.
jest.mock('@/lib/types', () => ({
  RATING_BG_CLASSES: {
    STRONG_BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    BUY: 'bg-green-500/20 text-green-400 border-green-500/30',
    HOLD: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
    STRONG_SELL: 'bg-red-900/20 text-red-500 border-red-700/30',
  },
}));

jest.mock('../WatchlistDeleteModal', () => ({
  default: ({
    ticker,
    onConfirm,
    onClose,
  }: {
    ticker: string;
    onConfirm: () => void;
    onClose: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }) => (
    <div data-testid="delete-modal">
      <span>Delete {ticker}</span>
      <button onClick={onConfirm}>Confirm Delete</button>
      <button onClick={onClose}>Cancel Delete</button>
    </div>
  ),
}));

jest.mock('../WatchlistRenameModal', () => ({
  default: ({
    ticker,
    onConfirm,
    onClose,
  }: {
    ticker: string;
    currentName: string;
    onConfirm: (newName: string) => void;
    onClose: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
  }) => (
    <div data-testid="rename-modal">
      <span>Rename {ticker}</span>
      <button onClick={() => onConfirm('New Display Name')}>Confirm Rename</button>
      <button onClick={onClose}>Cancel Rename</button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const mockRating: AIRating = {
  ticker: 'AAPL',
  rating: 'STRONG_BUY',
  score: 85,
  confidence: 0.92,
  current_price: 150.25,
  price_change_pct: 2.5,
  rsi: 65,
  sentiment_score: 0.45,
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('StockCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Happy Path: All data fields rendered
  // =========================================================================

  describe('happy path: renders all data fields', () => {
    it('displays ticker, price, change percentage, and rating badge', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('$150.25')).toBeInTheDocument();
      expect(screen.getByText('+2.50%')).toBeInTheDocument();
      expect(screen.getByText('STRONG BUY')).toBeInTheDocument();
    });

    it('displays confidence percentage inside rating badge', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: confidence 0.92 → 92%
      expect(screen.getByText('92%')).toBeInTheDocument();
    });

    it('displays AI score formatted as X.X/10', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: score 85 → "85.0/10"
      expect(screen.getByText('85.0/10')).toBeInTheDocument();
    });

    it('does not render score section when score is null', () => {
      // Arrange
      const noScore: AIRating = { ...mockRating, score: null as any };

      // Act
      render(<StockCard rating={noScore} />);

      // Assert
      expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
    });

    it('renders RSI and sentiment meters with role="meter"', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: at least 2 meters (RSI + sentiment)
      const meters = screen.getAllByRole('meter');
      expect(meters.length).toBeGreaterThanOrEqual(2);
    });

    it('sets correct aria attributes on RSI meter', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: rsi=65
      const rsiMeter = screen.getByRole('meter', { name: /RSI 65\.0/i });
      expect(rsiMeter).toHaveAttribute('aria-valuenow', '65');
      expect(rsiMeter).toHaveAttribute('aria-valuemin', '0');
      expect(rsiMeter).toHaveAttribute('aria-valuemax', '100');
    });

    it('sets correct aria attributes on sentiment meter', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // sentiment_score 0.45 → sentimentPct = round(((0.45+1)/2)*100) = round(72.5) = 73
      const sentimentMeter = screen.getByRole('meter', { name: /Sentiment score \+0\.45/i });
      expect(sentimentMeter).toHaveAttribute('aria-valuenow', '73');
      expect(sentimentMeter).toHaveAttribute('aria-valuemin', '0');
      expect(sentimentMeter).toHaveAttribute('aria-valuemax', '100');
    });

    it('card has an aria-label describing ticker, price, change and rating', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: the card container carries a descriptive aria-label
      const card = document.querySelector('[aria-label*="AAPL"]');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('$150.25'));
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('+2.50%'));
    });
  });

  // =========================================================================
  // Drill-down Link: Ticker name links to stock detail page
  // =========================================================================

  describe('drill-down link: ticker name navigates to stock detail', () => {
    it('renders the ticker name as a link to /stocks/[ticker]', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: an anchor element links to the stock detail page
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/stocks/AAPL');
    });

    it('link text matches the display name (ticker by default)', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert: the link wraps the ticker/display name
      const link = screen.getByRole('link');
      expect(link).toHaveTextContent('AAPL');
    });
  });

  // =========================================================================
  // Price Flash: Green on up, red on down, clears after 500ms
  // =========================================================================

  describe('price flash: applies and clears flash class on live price updates', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('applies green flash class when price increases (SSE update)', () => {
      // Arrange: initial render establishes baseline price
      const { rerender } = render(<StockCard rating={mockRating} />);

      // Act: simulate SSE price_update with a higher price
      rerender(<StockCard rating={{ ...mockRating, current_price: 155.00 }} />);

      // Assert: price element shows green flash
      const priceEl = screen.getByText('$155.00');
      expect(priceEl).toHaveClass('text-emerald-300');
    });

    it('applies red flash class when price decreases (SSE update)', () => {
      // Arrange
      const { rerender } = render(<StockCard rating={mockRating} />);

      // Act: simulate SSE price_update with a lower price
      rerender(<StockCard rating={{ ...mockRating, current_price: 145.00 }} />);

      // Assert: price element shows red flash
      const priceEl = screen.getByText('$145.00');
      expect(priceEl).toHaveClass('text-red-300');
    });

    it('does not flash on initial render', () => {
      // Act
      render(<StockCard rating={mockRating} />);

      // Assert: no flash class — shows default white
      const priceEl = screen.getByText('$150.25');
      expect(priceEl).not.toHaveClass('text-emerald-300');
      expect(priceEl).not.toHaveClass('text-red-300');
      expect(priceEl).toHaveClass('text-white');
    });

    it('clears flash class after 500ms', () => {
      // Arrange
      const { rerender } = render(<StockCard rating={mockRating} />);
      rerender(<StockCard rating={{ ...mockRating, current_price: 155.00 }} />);

      // Confirm flash is active
      expect(screen.getByText('$155.00')).toHaveClass('text-emerald-300');

      // Act: advance timers past the 500ms clearance
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Assert: flash class removed, back to default white
      expect(screen.getByText('$155.00')).not.toHaveClass('text-emerald-300');
      expect(screen.getByText('$155.00')).toHaveClass('text-white');
    });
  });

  // =========================================================================
  // Edge Cases: Null price, STRONG_SELL, missing fields
  // =========================================================================

  describe('edge cases', () => {
    it('shows "—" when current_price is null', () => {
      // Arrange
      const noPrice: AIRating = { ...mockRating, current_price: null as any };

      // Act
      render(<StockCard rating={noPrice} />);

      // Assert: em-dash placeholder instead of a price
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
    });

    it('aria-label says "price unavailable" when current_price is null', () => {
      // Arrange
      const noPrice: AIRating = { ...mockRating, current_price: null as any };

      // Act
      render(<StockCard rating={noPrice} />);

      // Assert
      const card = document.querySelector('[aria-label*="price unavailable"]');
      expect(card).toBeInTheDocument();
    });

    it('applies STRONG_SELL CSS class from RATING_BG_CLASSES for STRONG_SELL rating', () => {
      // Arrange
      const strongSellRating: AIRating = {
        ...mockRating,
        rating: 'STRONG_SELL',
        price_change_pct: -5.0,
      };

      // Act
      render(<StockCard rating={strongSellRating} />);

      // Assert: badge text
      expect(screen.getByText('STRONG SELL')).toBeInTheDocument();

      // Assert: badge element carries the STRONG_SELL-specific class
      // The badge wraps the rating text in a <span>; find it via closest span with border class
      const badge = screen.getByText('STRONG SELL').closest('span[class*="rounded-md"]');
      expect(badge).toHaveClass('bg-red-900/20');
      expect(badge).toHaveClass('text-red-500');
    });

    it('STRONG_BUY badge uses emerald class, not red class', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />); // rating: STRONG_BUY

      // Assert: distinct from STRONG_SELL
      const badge = screen.getByText('STRONG BUY').closest('span[class*="rounded-md"]');
      expect(badge).toHaveClass('bg-emerald-500/20');
      expect(badge).not.toHaveClass('bg-red-900/20');
    });

    it('RSI meter shows "unavailable" label when rsi is undefined', () => {
      // Arrange
      const noRsi: AIRating = { ...mockRating, rsi: undefined as any };

      // Act
      render(<StockCard rating={noRsi} />);

      // Assert: aria-label falls back to "unavailable"
      const rsiMeter = screen.getByRole('meter', { name: /RSI unavailable/i });
      expect(rsiMeter).toBeInTheDocument();
      expect(rsiMeter).toHaveAttribute('aria-valuenow', '0');
    });

    it('shows TrendingUp icon for positive price change', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />); // price_change_pct: 2.5

      // Assert
      expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument();
    });

    it('shows TrendingDown icon for negative price change', () => {
      // Arrange
      const downRating: AIRating = { ...mockRating, price_change_pct: -3.0 };

      // Act
      render(<StockCard rating={downRating} />);

      // Assert
      expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument();
    });

    it('shows Minus icon when price change is exactly zero', () => {
      // Arrange
      const flatRating: AIRating = { ...mockRating, price_change_pct: 0 };

      // Act
      render(<StockCard rating={flatRating} />);

      // Assert
      expect(screen.getByTestId('minus-icon')).toBeInTheDocument();
    });

    it('uses fallback CSS class for unknown rating value', () => {
      // Arrange
      const unknownRating: AIRating = { ...mockRating, rating: 'UNKNOWN' as any };

      // Act
      render(<StockCard rating={unknownRating} />);

      // Assert: fallback renders the label text
      expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
      // Fallback class applied (bg-slate-500/20)
      const badge = screen.getByText('UNKNOWN').closest('span[class*="rounded-md"]');
      expect(badge).toHaveClass('bg-slate-500/20');
    });
  });

  // =========================================================================
  // Action Buttons and Modals
  // =========================================================================

  describe('action buttons: shown only when onRemove is provided', () => {
    it('does not render delete or rename buttons when onRemove is not provided', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} />);

      // Assert
      expect(screen.queryByLabelText(/Remove AAPL/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Rename AAPL/i)).not.toBeInTheDocument();
    });

    it('renders delete and rename buttons when onRemove is provided', () => {
      // Arrange / Act
      render(<StockCard rating={mockRating} onRemove={jest.fn()} />);

      // Assert
      expect(screen.getByLabelText(/Remove AAPL from watchlist/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Rename AAPL display name/i)).toBeInTheDocument();
    });
  });

  describe('delete modal', () => {
    it('opens delete modal when delete button is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<StockCard rating={mockRating} onRemove={jest.fn()} />);

      // Act
      await user.click(screen.getByLabelText(/Remove AAPL from watchlist/i));

      // Assert
      expect(screen.getByTestId('delete-modal')).toBeInTheDocument();
      expect(screen.getByText('Delete AAPL')).toBeInTheDocument();
    });

    it('calls onRemove with ticker when delete is confirmed', async () => {
      // Arrange
      const user = userEvent.setup();
      const onRemove = jest.fn();
      render(<StockCard rating={mockRating} onRemove={onRemove} />);

      // Act
      await user.click(screen.getByLabelText(/Remove AAPL from watchlist/i));
      await user.click(screen.getByText('Confirm Delete'));

      // Assert
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith('AAPL');
    });

    it('closes delete modal without calling onRemove when cancelled', async () => {
      // Arrange
      const user = userEvent.setup();
      const onRemove = jest.fn();
      render(<StockCard rating={mockRating} onRemove={onRemove} />);

      // Act
      await user.click(screen.getByLabelText(/Remove AAPL from watchlist/i));
      await user.click(screen.getByText('Cancel Delete'));

      // Assert
      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.queryByTestId('delete-modal')).not.toBeInTheDocument();
    });
  });

  describe('rename modal', () => {
    it('opens rename modal when rename button is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<StockCard rating={mockRating} onRemove={jest.fn()} />);

      // Act
      await user.click(screen.getByLabelText(/Rename AAPL display name/i));

      // Assert
      expect(screen.getByTestId('rename-modal')).toBeInTheDocument();
      expect(screen.getByText('Rename AAPL')).toBeInTheDocument();
    });

    it('updates display name when rename is confirmed', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<StockCard rating={mockRating} onRemove={jest.fn()} />);

      // Act: open modal and confirm
      await user.click(screen.getByLabelText(/Rename AAPL display name/i));
      await user.click(screen.getByText('Confirm Rename'));

      // Assert: display name updated to the value passed by onConfirm
      expect(screen.getByText('New Display Name')).toBeInTheDocument();
      expect(screen.queryByTestId('rename-modal')).not.toBeInTheDocument();
    });

    it('closes rename modal without changing display name when cancelled', async () => {
      // Arrange
      const user = userEvent.setup();
      render(<StockCard rating={mockRating} onRemove={jest.fn()} />);

      // Act
      await user.click(screen.getByLabelText(/Rename AAPL display name/i));
      await user.click(screen.getByText('Cancel Rename'));

      // Assert: original ticker still shown, modal gone
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.queryByTestId('rename-modal')).not.toBeInTheDocument();
    });
  });
});
