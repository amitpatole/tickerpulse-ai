```tsx
/**
 * Tests for ModelComparisonPanel component.
 *
 * Coverage:
 * - AC1: Provider selection (toggle checkboxes)
 * - AC2: Form submission with valid ticker and providers
 * - AC3: Error banner display on API failure
 * - AC4: Loading state with skeleton cards
 * - AC5: Results display with market context and consensus bar
 * - AC6: Template selector
 */

import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ModelComparisonPanel from '../ModelComparisonPanel';
import * as apiLib from '@/lib/api';

vi.mock('@/lib/api', () => ({
  runModelComparison: vi.fn(),
}));

describe('ModelComparisonPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // AC1: Provider Selection (Checkboxes)
  // =========================================================================

  test('should toggle provider selection when checkbox clicked', async () => {
    const user = userEvent.setup();
    render(<ModelComparisonPanel />);

    const anthropicCheckbox = screen.getByTestId('provider-checkbox-anthropic');
    const anthropicInput = within(anthropicCheckbox).getByRole('checkbox');
    expect(anthropicInput).toBeChecked();

    await user.click(anthropicInput);
    expect(anthropicInput).not.toBeChecked();

    const googleCheckbox = screen.getByTestId('provider-checkbox-google');
    const googleInput = within(googleCheckbox).getByRole('checkbox');
    expect(googleInput).not.toBeChecked();

    await user.click(googleInput);
    expect(googleInput).toBeChecked();
  });

  test('should have at least one provider pre-selected by default', () => {
    render(<ModelComparisonPanel />);

    const checkboxes = screen.getAllByRole('checkbox');
    const checkedBoxes = checkboxes.filter((cb) => (cb as HTMLInputElement).checked);
    expect(checkedBoxes.length).toBeGreaterThan(0);
  });

  test('should disable submit button when no providers selected', async () => {
    const user = userEvent.setup();
    render(<ModelComparisonPanel />);

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      if ((checkbox as HTMLInputElement).checked) {
        await user.click(checkbox);
      }
    }

    expect(screen.getByTestId('submit-button')).toBeDisabled();
  });

  // =========================================================================
  // AC2: Form Submission
  // =========================================================================

  test('should submit with valid ticker and providers', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-abc123',
      ticker: 'AAPL',
      template: 'custom',
      market_context: { price: 150.25, rsi: 65.5, sentiment_score: 0.72 },
      results: [
        {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          rating: 'BUY',
          score: 75,
          confidence: 85,
          summary: 'Strong bullish fundamentals',
          duration_ms: 420,
        },
      ],
    };

    vi.mocked(apiLib.runModelComparison).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    await user.type(screen.getByTestId('ticker-input'), 'AAPL');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(apiLib.runModelComparison).toHaveBeenCalled();
    });

    const callArgs = vi.mocked(apiLib.runModelComparison).mock.calls[0][0];
    expect(callArgs.ticker).toBe('AAPL');
    expect(callArgs.providers).toBeDefined();
    expect(Array.isArray(callArgs.providers)).toBe(true);
  });

  test('should disable submit button when ticker is empty', () => {
    render(<ModelComparisonPanel />);

    const submitButton = screen.getByTestId('submit-button');
    const tickerInput = screen.getByTestId('ticker-input') as HTMLInputElement;

    expect(tickerInput.value).toBe('');
    expect(submitButton).toBeDisabled();
  });

  test('should submit on Enter key press in ticker input', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-xyz',
      ticker: 'GOOGL',
      template: 'custom',
      market_context: { price: 140.0, rsi: 55.0, sentiment_score: 0.5 },
      results: [],
    };

    vi.mocked(apiLib.runModelComparison).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    await user.type(screen.getByTestId('ticker-input'), 'GOOGL');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(apiLib.runModelComparison).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // AC3: Error Banner Display
  // =========================================================================

  test('should display error banner on API failure', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Failed to connect to AI provider';

    vi.mocked(apiLib.runModelComparison).mockRejectedValue(new Error(errorMessage));

    render(<ModelComparisonPanel />);

    await user.type(screen.getByTestId('ticker-input'), 'AAPL');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      const errorBanner = screen.getByTestId('error-banner');
      expect(errorBanner).toBeInTheDocument();
      expect(errorBanner).toHaveTextContent(errorMessage);
    });
  });

  test('should clear error banner when new request is submitted', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-123',
      ticker: 'MSFT',
      template: 'custom',
      market_context: { price: 380.0, rsi: 60.0, sentiment_score: 0.6 },
      results: [],
    };

    vi.mocked(apiLib.runModelComparison).mockRejectedValueOnce(new Error('Network error'));

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    const submitButton = screen.getByTestId('submit-button');

    await user.type(tickerInput, 'AAPL');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    vi.mocked(apiLib.runModelComparison).mockResolvedValueOnce(mockResponse);

    await user.clear(tickerInput);
    await user.type(tickerInput, 'MSFT');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByTestId('error-banner')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // AC4: Loading State with Skeleton Cards
  // =========================================================================

  test('should display skeleton cards while loading', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-def456',
      ticker: 'TSLA',
      template: 'custom',
      market_context: { price: 250.0, rsi: 70.0, sentiment_score: 0.8 },
      results: [],
    };

    vi.mocked(apiLib.runModelComparison).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockResponse), 100)),
    );

    render(<ModelComparisonPanel />);

    await user.type(screen.getByTestId('ticker-input'), 'TSLA');
    await user.click(screen.getByTestId('submit-button'));

    expect(screen.getByTestId('loading-skeletons')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeletons')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // AC5: Results Display with Consensus Bar
  // =========================================================================

  test('should display results with market context and consensus bar after submission', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-result123',
      ticker: 'NVDA',
      template: 'custom',
      market_context: { price: 875.5, rsi: 72.3, sentiment_score: 0.88 },
      results: [
        {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          rating: 'BUY',
          score: 85,
          confidence: 92,
          summary: 'Exceptional AI demand drivers',
          duration_ms: 380,
        },
        {
          provider: 'openai',
          model: 'gpt-4o',
          rating: 'BUY',
          score: 80,
          confidence: 78,
          summary: 'Strong upside momentum',
          duration_ms: 520,
        },
      ],
    };

    vi.mocked(apiLib.runModelComparison).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    await user.type(screen.getByTestId('ticker-input'), 'NVDA');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByText(/Price:/)).toBeInTheDocument();
      expect(screen.getByText(/875.5/)).toBeInTheDocument();
      expect(screen.getByText(/RSI:/)).toBeInTheDocument();
      expect(screen.getByText(/72.3/)).toBeInTheDocument();
      expect(screen.getByTestId('results-grid')).toBeInTheDocument();
      expect(screen.getByTestId('consensus-bar')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // AC6: Template Selector
  // =========================================================================

  test('should render template dropdown with default "custom" value', () => {
    render(<ModelComparisonPanel />);

    const select = screen.getByTestId('template-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('custom');
  });

  test('should change template when a different option is selected', async () => {
    const user = userEvent.setup();
    render(<ModelComparisonPanel />);

    const select = screen.getByTestId('template-select') as HTMLSelectElement;
    await user.selectOptions(select, 'bull_bear_thesis');
    expect(select.value).toBe('bull_bear_thesis');
  });

  test('should pass selected template to API call', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-tpl',
      ticker: 'AAPL',
      template: 'risk_summary',
      market_context: { price: 150.0, rsi: 50.0, sentiment_score: 0.0 },
      results: [],
    };

    vi.mocked(apiLib.runModelComparison).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    await user.selectOptions(screen.getByTestId('template-select'), 'risk_summary');
    await user.type(screen.getByTestId('ticker-input'), 'AAPL');
    await user.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      const callArgs = vi.mocked(apiLib.runModelComparison).mock.calls[0][0];
      expect(callArgs.template).toBe('risk_summary');
    });
  });

  test('should display all four template options', () => {
    render(<ModelComparisonPanel />);

    const select = screen.getByTestId('template-select');
    const options = within(select).getAllByRole('option');
    const values = options.map((o) => (o as HTMLOptionElement).value);

    expect(values).toContain('custom');
    expect(values).toContain('bull_bear_thesis');
    expect(values).toContain('risk_summary');
    expect(values).toContain('price_target');
  });
});
```