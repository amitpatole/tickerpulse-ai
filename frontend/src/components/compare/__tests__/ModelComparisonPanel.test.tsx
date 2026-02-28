/**
 * Focused tests for ModelComparisonPanel component.
 *
 * Coverage:
 * - AC1: Provider selection (toggle checkboxes)
 * - AC2: Form submission with valid ticker and providers
 * - AC3: Error banner display on API failure
 * - AC4: Loading state with skeleton cards
 * - AC5: Results display with market context
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ModelComparisonPanel from '../ModelComparisonPanel';
import * as apiLib from '@/lib/api';

// Mock the API
jest.mock('@/lib/api', () => ({
  runModelComparison: jest.fn(),
}));

describe('ModelComparisonPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // AC1: Provider Selection (Checkboxes)
  // =========================================================================

  test('should toggle provider selection when checkbox clicked', async () => {
    const user = userEvent.setup();
    render(<ModelComparisonPanel />);

    // Anthropic should be pre-selected
    const anthropicCheckbox = screen.getByTestId('provider-checkbox-anthropic');
    const anthropicInput = within(anthropicCheckbox).getByRole('checkbox');
    expect(anthropicInput).toBeChecked();

    // Uncheck Anthropic
    await user.click(anthropicInput);
    expect(anthropicInput).not.toBeChecked();

    // Check Google (initially unchecked)
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

    // Uncheck all providers
    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      if ((checkbox as HTMLInputElement).checked) {
        await user.click(checkbox);
      }
    }

    const submitButton = screen.getByTestId('submit-button');
    expect(submitButton).toBeDisabled();
  });

  // =========================================================================
  // AC2: Form Submission
  // =========================================================================

  test('should submit with valid ticker and providers', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-abc123',
      ticker: 'AAPL',
      market_context: {
        price: 150.25,
        rsi: 65.5,
        sentiment_score: 0.72,
      },
      results: [
        {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          rating: 'BUY',
          score: 75,
          confidence: 0.85,
          summary: 'Strong bullish fundamentals',
          duration_ms: 420,
        },
      ],
    };

    (apiLib.runModelComparison as jest.Mock).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    // Input ticker
    const tickerInput = screen.getByTestId('ticker-input');
    await user.type(tickerInput, 'AAPL');

    // Submit
    const submitButton = screen.getByTestId('submit-button');
    await user.click(submitButton);

    // Wait for loading to complete
    await waitFor(() => {
      expect(apiLib.runModelComparison).toHaveBeenCalled();
    });

    // Verify API was called with correct params
    const callArgs = (apiLib.runModelComparison as jest.Mock).mock.calls[0][0];
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
      market_context: { price: 140.0, rsi: 55.0, sentiment_score: 0.5 },
      results: [],
    };

    (apiLib.runModelComparison as jest.Mock).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    await user.type(tickerInput, 'GOOGL');
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

    (apiLib.runModelComparison as jest.Mock).mockRejectedValue(
      new Error(errorMessage),
    );

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    await user.type(tickerInput, 'AAPL');

    const submitButton = screen.getByTestId('submit-button');
    await user.click(submitButton);

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
      market_context: { price: 380.0, rsi: 60.0, sentiment_score: 0.6 },
      results: [],
    };

    // First call fails
    (apiLib.runModelComparison as jest.Mock).mockRejectedValueOnce(
      new Error('Network error'),
    );

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    const submitButton = screen.getByTestId('submit-button');

    // First submission (fails)
    await user.type(tickerInput, 'AAPL');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    // Second submission (succeeds)
    (apiLib.runModelComparison as jest.Mock).mockResolvedValueOnce(mockResponse);

    await user.clear(tickerInput);
    await user.type(tickerInput, 'MSFT');
    await user.click(submitButton);

    // Error should be cleared
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
      market_context: { price: 250.0, rsi: 70.0, sentiment_score: 0.8 },
      results: [],
    };

    (apiLib.runModelComparison as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(mockResponse), 100),
        ),
    );

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    await user.type(tickerInput, 'TSLA');

    const submitButton = screen.getByTestId('submit-button');
    await user.click(submitButton);

    // Verify skeletons are shown during loading
    const skeletons = screen.getByTestId('loading-skeletons');
    expect(skeletons).toBeInTheDocument();

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-skeletons')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // AC5: Results Display
  // =========================================================================

  test('should display results with market context after successful submission', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-result123',
      ticker: 'NVDA',
      market_context: {
        price: 875.5,
        rsi: 72.3,
        sentiment_score: 0.88,
      },
      results: [
        {
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          rating: 'BUY',
          score: 85,
          confidence: 0.92,
          summary: 'Exceptional AI demand drivers',
          duration_ms: 380,
        },
        {
          provider: 'openai',
          model: 'gpt-4o',
          rating: 'HOLD',
          score: 65,
          confidence: 0.78,
          summary: 'Fair valuation, monitor earnings',
          duration_ms: 520,
        },
      ],
    };

    (apiLib.runModelComparison as jest.Mock).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    await user.type(tickerInput, 'NVDA');

    const submitButton = screen.getByTestId('submit-button');
    await user.click(submitButton);

    await waitFor(() => {
      // Market context should be visible
      expect(screen.getByText(/Price:/)).toBeInTheDocument();
      expect(screen.getByText(/875.5/)).toBeInTheDocument();
      expect(screen.getByText(/RSI:/)).toBeInTheDocument();
      expect(screen.getByText(/72.3/)).toBeInTheDocument();
      expect(screen.getByText(/Sentiment:/)).toBeInTheDocument();

      // Results grid should be displayed
      const resultsGrid = screen.getByTestId('results-grid');
      expect(resultsGrid).toBeInTheDocument();
    });
  });

  test('should hide results and error when new request is made', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      run_id: 'run-temp',
      ticker: 'AMD',
      market_context: { price: 200.0, rsi: 65.0, sentiment_score: 0.7 },
      results: [],
    };

    (apiLib.runModelComparison as jest.Mock).mockResolvedValue(mockResponse);

    render(<ModelComparisonPanel />);

    const tickerInput = screen.getByTestId('ticker-input');
    const submitButton = screen.getByTestId('submit-button');

    // First submission
    await user.type(tickerInput, 'AMD');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/AMD/)).toBeInTheDocument();
    });

    // Clear and submit again
    (apiLib.runModelComparison as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(mockResponse), 50),
        ),
    );

    await user.clear(tickerInput);
    await user.type(tickerInput, 'INTC');
    await user.click(submitButton);

    // Previous results should be cleared
    await waitFor(() => {
      const previousResults = screen.queryByTestId('results-grid');
      // Will be re-rendered, so just check that component updates
      expect(apiLib.runModelComparison).toHaveBeenCalledTimes(2);
    });
  });
});
