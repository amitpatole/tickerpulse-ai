import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ResearchPage from '../page';
import * as api from '@/lib/api';

// Mock API module
jest.mock('@/lib/api');

// Mock lucide icons to simplify testing
jest.mock('lucide-react', () => ({
  FileText: () => <div data-testid="icon-file-text" />,
  Loader2: () => <div data-testid="icon-loader" />,
  Calendar: () => <div data-testid="icon-calendar" />,
  Bot: () => <div data-testid="icon-bot" />,
  Filter: () => <div data-testid="icon-filter" />,
  Play: () => <div data-testid="icon-play" />,
  Download: () => <div data-testid="icon-download" />,
  CheckSquare: () => <div data-testid="icon-check-square" />,
  Square: () => <div data-testid="icon-square" />,
  ChevronLeft: () => <div data-testid="icon-chevron-left" />,
  ChevronRight: () => <div data-testid="icon-chevron-right" />,
}));

// Mock Header component
jest.mock('@/components/layout/Header', () => {
  return function MockHeader() {
    return <div data-testid="header">Research Briefs</div>;
  };
});

// Mock Toast component
jest.mock('@/components/ui/Toast', () => {
  return function MockToast() {
    return <div data-testid="toast" />;
  };
});

// Mock DOMPurify
jest.mock('dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (html: string) => html,
  },
}));

describe('ResearchPage - Brief Enhancements', () => {
  const mockListBrief = {
    id: 1,
    ticker: 'AAPL',
    title: 'Apple Inc Market Analysis',
    summary: 'List view summary text',
    content: 'Full brief content here',
    agent_name: 'ResearchAgent',
    model_used: 'Claude 3.5 Sonnet',
    created_at: '2024-01-15T10:30:00Z',
  };

  const mockDetailBrief = {
    ...mockListBrief,
    summary: 'Executive summary extracted from full analysis',
    key_metrics: {
      price: 150.25,
      change_pct: 2.5,
      rsi: 65,
      rating: 'BUY',
      score: 8.5,
      sentiment_label: 'BULLISH',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getResearchBriefs as jest.Mock).mockResolvedValue({
      data: [mockListBrief],
      total: 1,
      has_next: false,
    });
    (api.getResearchBrief as jest.Mock).mockResolvedValue(mockDetailBrief);
    (api.getStocks as jest.Mock).mockResolvedValue([]);
    (api.getExportCapabilities as jest.Mock).mockResolvedValue({
      formats: { pdf: { available: true } },
    });
  });

  describe('KeyMetricsPanel - Happy Path', () => {
    test('renders all available metrics with correct formatting', async () => {
      render(<ResearchPage />);

      // Wait for briefs to load
      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      // Click brief to load detail
      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      // Wait for detail to load
      await waitFor(() => {
        expect(api.getResearchBrief).toHaveBeenCalledWith(mockListBrief.id);
      });

      // Verify KeyMetricsPanel renders with all metrics
      expect(screen.getByText('Key Metrics')).toBeInTheDocument();
      expect(screen.getByText(/\$150\.25/)).toBeInTheDocument();
      expect(screen.getByText(/\+2\.50%/)).toBeInTheDocument();
      expect(screen.getByText('BUY')).toBeInTheDocument();
      expect(screen.getByText(/8\.5\/10/)).toBeInTheDocument();
      expect(screen.getByText('BULLISH')).toBeInTheDocument();
    });
  });

  describe('KeyMetricsPanel - Edge Cases', () => {
    test('returns null (no render) when brief has no key_metrics', async () => {
      const briefWithoutMetrics = { ...mockDetailBrief, key_metrics: null };
      (api.getResearchBrief as jest.Mock).mockResolvedValueOnce(briefWithoutMetrics);

      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      await waitFor(() => {
        expect(api.getResearchBrief).toHaveBeenCalled();
      });

      // KeyMetricsPanel should not render
      expect(screen.queryByText('Key Metrics')).not.toBeInTheDocument();
      expect(screen.queryByText(/\$150\.25/)).not.toBeInTheDocument();
    });

    test('correctly labels RSI as Overbought when RSI > 70', async () => {
      const briefWithHighRSI = {
        ...mockDetailBrief,
        key_metrics: { ...mockDetailBrief.key_metrics!, rsi: 75 },
      };
      (api.getResearchBrief as jest.Mock).mockResolvedValueOnce(briefWithHighRSI);

      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      // RSI value and label appear together in the metrics panel
      await waitFor(() => {
        expect(screen.getByText(/75\.0.*Overbought/)).toBeInTheDocument();
      });
    });

    test('correctly labels RSI as Oversold when RSI < 30', async () => {
      const briefWithLowRSI = {
        ...mockDetailBrief,
        key_metrics: { ...mockDetailBrief.key_metrics!, rsi: 25 },
      };
      (api.getResearchBrief as jest.Mock).mockResolvedValueOnce(briefWithLowRSI);

      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      await waitFor(() => {
        expect(screen.getByText(/25\.0.*Oversold/)).toBeInTheDocument();
      });
    });

    test('handles price with positive and negative change_pct correctly', async () => {
      const briefWithNegativeChange = {
        ...mockDetailBrief,
        key_metrics: { ...mockDetailBrief.key_metrics!, change_pct: -1.25 },
      };
      (api.getResearchBrief as jest.Mock).mockResolvedValueOnce(briefWithNegativeChange);

      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      await waitFor(() => {
        expect(screen.getByText(/\$150\.25.*-1\.25%/)).toBeInTheDocument();
      });
    });
  });

  describe('SummaryCallout Integration', () => {
    test('renders summary from detail brief when available', async () => {
      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      await waitFor(() => {
        expect(api.getResearchBrief).toHaveBeenCalled();
      });

      expect(screen.getByText('Executive Summary')).toBeInTheDocument();
      expect(screen.getByText(mockDetailBrief.summary)).toBeInTheDocument();
    });

    test('falls back to list brief summary when detail brief summary is missing', async () => {
      const briefWithoutSummary = { ...mockDetailBrief, summary: null };
      (api.getResearchBrief as jest.Mock).mockResolvedValueOnce(briefWithoutSummary);

      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      await waitFor(() => {
        expect(api.getResearchBrief).toHaveBeenCalled();
      });

      // Should show list brief's summary as fallback
      expect(screen.getByText('List view summary text')).toBeInTheDocument();
    });
  });

  describe('loadBriefDetail Error Handling', () => {
    test('gracefully falls back to list brief when API fails', async () => {
      (api.getResearchBrief as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      // Wait for the detail fetch to attempt and fail, triggering the fallback
      await waitFor(
        () => {
          expect(api.getResearchBrief).toHaveBeenCalledWith(mockListBrief.id);
        },
        { timeout: 2000 }
      );

      // Should still display the fallback summary from list brief
      expect(screen.getByText('List view summary text')).toBeInTheDocument();

      // Should not show metrics (since detail fetch failed)
      expect(screen.queryByText('Key Metrics')).not.toBeInTheDocument();
    });

    test('clears loading state after detail brief fetch completes', async () => {
      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      // Wait for the detail fetch to complete and metrics to render
      await waitFor(() => {
        expect(api.getResearchBrief).toHaveBeenCalledWith(mockListBrief.id);
        expect(screen.getByText('Key Metrics')).toBeInTheDocument();
      });

      // Verify the detail brief data is displayed
      expect(screen.getByText(/\$150\.25.*\+2\.50%/)).toBeInTheDocument();
      expect(screen.getByText('BUY')).toBeInTheDocument();
    });
  });

  describe('Detail Panel State Management', () => {
    test('clears detail brief when filter changes', async () => {
      render(<ResearchPage />);

      await waitFor(() => {
        expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
      });

      // Load detail brief
      const briefRow = screen.getByText(mockListBrief.title);
      await userEvent.click(briefRow);

      await waitFor(() => {
        expect(screen.getByText('Key Metrics')).toBeInTheDocument();
      });

      // Change filter
      const filterSelect = screen.getByDisplayValue('All Tickers');
      await userEvent.selectOptions(filterSelect, 'AAPL');

      // Mock new API call for filtered results
      (api.getResearchBriefs as jest.Mock).mockResolvedValueOnce({
        data: [mockListBrief],
        total: 1,
        has_next: false,
      });

      // Wait for re-fetch
      await waitFor(() => {
        expect(api.getResearchBriefs).toHaveBeenCalledWith('AAPL', 1, 25);
      });

      // Detail should be cleared (no metrics shown initially)
      // but brief is still selected in list
      expect(screen.getByText(mockListBrief.title)).toBeInTheDocument();
    });
  });
});
