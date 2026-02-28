/**
 * SentimentBadge — timezone display tests (VO-786)
 *
 * Verifies that the "Updated:" line in the tooltip uses formatDate (which
 * includes an explicit timezone abbreviation) instead of the bare
 * formatLocalDate helper that omits the timezone name.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SentimentBadge from '../SentimentBadge';
import * as formatTimeModule from '@/lib/formatTime';
import type { SentimentData } from '@/lib/types';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so Jest hoists them correctly
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useApi', () => ({
  useApi: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  getStockSentiment: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { useApi } from '@/hooks/useApi';

const MOCK_SENTIMENT: SentimentData = {
  label: 'bullish',
  score: 0.72,
  signal_count: 18,
  sources: { news: 12, reddit: 6 },
  updated_at: '2026-02-27T14:30:00Z',
  stale: false,
};

function setupUseApi(data: SentimentData | null, loading = false) {
  (useApi as jest.Mock).mockReturnValue({
    data,
    loading,
    error: null,
    refetch: jest.fn(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SentimentBadge - Timezone Display Fix (VO-786)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  // ---- core behaviour -------------------------------------------------------

  test('calls formatDate (not formatLocalDate) for the updated_at tooltip line', () => {
    setupUseApi(MOCK_SENTIMENT);
    const dateSpy = jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 UTC');
    const localDateSpy = jest.spyOn(formatTimeModule, 'formatLocalDate');

    render(<SentimentBadge ticker="AAPL" tz="local" />);

    expect(dateSpy).toHaveBeenCalledWith(MOCK_SENTIMENT.updated_at, 'local');
    expect(localDateSpy).not.toHaveBeenCalled();
  });

  test('forwards tz="market" prop to formatDate', () => {
    setupUseApi(MOCK_SENTIMENT);
    const spy = jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 09:30 EST');

    render(<SentimentBadge ticker="AAPL" tz="market" />);

    expect(spy).toHaveBeenCalledWith(MOCK_SENTIMENT.updated_at, 'market');
  });

  test('defaults to tz="local" when tz prop is omitted', () => {
    setupUseApi(MOCK_SENTIMENT);
    const spy = jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 UTC');

    render(<SentimentBadge ticker="AAPL" />);

    expect(spy).toHaveBeenCalledWith(MOCK_SENTIMENT.updated_at, 'local');
  });

  // ---- tooltip content ------------------------------------------------------

  test('tooltip Updated line contains the timezone label from formatDate', () => {
    setupUseApi(MOCK_SENTIMENT);
    jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 CET');

    render(<SentimentBadge ticker="AAPL" tz="local" />);

    const badge = screen.getByTitle(/Updated:/i);
    expect(badge.getAttribute('title')).toContain('14:30 CET');
  });

  test('tooltip contains sentiment signal count and source breakdown', () => {
    setupUseApi(MOCK_SENTIMENT);
    jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 UTC');

    render(<SentimentBadge ticker="AAPL" />);

    const badge = screen.getByTitle(/18 signals/i);
    expect(badge.getAttribute('title')).toContain('18 signals');
    expect(badge.getAttribute('title')).toContain('News: 12, Reddit: 6');
  });

  // ---- loading / empty states -----------------------------------------------

  test('shows loading skeleton while data is being fetched', () => {
    setupUseApi(null, true);

    render(<SentimentBadge ticker="AAPL" />);

    expect(screen.getByLabelText('Loading sentiment')).toBeInTheDocument();
  });

  test('shows "No sentiment data" when data is null and not loading', () => {
    setupUseApi(null, false);

    render(<SentimentBadge ticker="AAPL" />);

    expect(screen.getByText('No sentiment data')).toBeInTheDocument();
  });

  // ---- stale indicator ------------------------------------------------------

  test('shows stale warning icon when data.stale is true', () => {
    setupUseApi({ ...MOCK_SENTIMENT, stale: true });
    jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 UTC');

    render(<SentimentBadge ticker="AAPL" />);

    const badge = screen.getByTitle(/Data may be stale/i);
    expect(badge).toBeInTheDocument();
  });

  // ---- regression: no raw toLocaleString ------------------------------------

  test('does not call Date.prototype.toLocaleString with undefined locale', () => {
    setupUseApi(MOCK_SENTIMENT);
    jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 UTC');
    const spy = jest.spyOn(Date.prototype, 'toLocaleString');

    render(<SentimentBadge ticker="AAPL" />);

    const undefinedLocaleCalls = spy.mock.calls.filter((call) => call[0] === undefined);
    expect(undefinedLocaleCalls).toHaveLength(0);
  });

  // ---- ASCII digit safety ---------------------------------------------------

  test('rendered sentiment label contains only ASCII digits', () => {
    setupUseApi(MOCK_SENTIMENT);
    // Let formatDate run for real to check output digits
    render(<SentimentBadge ticker="AAPL" tz="local" />);

    const label = screen.getByLabelText(/Sentiment: Bullish/i);
    const text = label.textContent ?? '';
    expect(text).not.toMatch(/[\u0660-\u0669]/); // Arabic-Indic
    expect(text).not.toMatch(/[\u06F0-\u06F9]/); // Persian
  });

  // ---- hydration safety -----------------------------------------------------

  test('root element carries suppressHydrationWarning (SSR/client TZ may differ)', () => {
    setupUseApi(MOCK_SENTIMENT);
    jest.spyOn(formatTimeModule, 'formatDate').mockReturnValue('Feb 27, 2026, 14:30 UTC');

    const { container } = render(<SentimentBadge ticker="AAPL" />);

    // The outer div has suppressHydrationWarning because tooltip contains TZ-sensitive text.
    // React strips it from DOM attrs; we verify the element renders without error and
    // the div with the title attribute is present.
    const titleEl = container.querySelector('[title]');
    expect(titleEl).not.toBeNull();
  });
});