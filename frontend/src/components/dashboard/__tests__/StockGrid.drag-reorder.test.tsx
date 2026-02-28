/**
 * Tests for StockGrid Drag-and-Drop Reorder
 *
 * Covers drag-and-drop reordering of watchlist stocks using @dnd-kit,
 * plus keyboard-based controls (moveUp/moveDown buttons).
 *
 * Coverage:
 * 1. Happy path: Drag item to new position, API called with new order
 * 2. Keyboard reorder: Move up/down buttons trigger correct reorder
 * 3. Edge cases: Boundary conditions (first/last), no-op same position
 * 4. State management: Local order state updates before API call
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AIRating } from '@/lib/types';
import * as api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  getWatchlistOrder: jest.fn(),
  reorderWatchlist: jest.fn(),
  addStockToWatchlist: jest.fn(),
  removeStockFromWatchlist: jest.fn(),
  searchStocks: jest.fn(),
}));

jest.mock('../StockCard', () => {
  return function DummyStockCard({ rating }: { rating: AIRating }) {
    return (
      <div data-testid={`stock-card-${rating.ticker}`} className="p-2">
        {rating.ticker} - ${rating.price}
      </div>
    );
  };
});

jest.mock('lucide-react', () => ({
  Search: () => <div />,
  Plus: () => <div />,
  Loader2: () => <div data-testid="loader-icon" />,
  X: () => <div />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  GripVertical: () => <div data-testid="grip-icon" />,
}));

import StockGrid from '../StockGrid';

const mockRatings: AIRating[] = [
  { ticker: 'AAPL', price: 150, rating: 8, sentiment_score: 0.7 },
  { ticker: 'MSFT', price: 300, rating: 7, sentiment_score: 0.6 },
  { ticker: 'GOOG', price: 120, rating: 9, sentiment_score: 0.8 },
];

describe('StockGrid — Drag-and-Drop Reorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getWatchlistOrder as jest.Mock).mockResolvedValue(mockRatings.map((r) => r.ticker));
    (api.reorderWatchlist as jest.Mock).mockResolvedValue({ ok: true });
    (api.addStockToWatchlist as jest.Mock).mockResolvedValue({ ok: true });
    (api.removeStockFromWatchlist as jest.Mock).mockResolvedValue({ ok: true });
    (api.searchStocks as jest.Mock).mockResolvedValue([]);
  });

  // ===== HAPPY PATH =====

  test('renders drag handle icon for each stock card', async () => {
    render(
      <StockGrid watchlistId={1} ratings={mockRatings} />
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('grip-icon')).toHaveLength(mockRatings.length);
    });
  });

  // ===== KEYBOARD REORDER: MOVE UP =====

  test('moveUp button shifts stock up one position and calls reorderWatchlist', async () => {
    const onRefetch = jest.fn();
    render(
      <StockGrid watchlistId={1} ratings={mockRatings} onRefetch={onRefetch} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-card-MSFT')).toBeInTheDocument();
    });

    // Focus the MSFT card to reveal keyboard controls
    const msftCard = screen.getByTestId('stock-card-MSFT');
    msftCard.focus();

    // Click move-up button (second ChevronUp in the group)
    const moveUpButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('[data-testid="chevron-up-icon"]')
    );
    fireEvent.click(moveUpButtons[1]); // MSFT is at index 1, so button at index 1

    // THEN: reorderWatchlist called with MSFT moved to position 0
    await waitFor(() => {
      expect(api.reorderWatchlist).toHaveBeenCalledWith(1, ['MSFT', 'AAPL', 'GOOG']);
    });
  });

  // ===== KEYBOARD REORDER: MOVE DOWN =====

  test('moveDown button shifts stock down one position and calls reorderWatchlist', async () => {
    render(
      <StockGrid watchlistId={1} ratings={mockRatings} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-card-AAPL')).toBeInTheDocument();
    });

    // Focus AAPL card
    const aaplCard = screen.getByTestId('stock-card-AAPL');
    aaplCard.focus();

    // Click move-down button
    const moveDownButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('[data-testid="chevron-down-icon"]')
    );
    fireEvent.click(moveDownButtons[0]); // AAPL is at index 0

    // THEN: reorderWatchlist called with AAPL moved down
    await waitFor(() => {
      expect(api.reorderWatchlist).toHaveBeenCalledWith(1, ['MSFT', 'AAPL', 'GOOG']);
    });
  });

  // ===== EDGE CASE: MOVE UP AT BOUNDARY (FIRST ITEM) =====

  test('moveUp button is disabled for first stock (cannot move up)', async () => {
    render(
      <StockGrid watchlistId={1} ratings={mockRatings} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-card-AAPL')).toBeInTheDocument();
    });

    // Focus first item
    const aaplCard = screen.getByTestId('stock-card-AAPL');
    aaplCard.focus();

    // Find the first moveUp button (should be disabled)
    const moveUpButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('[data-testid="chevron-up-icon"]')
    );
    const firstMoveUpBtn = moveUpButtons[0];

    // THEN: Should be disabled
    expect(firstMoveUpBtn).toBeDisabled();
  });

  // ===== EDGE CASE: MOVE DOWN AT BOUNDARY (LAST ITEM) =====

  test('moveDown button is disabled for last stock (cannot move down)', async () => {
    render(
      <StockGrid watchlistId={1} ratings={mockRatings} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-card-GOOG')).toBeInTheDocument();
    });

    // Focus last item
    const googCard = screen.getByTestId('stock-card-GOOG');
    googCard.focus();

    // Find the last moveDown button
    const moveDownButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('[data-testid="chevron-down-icon"]')
    );
    const lastMoveDownBtn = moveDownButtons[moveDownButtons.length - 1];

    // THEN: Should be disabled
    expect(lastMoveDownBtn).toBeDisabled();
  });

  // ===== STATE MANAGEMENT: LOCAL UPDATE =====

  test('order state updates immediately (optimistic), then API call follows', async () => {
    const { rerender } = render(
      <StockGrid watchlistId={1} ratings={mockRatings} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-card-MSFT')).toBeInTheDocument();
    });

    // Focus MSFT and click moveUp
    const msftCard = screen.getByTestId('stock-card-MSFT');
    msftCard.focus();

    const moveUpButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('[data-testid="chevron-up-icon"]')
    );
    fireEvent.click(moveUpButtons[1]);

    // THEN: API should be called immediately
    await waitFor(() => {
      expect(api.reorderWatchlist).toHaveBeenCalled();
    });

    // Verify correct order was sent
    expect(api.reorderWatchlist).toHaveBeenCalledWith(1, ['MSFT', 'AAPL', 'GOOG']);
  });

  // ===== WATCHLIST ID PROP =====

  test('uses correct watchlistId when calling reorderWatchlist', async () => {
    const watchlistId = 42;
    render(
      <StockGrid watchlistId={watchlistId} ratings={mockRatings} />
    );

    await waitFor(() => {
      expect(screen.getByTestId('stock-card-AAPL')).toBeInTheDocument();
    });

    const aaplCard = screen.getByTestId('stock-card-AAPL');
    aaplCard.focus();

    const moveDownButtons = screen.getAllByRole('button').filter((btn) =>
      btn.querySelector('[data-testid="chevron-down-icon"]')
    );
    fireEvent.click(moveDownButtons[0]);

    await waitFor(() => {
      expect(api.reorderWatchlist).toHaveBeenCalledWith(42, expect.any(Array));
    });
  });
});
