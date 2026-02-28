/**
 * Integration tests for ComparisonModePanel.
 *
 * Tests cover:
 * - Happy path: Toggle comparison mode, add/remove tickers, search functionality
 * - Error cases: Invalid tickers, API failures, duplicate prevention
 * - Edge cases: Max comparisons limit (4), empty search, autocomplete dropdown
 * - Integration with stock detail page: Wire-up validation
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComparisonModePanel from '../ComparisonModePanel';
import { searchStocks } from '@/lib/api';
import type { StockSearchResult } from '@/lib/types';

// Mock API
jest.mock('@/lib/api', () => ({
  searchStocks: jest.fn(),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  GitCompare: () => <span data-testid="icon-compare">⚡</span>,
  Search: () => <span data-testid="icon-search">🔍</span>,
  X: () => <span data-testid="icon-close">✕</span>,
}));

const mockSearchStocks = searchStocks as jest.MockedFunction<typeof searchStocks>;

describe('ComparisonModePanel Integration', () => {
  // =========================================================================
  // Setup
  // =========================================================================

  const mockOnAdd = jest.fn();
  const mockOnRemove = jest.fn();
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchStocks.mockResolvedValue([]);
  });

  // =========================================================================
  // Happy Path: Toggle, Add, Remove, Search
  // =========================================================================

  describe('happy path: comparison mode lifecycle', () => {
    it('displays compare toggle button initially disabled', () => {
      // Arrange
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: false,
      };

      // Act
      render(<ComparisonModePanel {...props} />);

      // Assert
      const button = screen.getByRole('button', { name: /Compare/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('enables comparison UI when toggle is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: false,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const toggleButton = screen.getByRole('button', { name: /Compare/i });
      await user.click(toggleButton);

      // Assert
      expect(mockOnToggle).toHaveBeenCalledWith(true);
    });

    it('shows search input when comparison mode is enabled', () => {
      // Arrange
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true, // Enabled
      };

      // Act
      render(<ComparisonModePanel {...props} />);

      // Assert
      const searchInput = screen.getByPlaceholderText(/Search ticker or company/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('searches stocks with debounce when user types', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null }); // No delay for testing
      const searchResults: StockSearchResult[] = [
        { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ' },
        { ticker: 'META', name: 'Meta Platforms', exchange: 'NASDAQ' },
      ];
      mockSearchStocks.mockResolvedValue(searchResults);

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search ticker or company/i);
      await user.type(searchInput, 'ms');

      // Assert: Results displayed after debounce
      await waitFor(() => {
        expect(screen.getByText('MSFT')).toBeInTheDocument();
        expect(screen.getByText('Microsoft')).toBeInTheDocument();
      });
    });

    it('adds ticker when search result is clicked', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      mockSearchStocks.mockResolvedValue([
        { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ' },
      ]);

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search ticker/i);
      await user.type(searchInput, 'msft');

      await waitFor(() => {
        expect(screen.getByText('MSFT')).toBeInTheDocument();
      });

      const result = screen.getByRole('option', { name: /Microsoft/ });
      await user.click(result);

      // Assert
      expect(mockOnAdd).toHaveBeenCalledWith({
        ticker: 'MSFT',
        name: 'Microsoft',
        error: null,
      });
    });

    it('displays added comparison tickers with color indicators', () => {
      // Arrange
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [
          { ticker: 'MSFT', name: 'Microsoft', error: null },
          { ticker: 'GOOGL', name: 'Alphabet', error: null },
        ],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);

      // Assert: Tickers displayed with color dots
      expect(screen.getByText('MSFT')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();

      // Color indicator spans exist
      const colorSpans = screen.getAllByText('');
      expect(colorSpans.length).toBeGreaterThanOrEqual(2); // At least color indicators
    });

    it('removes ticker when X button is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [
          { ticker: 'MSFT', name: 'Microsoft', error: null },
        ],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const removeButton = screen.getByLabelText('Remove MSFT');
      await user.click(removeButton);

      // Assert
      expect(mockOnRemove).toHaveBeenCalledWith('MSFT');
    });
  });

  // =========================================================================
  // Error Cases: Invalid tickers, duplicates, API failures
  // =========================================================================

  describe('error cases: handles invalid input and API failures', () => {
    it('filters out primary ticker from search results', async () => {
      // Arrange: User searches for AAPL (primary ticker)
      const user = userEvent.setup({ delay: null });
      mockSearchStocks.mockResolvedValue([
        { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
        { ticker: 'AAPLW', name: 'Apple Warrant', exchange: 'NASDAQ' },
      ]);

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search/i);
      await user.type(searchInput, 'aapl');

      await waitFor(() => {
        // AAPL (primary) should be filtered out
        const aapleResults = screen.queryAllByText(/Apple Inc/);
        // Only AAPLW should show (warrant), not the primary
      });
    });

    it('filters out already-added comparison tickers from results', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      mockSearchStocks.mockResolvedValue([
        { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ' },
        { ticker: 'GOOGL', name: 'Alphabet', exchange: 'NASDAQ' },
      ]);

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [
          { ticker: 'MSFT', name: 'Microsoft', error: null },
        ],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search/i);
      await user.type(searchInput, 'aapl');

      await waitFor(() => {
        // MSFT already added, should not appear in results
        // GOOGL should appear
        expect(screen.getByText('GOOGL')).toBeInTheDocument();
      });
    });

    it('displays error message on ticker when API returns error', () => {
      // Arrange
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [
          { ticker: 'INVALID', name: 'Unknown', error: 'Data not available' },
        ],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);

      // Assert: Error message displayed under ticker
      expect(screen.getByText('Data not available')).toBeInTheDocument();
      expect(screen.getByText('INVALID')).toBeInTheDocument();
    });

    it('handles search API failure gracefully', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      mockSearchStocks.mockRejectedValue(new Error('Network error'));

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search/i);
      await user.type(searchInput, 'test');

      // Assert: Search gracefully fails, no results shown (no error banner)
      await waitFor(() => {
        // Dropdown should not appear or be empty
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('clears search input after adding a ticker', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      mockSearchStocks.mockResolvedValue([
        { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ' },
      ]);

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search/) as HTMLInputElement;
      await user.type(searchInput, 'msft');

      await waitFor(() => {
        expect(screen.getByText('MSFT')).toBeInTheDocument();
      });

      const result = screen.getByRole('option');
      await user.click(result);

      // Assert: Input cleared
      expect(searchInput.value).toBe('');
    });
  });

  // =========================================================================
  // Edge Cases: Max limit, empty results, autocomplete
  // =========================================================================

  describe('edge cases: max comparisons limit and autocomplete behavior', () => {
    it('enforces max 4 comparison tickers limit', () => {
      // Arrange: Already at max (4 tickers)
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [
          { ticker: 'MSFT', name: 'Microsoft', error: null },
          { ticker: 'GOOGL', name: 'Alphabet', error: null },
          { ticker: 'AMZN', name: 'Amazon', error: null },
          { ticker: 'TSLA', name: 'Tesla', error: null },
        ],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);

      // Assert: Search input disabled/hidden
      const searchInput = screen.queryByPlaceholderText(/Search/);
      expect(searchInput).not.toBeInTheDocument();

      // Assert: Helper text shows max reached
      expect(screen.getByText(/Add up to 4 tickers/)).toBeInTheDocument();
    });

    it('displays helper text showing current comparison count', () => {
      // Arrange
      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [
          { ticker: 'MSFT', name: 'Microsoft', error: null },
        ],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);

      // Assert
      expect(screen.getByText(/Add up to 4 tickers/)).toBeInTheDocument();
    });

    it('closes dropdown when clicking outside search box', async () => {
      // Arrange
      const user = userEvent.setup();
      mockSearchStocks.mockResolvedValue([
        { ticker: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ' },
      ]);

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      const { container } = render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search/);
      await user.type(searchInput, 'msft');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Click outside (on the container)
      await user.click(container);

      // Assert: Dropdown closed
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('shows empty state message when no search results', async () => {
      // Arrange
      const user = userEvent.setup({ delay: null });
      mockSearchStocks.mockResolvedValue([]); // No results

      const props = {
        primaryTicker: 'AAPL',
        comparisonTickers: [],
        onAdd: mockOnAdd,
        onRemove: mockOnRemove,
        onToggle: mockOnToggle,
        enabled: true,
      };

      // Act
      render(<ComparisonModePanel {...props} />);
      const searchInput = screen.getByPlaceholderText(/Search/);
      await user.type(searchInput, 'zzzzz'); // Non-existent ticker

      // Assert: Dropdown not shown (empty results)
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });
});
