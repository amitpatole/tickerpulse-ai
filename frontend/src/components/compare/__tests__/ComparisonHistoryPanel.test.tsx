```tsx
/**
 * Tests for ComparisonHistoryPanel component.
 *
 * Coverage:
 * - AC1: Initial state shows prompt
 * - AC2: Loads and displays history runs
 * - AC3: Empty state when no runs found
 * - AC4: Error handling on API failure
 * - AC5: Ticker filter uses getModelComparisonHistory
 * - AC6: Run row expands to show details
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ComparisonHistoryPanel from '../ComparisonHistoryPanel';
import * as apiLib from '@/lib/api';

vi.mock('@/lib/api', () => ({
  fetchComparisonHistory:    vi.fn(),
  getModelComparisonHistory: vi.fn(),
}));

const MOCK_RUNS = [
  {
    run_id:     'run-aaaa-1111',
    ticker:     'AAPL',
    created_at: '2026-02-28T10:00:00Z',
    results: [
      { provider: 'anthropic', model: 'claude',  rating: 'BUY',  score: 80, confidence: 90, summary: 'Strong outlook' },
      { provider: 'openai',    model: 'gpt-4o',  rating: 'HOLD', score: 60, confidence: 70, summary: 'Neutral signals' },
    ],
  },
  {
    run_id:     'run-bbbb-2222',
    ticker:     'MSFT',
    created_at: '2026-02-28T09:00:00Z',
    results: [
      { provider: 'google', model: 'gemini', rating: 'BUY', score: 75, confidence: 85, summary: 'Positive momentum' },
    ],
  },
];

describe('ComparisonHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // AC1: Initial state
  // =========================================================================

  test('shows initial prompt before loading', () => {
    render(<ComparisonHistoryPanel />);
    expect(screen.getByTestId('history-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('history-list')).not.toBeInTheDocument();
  });

  test('load button shows "Load History" initially', () => {
    render(<ComparisonHistoryPanel />);
    expect(screen.getByTestId('load-history-button')).toHaveTextContent('Load History');
  });

  // =========================================================================
  // AC2: Loads and displays runs
  // =========================================================================

  test('loads and displays history runs after clicking load button', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockResolvedValue({ runs: MOCK_RUNS });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument();
    });

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  test('button label changes to "Refresh" after first load', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockResolvedValue({ runs: MOCK_RUNS });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('load-history-button')).toHaveTextContent('Refresh');
    });
  });

  // =========================================================================
  // AC3: Empty state
  // =========================================================================

  test('shows empty state message when no runs found', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockResolvedValue({ runs: [] });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // AC4: Error handling
  // =========================================================================

  test('shows error message on API failure', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('history-error')).toHaveTextContent('Network error');
    });
  });

  test('hides initial prompt after error', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockRejectedValue(new Error('Timeout'));
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('history-error')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('history-prompt')).not.toBeInTheDocument();
  });

  // =========================================================================
  // AC5: Ticker filter
  // =========================================================================

  test('calls getModelComparisonHistory when ticker filter is provided', async () => {
    vi.mocked(apiLib.getModelComparisonHistory).mockResolvedValue({
      ticker: 'AAPL',
      runs:   [MOCK_RUNS[0]],
    });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.type(screen.getByTestId('history-ticker-input'), 'AAPL');
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(vi.mocked(apiLib.getModelComparisonHistory)).toHaveBeenCalledWith('AAPL', 20);
    });

    expect(vi.mocked(apiLib.fetchComparisonHistory)).not.toHaveBeenCalled();
  });

  test('calls fetchComparisonHistory when no ticker filter', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockResolvedValue({ runs: MOCK_RUNS });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(vi.mocked(apiLib.fetchComparisonHistory)).toHaveBeenCalledWith(20);
    });

    expect(vi.mocked(apiLib.getModelComparisonHistory)).not.toHaveBeenCalled();
  });

  test('submits on Enter key in ticker input', async () => {
    vi.mocked(apiLib.getModelComparisonHistory).mockResolvedValue({
      ticker: 'TSLA',
      runs:   [],
    });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.type(screen.getByTestId('history-ticker-input'), 'TSLA');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(vi.mocked(apiLib.getModelComparisonHistory)).toHaveBeenCalledWith('TSLA', 20);
    });
  });

  // =========================================================================
  // AC6: Run row expand/collapse
  // =========================================================================

  test('expands run row to show provider details on click', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockResolvedValue({ runs: [MOCK_RUNS[0]] });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument();
    });

    const runRow = screen.getByTestId(`run-row-${MOCK_RUNS[0].run_id}`);
    await user.click(runRow);

    expect(screen.getByTestId(`run-details-${MOCK_RUNS[0].run_id}`)).toBeInTheDocument();
  });

  test('collapses run row when clicked again', async () => {
    vi.mocked(apiLib.fetchComparisonHistory).mockResolvedValue({ runs: [MOCK_RUNS[0]] });
    const user = userEvent.setup();

    render(<ComparisonHistoryPanel />);
    await user.click(screen.getByTestId('load-history-button'));

    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument();
    });

    const runRow = screen.getByTestId(`run-row-${MOCK_RUNS[0].run_id}`);
    await user.click(runRow);
    expect(screen.getByTestId(`run-details-${MOCK_RUNS[0].run_id}`)).toBeInTheDocument();

    await user.click(runRow);
    expect(screen.queryByTestId(`run-details-${MOCK_RUNS[0].run_id}`)).not.toBeInTheDocument();
  });
});
```