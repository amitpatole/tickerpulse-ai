"""
Multi-Model Comparison UI Tests

Tests the CompareLayout component: prompt form, concurrent polling, provider cards.
Covers: form submission, loading states, error display, results rendering.
"""

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { CompareLayout } from '../CompareLayout';


// ============================================================================
// Mocks and Fixtures
// ============================================================================

jest.mock('../../lib/api', () => ({
  createComparisonRun: jest.fn(),
  getComparisonRun: jest.fn(),
}));

const mockCreateComparisonRun = require('../../lib/api').createComparisonRun;
const mockGetComparisonRun = require('../../lib/api').getComparisonRun;


// ============================================================================
// Test 1: Component renders with form and input fields
// ============================================================================

describe('CompareLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders comparison form with prompt textarea and submit button', () => {
    render(<CompareLayout />);

    expect(screen.getByPlaceholderText(/enter your analysis prompt/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compare/i })).toBeInTheDocument();
  });

  // ========================================================================
  // Test 2: Form submission creates comparison run (happy path)
  // ========================================================================

  test('submitting form creates comparison run and shows loading state', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';
    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    render(<CompareLayout />);

    const promptInput = screen.getByPlaceholderText(/enter your analysis prompt/i);
    const submitButton = screen.getByRole('button', { name: /compare/i });

    // User types prompt and submits
    await userEvent.type(promptInput, 'Analyze AAPL growth potential');
    fireEvent.click(submitButton);

    // Verify API was called with the prompt
    expect(mockCreateComparisonRun).toHaveBeenCalledWith({
      prompt: 'Analyze AAPL growth potential',
    });

    // Verify loading state appears
    expect(screen.getByText(/comparing/i)).toBeInTheDocument();
  });

  // ========================================================================
  // Test 3: Loading state during polling
  // ========================================================================

  test('shows loading skeletons for each provider while run is pending', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';

    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    mockGetComparisonRun
      .mockResolvedValueOnce({
        run_id: mockRunId,
        status: 'pending',
        results: [],
      })
      .mockResolvedValueOnce({
        run_id: mockRunId,
        status: 'pending',
        results: [],
      });

    render(<CompareLayout />);

    const promptInput = screen.getByPlaceholderText(/enter your analysis prompt/i);
    const submitButton = screen.getByRole('button', { name: /compare/i });

    await userEvent.type(promptInput, 'Test prompt');
    fireEvent.click(submitButton);

    // Verify loading skeletons are displayed
    await waitFor(() => {
      const skeletons = screen.getAllByTestId(/skeleton/i);
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Test 4: Results render when comparison completes
  // ========================================================================

  test('displays provider cards with results after comparison completes', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';

    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    mockGetComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'complete',
      results: [
        {
          provider_name: 'gpt4',
          model: 'gpt-4',
          response: 'AAPL shows strong growth indicators...',
          latency_ms: 1500,
          error: null,
        },
        {
          provider_name: 'claude',
          model: 'claude-3-opus',
          response: 'AAPL demonstrates resilience despite market headwinds...',
          latency_ms: 2000,
          error: null,
        },
      ],
    });

    render(<CompareLayout />);

    const promptInput = screen.getByPlaceholderText(/enter your analysis prompt/i);
    await userEvent.type(promptInput, 'Compare perspectives on AAPL');
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    // Wait for results to appear
    await waitFor(() => {
      expect(screen.getByText(/gpt-4/i)).toBeInTheDocument();
      expect(screen.getByText(/claude-3-opus/i)).toBeInTheDocument();
    });

    // Verify responses are displayed
    expect(
      screen.getByText(/AAPL shows strong growth indicators/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AAPL demonstrates resilience/i)
    ).toBeInTheDocument();
  });

  // ========================================================================
  // Test 5: Error display when provider fails
  // ========================================================================

  test('displays error badge when provider fails', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';

    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    mockGetComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'complete',
      results: [
        {
          provider_name: 'gpt4',
          model: 'gpt-4',
          response: 'AAPL analysis...',
          latency_ms: 1500,
          error: null,
        },
        {
          provider_name: 'badprovider',
          model: 'unknown',
          response: null,
          latency_ms: 0,
          error: 'Failed to initialize provider',
        },
      ],
    });

    render(<CompareLayout />);

    await userEvent.type(
      screen.getByPlaceholderText(/enter your analysis prompt/i),
      'Test'
    );
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    // Verify error is displayed for failed provider
    await waitFor(() => {
      expect(screen.getByText(/Failed to initialize provider/i)).toBeInTheDocument();
    });

    // Verify successful provider still shows
    expect(screen.getByText(/AAPL analysis/i)).toBeInTheDocument();
  });

  // ========================================================================
  // Test 6: Provider cards show latency metrics
  // ========================================================================

  test('displays response latency for each provider', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';

    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    mockGetComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'complete',
      results: [
        {
          provider_name: 'gpt4',
          model: 'gpt-4',
          response: 'Response...',
          latency_ms: 1234,
          error: null,
        },
      ],
    });

    render(<CompareLayout />);

    await userEvent.type(
      screen.getByPlaceholderText(/enter your analysis prompt/i),
      'Test'
    );
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    // Verify latency is displayed
    await waitFor(() => {
      expect(screen.getByText(/1234\s*ms|1\.234\s*s/i)).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test 7: Form validation - empty prompt rejected
  // ========================================================================

  test('disables submit button when prompt is empty', () => {
    render(<CompareLayout />);

    const submitButton = screen.getByRole('button', { name: /compare/i });
    expect(submitButton).toBeDisabled();

    // Type prompt enables button
    const promptInput = screen.getByPlaceholderText(/enter your analysis prompt/i);
    fireEvent.change(promptInput, { target: { value: 'Test' } });

    expect(submitButton).not.toBeDisabled();
  });

  // ========================================================================
  // Test 8: Grid layout renders providers side-by-side
  // ========================================================================

  test('renders provider results in responsive grid layout', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';

    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    mockGetComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'complete',
      results: [
        {
          provider_name: 'gpt4',
          model: 'gpt-4',
          response: 'Response 1',
          latency_ms: 1500,
          error: null,
        },
        {
          provider_name: 'claude',
          model: 'claude-3-opus',
          response: 'Response 2',
          latency_ms: 2000,
          error: null,
        },
      ],
    });

    render(<CompareLayout />);

    await userEvent.type(
      screen.getByPlaceholderText(/enter your analysis prompt/i),
      'Test'
    );
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => {
      const resultsContainer = screen.getByRole('main', { hidden: true }) ||
        screen.getByTestId('results-grid');
      expect(resultsContainer).toHaveClass(/grid|flex/);
    });
  });

  // ========================================================================
  // Test 9: API error handling
  // ========================================================================

  test('displays error message when comparison creation fails', async () => {
    mockCreateComparisonRun.mockRejectedValue(
      new Error('Server error')
    );

    render(<CompareLayout />);

    await userEvent.type(
      screen.getByPlaceholderText(/enter your analysis prompt/i),
      'Test prompt'
    );
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    // Verify error message is shown
    await waitFor(() => {
      expect(
        screen.getByText(/error|failed|something went wrong/i)
      ).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Test 10: Clear / Reset comparison
  // ========================================================================

  test('allows user to start a new comparison after results display', async () => {
    const mockRunId = '550e8400-e29b-41d4-a716-446655440000';

    mockCreateComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'pending',
    });

    mockGetComparisonRun.mockResolvedValue({
      run_id: mockRunId,
      status: 'complete',
      results: [
        {
          provider_name: 'gpt4',
          model: 'gpt-4',
          response: 'Response',
          latency_ms: 1500,
          error: null,
        },
      ],
    });

    render(<CompareLayout />);

    // First comparison
    await userEvent.type(
      screen.getByPlaceholderText(/enter your analysis prompt/i),
      'First prompt'
    );
    fireEvent.click(screen.getByRole('button', { name: /compare/i }));

    await waitFor(() => {
      expect(screen.getByText(/Response/i)).toBeInTheDocument();
    });

    // Clear and start new
    const clearButton = screen.getByRole('button', { name: /clear|new|reset/i });
    fireEvent.click(clearButton);

    const promptInput = screen.getByPlaceholderText(/enter your analysis prompt/i) as HTMLInputElement;
    expect(promptInput.value).toBe('');
  });
});
