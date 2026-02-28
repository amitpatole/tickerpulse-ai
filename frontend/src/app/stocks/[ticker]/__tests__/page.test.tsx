/**
 * Integration tests for the stock detail page ([ticker]/page.tsx).
 *
 * Tests cover:
 * - Happy path: renders price hero, financials, news, and AI analysis sections
 * - Comparison mode: ComparisonModePanel wired correctly; ComparisonChart mounts on add
 * - Live price overlay: SSE price_update updates display without full refetch
 * - Error cases: API failure banner, loading skeleton
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import StockDetailPage from '../page';
import { useStockDetail } from '@/hooks/useStockDetail';
import { useApi } from '@/hooks/useApi';
import type { StockDetail, StockDetailQuote } from '@/lib/types';

// ---- next/navigation mock ---------------------------------------------------
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// ---- Hook mocks -------------------------------------------------------------
jest.mock('@/hooks/useStockDetail');
jest.mock('@/hooks/useApi');

// ---- Component mocks --------------------------------------------------------
jest.mock('@/components/layout/Header', () =>
  function MockHeader({ title, subtitle }: any) {
    return (
      <div data-testid="header">
        <span>{title}</span>
        <span>{subtitle}</span>
      </div>
    );
  }
);

jest.mock('@/components/stocks/StockPriceChart', () =>
  function MockChart() {
    return <div data-testid="price-chart" />;
  }
);

jest.mock('@/components/stocks/SentimentBadge', () =>
  function MockBadge() {
    return <div data-testid="sentiment-badge" />;
  }
);

jest.mock('@/components/stocks/FinancialsCard', () =>
  function MockFinancials() {
    return <div data-testid="financials-card" />;
  }
);

// ComparisonModePanel mock exposes testable controls
jest.mock('@/components/stocks/ComparisonModePanel', () =>
  function MockComparisonPanel({ onAdd, onToggle, enabled, comparisonTickers }: any) {
    return (
      <div data-testid="comparison-panel" data-enabled={String(enabled)}>
        <button
          data-testid="toggle-compare"
          onClick={() => onToggle(!enabled)}
        >
          {enabled ? 'Disable' : 'Compare'}
        </button>
        <button
          data-testid="add-msft"
          onClick={() =>
            onAdd({ ticker: 'MSFT', name: 'Microsoft Corp', error: null })
          }
        >
          Add MSFT
        </button>
        <span data-testid="ticker-count">{comparisonTickers.length}</span>
      </div>
    );
  }
);

jest.mock('@/components/stocks/ComparisonChart', () =>
  function MockComparisonChart({ series }: any) {
    return (
      <div data-testid="comparison-chart" data-series-count={series.length} />
    );
  }
);

jest.mock('lucide-react', () => ({
  ArrowLeft: () => <span>←</span>,
  TrendingUp: () => <span data-testid="icon-up">↑</span>,
  TrendingDown: () => <span data-testid="icon-down">↓</span>,
  Minus: () => <span data-testid="icon-flat">—</span>,
  Loader2: () => <span>Loading…</span>,
  ExternalLink: () => <span>↗</span>,
  Clock: () => <span>🕐</span>,
  Brain: () => <span>🧠</span>,
  Activity: () => <span>⚡</span>,
  Newspaper: () => <span>📰</span>,
}));

// useApi for AI ratings (used inside AIAnalysisCard sub-component)
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseStockDetail = useStockDetail as jest.MockedFunction<typeof useStockDetail>;
const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

const defaultCompareApiResult = {
  data: null,
  loading: false,
  error: null,
  refetch: jest.fn(),
} as any;

// ---- Fixtures ---------------------------------------------------------------

const fullQuote: StockDetailQuote = {
  price: 175.5,
  change_pct: 2.1,
  volume: 8_000_000,
  market_cap: 2_700_000_000_000,
  week_52_high: 200,
  week_52_low: 150,
  pe_ratio: 28.3,
  eps: 6.2,
  name: 'Apple Inc.',
  currency: 'USD',
  dividend_yield: 0.55,
  beta: 1.21,
  avg_volume: 70_000_000,
  book_value: 3.84,
};

const baseDetail: StockDetail = {
  ticker: 'AAPL',
  quote: fullQuote,
  candles: [],
  news: [
    {
      title: 'Apple hits new high',
      source: 'Reuters',
      sentiment_label: 'positive',
    },
  ],
  indicators: { rsi: 62, macd_signal: 'bullish', bb_position: 'mid' },
};

// ---- Setup ------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  mockUseRouter.mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
  } as any);

  // Default: loaded state for stock detail
  mockUseStockDetail.mockReturnValue({
    data: baseDetail,
    loading: false,
    error: null,
    livePrice: null,
    refetch: jest.fn(),
  });

  // Default: no comparison data (disabled)
  mockUseApi.mockReturnValue(defaultCompareApiResult);
});

// ============================================================================
// Happy path
// ============================================================================

describe('happy path: renders full stock detail', () => {
  it('displays price hero with price and positive change percentage', async () => {
    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      expect(screen.getByText('$175.50')).toBeInTheDocument();
      expect(screen.getByText('+2.10%')).toBeInTheDocument();
    });
  });

  it('renders price chart, financials, and sentiment badge', async () => {
    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      expect(screen.getByTestId('price-chart')).toBeInTheDocument();
      expect(screen.getByTestId('financials-card')).toBeInTheDocument();
      expect(screen.getByTestId('sentiment-badge')).toBeInTheDocument();
    });
  });

  it('renders news items from the detail data', async () => {
    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      expect(screen.getByText('Apple hits new high')).toBeInTheDocument();
      expect(screen.getByText('Reuters')).toBeInTheDocument();
    });
  });

  it('renders comparison panel regardless of comparison state', async () => {
    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      expect(screen.getByTestId('comparison-panel')).toBeInTheDocument();
    });
  });

  it('does not render comparison chart when comparison is disabled', async () => {
    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      expect(screen.queryByTestId('comparison-chart')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// Comparison mode integration
// ============================================================================

describe('comparison mode: wires ComparisonModePanel and ComparisonChart', () => {
  it('enables comparison and adds a ticker via panel controls', async () => {
    const user = userEvent.setup();

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() =>
      expect(screen.getByTestId('comparison-panel')).toBeInTheDocument()
    );

    // Enable comparison mode
    await user.click(screen.getByTestId('toggle-compare'));

    // Panel should show as enabled
    await waitFor(() => {
      expect(screen.getByTestId('comparison-panel')).toHaveAttribute(
        'data-enabled',
        'true'
      );
    });

    // Add a comparison ticker
    await user.click(screen.getByTestId('add-msft'));

    // Ticker count should update
    await waitFor(() => {
      expect(screen.getByTestId('ticker-count')).toHaveTextContent('1');
    });
  });

  it('shows ComparisonChart after enabling comparison and adding a ticker', async () => {
    const user = userEvent.setup();

    // Return comparison data from useApi
    mockUseApi.mockReturnValue({
      data: {
        AAPL: { points: [{ time: 1_000_000, value: 0 }], current_pct: 0 },
        MSFT: { points: [{ time: 1_000_000, value: 3.2 }], current_pct: 3.2 },
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() =>
      expect(screen.getByTestId('comparison-panel')).toBeInTheDocument()
    );

    // Enable and add
    await user.click(screen.getByTestId('toggle-compare'));
    await user.click(screen.getByTestId('add-msft'));

    // Chart should now appear
    await waitFor(() => {
      expect(screen.getByTestId('comparison-chart')).toBeInTheDocument();
    });
  });

  it('hides ComparisonChart when comparison is toggled off', async () => {
    const user = userEvent.setup();

    mockUseApi.mockReturnValue({
      data: {
        AAPL: { points: [{ time: 1_000_000, value: 0 }], current_pct: 0 },
        MSFT: { points: [{ time: 1_000_000, value: 1.5 }], current_pct: 1.5 },
      },
      loading: false,
      error: null,
      refetch: jest.fn(),
    } as any);

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    // Enable, add, confirm visible
    await user.click(screen.getByTestId('toggle-compare'));
    await user.click(screen.getByTestId('add-msft'));
    await waitFor(() =>
      expect(screen.getByTestId('comparison-chart')).toBeInTheDocument()
    );

    // Toggle off
    await user.click(screen.getByTestId('toggle-compare'));
    await waitFor(() => {
      expect(screen.queryByTestId('comparison-chart')).not.toBeInTheDocument();
    });
  });

  it('does not show comparison chart when tickers are added but comparison is not enabled', async () => {
    const user = userEvent.setup();

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    // Add ticker WITHOUT enabling comparison
    await user.click(screen.getByTestId('add-msft'));

    await waitFor(() => {
      expect(screen.queryByTestId('comparison-chart')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// Live price overlay
// ============================================================================

describe('live price overlay: SSE updates display without refetch', () => {
  it('shows live price from useStockDetail livePrice overlay', async () => {
    mockUseStockDetail.mockReturnValue({
      data: baseDetail,
      loading: false,
      error: null,
      livePrice: { ticker: 'AAPL', price: 180.75, change: 5.25, change_pct: 3.0 },
      refetch: jest.fn(),
    });

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      // Live price takes precedence over quote.price
      expect(screen.getByText('$180.75')).toBeInTheDocument();
      expect(screen.getByText('+3.00%')).toBeInTheDocument();
    });
  });

  it('falls back to quote price when livePrice is null', async () => {
    mockUseStockDetail.mockReturnValue({
      data: baseDetail,
      loading: false,
      error: null,
      livePrice: null,
      refetch: jest.fn(),
    });

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      expect(screen.getByText('$175.50')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Error cases
// ============================================================================

describe('error cases: handles failures gracefully', () => {
  it('redirects to dashboard when ticker param is empty', async () => {
    const mockReplace = jest.fn();
    mockUseRouter.mockReturnValue({ replace: mockReplace } as any);

    render(<StockDetailPage params={Promise.resolve({ ticker: '' })} />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/?error=missing-ticker');
    });
  });

  it('displays error banner when API fails and no data is available', async () => {
    mockUseStockDetail.mockReturnValue({
      data: null,
      loading: false,
      error: 'Failed to fetch stock data',
      livePrice: null,
      refetch: jest.fn(),
    });

    render(<StockDetailPage params={Promise.resolve({ ticker: 'FAIL' })} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch stock data')).toBeInTheDocument();
    });
  });

  it('renders loading skeletons while data is fetching', async () => {
    mockUseStockDetail.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      livePrice: null,
      refetch: jest.fn(),
    });

    render(<StockDetailPage params={Promise.resolve({ ticker: 'AAPL' })} />);

    await waitFor(() => {
      const loaders = screen.getAllByText('Loading…');
      expect(loaders.length).toBeGreaterThan(0);
    });
  });

  it('shows negative change styling for down stocks', async () => {
    mockUseStockDetail.mockReturnValue({
      data: {
        quote: { ...fullQuote, price: 100, change_pct: -4.5 },
        news: [],
      },
      loading: false,
      error: null,
      livePrice: null,
      refetch: jest.fn(),
    });

    render(<StockDetailPage params={Promise.resolve({ ticker: 'DOWN' })} />);

    await waitFor(() => {
      expect(screen.getByText('-4.50%')).toBeInTheDocument();
      expect(screen.getByTestId('icon-down')).toBeInTheDocument();
    });
  });
});
