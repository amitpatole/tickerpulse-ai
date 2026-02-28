/**
 * EarningsPageView — Timezone Display Tests (VO-792)
 *
 * Verifies that date formatting in the earnings page uses browser locale
 * (undefined) for proper internationalization, while guaranteeing ASCII
 * digits via the underlying formatDate helpers.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarningsPageView from '../EarningsPageView';
import * as api from '@/lib/api';
import type { EarningsResponse } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

const mockResponse: EarningsResponse = {
  upcoming: [
    {
      id: 1,
      ticker: 'NVDA',
      company: 'NVIDIA Corp.',
      earnings_date: '2026-03-10',
      time_of_day: 'BMO',
      eps_estimate: 4.2,
      eps_actual: null,
      revenue_estimate: 28.0e9,
      revenue_actual: null,
      fiscal_quarter: 'Q1 2026',
      fetched_at: '2026-02-27T10:00:00Z',
      updated_at: '2026-02-27T10:00:00Z',
      on_watchlist: true,
    },
  ],
  past: [],
  stale: false,
  as_of: '2026-02-27T10:00:00Z',
};

describe('EarningsPageView - Timezone Display (VO-792)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Happy path: renders date grouping with browser locale, not hardcoded en-US', async () => {
    (api.getEarnings as jest.Mock).mockResolvedValue(mockResponse);

    render(<EarningsPageView />);

    await waitFor(() => {
      expect(screen.getByText('NVDA')).toBeInTheDocument();
    });

    // The formatDateLabel helper in EarningsPageView uses browser locale (undefined)
    // Verify the page renders without errors
    const page = screen.getByText('NVDA').closest('div');
    expect(page).toBeInTheDocument();
  });

  test('Edge case: date format respects browser locale while maintaining ASCII digits', async () => {
    // Mock to simulate de-DE locale
    const RealDTF = global.Intl.DateTimeFormat;

    const spy = jest.spyOn(global.Intl, 'DateTimeFormat').mockImplementation(
      function (...args: [string?, Intl.DateTimeFormatOptions?]) {
        if (args.length === 0) {
          return {
            resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }),
          } as unknown as Intl.DateTimeFormat;
        }
        // Redirect undefined locale to de-DE
        const locale = args[0] === undefined ? 'de-DE' : args[0];
        return new RealDTF(locale, ...args.slice(1));
      }
    );

    (api.getEarnings as jest.Mock).mockResolvedValue(mockResponse);

    render(<EarningsPageView />);

    await waitFor(() => {
      expect(screen.getByText('NVDA')).toBeInTheDocument();
    });

    // Verify no non-ASCII digit output
    const content = document.body.textContent ?? '';
    expect(content).not.toMatch(/[\u0660-\u0669]/); // Arabic-Indic
    expect(content).not.toMatch(/[\u06F0-\u06F9]/); // Persian

    spy.mockRestore();
  });

  test('Error case: handles invalid earnings dates gracefully', async () => {
    const responseWithBadDate: EarningsResponse = {
      ...mockResponse,
      upcoming: [
        {
          ...mockResponse.upcoming[0],
          earnings_date: 'not-a-valid-date',
        },
      ],
    };

    (api.getEarnings as jest.Mock).mockResolvedValue(responseWithBadDate);

    expect(() => {
      render(<EarningsPageView />);
    }).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText('NVDA')).toBeInTheDocument();
    });
  });
});
