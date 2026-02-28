/**
 * Tests for WSStatusIndicator component
 * Verifies:
 * - All WSStatus values render correctly ('open', 'connecting', 'closed', 'error')
 * - Error state displays proper visual indicators
 * - Tooltip text updates based on status
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import WSStatusIndicator from '../WSStatusIndicator';
import type { WSStatus } from '@/hooks/useWSPrices';

describe('WSStatusIndicator', () => {
  describe('Happy Path: All Status States', () => {
    it('should render with open status and green pulse', () => {
      render(<WSStatusIndicator status="open" />);

      const indicator = screen.getByTitle('WS live');
      expect(indicator).toBeInTheDocument();

      const dot = indicator.querySelector('span[aria-hidden="true"]');
      expect(dot).toHaveClass('bg-emerald-400');
      expect(dot).toHaveClass('animate-pulse');

      const label = screen.getByText('WS live');
      expect(label).toBeInTheDocument();
    });

    it('should render with connecting status and amber pulse', () => {
      render(<WSStatusIndicator status="connecting" />);

      const indicator = screen.getByTitle('WS connecting');
      expect(indicator).toBeInTheDocument();

      const dot = indicator.querySelector('span[aria-hidden="true"]');
      expect(dot).toHaveClass('bg-amber-400');
      expect(dot).toHaveClass('animate-pulse');

      const label = screen.getByText('WS connecting');
      expect(label).toBeInTheDocument();
    });

    it('should render with closed status and gray dot', () => {
      render(<WSStatusIndicator status="closed" />);

      const indicator = screen.getByTitle('WS offline');
      expect(indicator).toBeInTheDocument();

      const dot = indicator.querySelector('span[aria-hidden="true"]');
      expect(dot).toHaveClass('bg-slate-500');
      expect(dot).not.toHaveClass('animate-pulse');

      const label = screen.getByText('WS offline');
      expect(label).toBeInTheDocument();
    });

    it('should render with error status and red dot (NEW)', () => {
      render(<WSStatusIndicator status="error" />);

      const indicator = screen.getByTitle('WS error');
      expect(indicator).toBeInTheDocument();

      const dot = indicator.querySelector('span[aria-hidden="true"]');
      expect(dot).toHaveClass('bg-red-500');
      // Error state does not pulse (static red indicator)
      expect(dot).not.toHaveClass('animate-pulse');

      const label = screen.getByText('WS error');
      expect(label).toBeInTheDocument();
    });
  });

  describe('Edge Cases: lastUpdated Timestamp Display', () => {
    it('should include last update timestamp when status is open', () => {
      render(
        <WSStatusIndicator
          status="open"
          lastUpdated="2026-02-27T10:15:30Z"
        />
      );

      const indicator = screen.getByTitle(/WS live.*last update/);
      expect(indicator).toBeInTheDocument();
      expect(indicator.title).toContain('last update');
    });

    it('should not show last update timestamp when status is closed', () => {
      render(
        <WSStatusIndicator
          status="closed"
          lastUpdated="2026-02-27T10:15:30Z"
        />
      );

      const indicator = screen.getByTitle('WS offline');
      expect(indicator.title).not.toContain('last update');
    });

    it('should not show last update timestamp when status is error', () => {
      render(
        <WSStatusIndicator
          status="error"
          lastUpdated="2026-02-27T10:15:30Z"
        />
      );

      const indicator = screen.getByTitle('WS error');
      expect(indicator.title).not.toContain('last update');
    });

    it('should format lastUpdated timestamp as HH:MM:SS', () => {
      render(
        <WSStatusIndicator
          status="open"
          lastUpdated="2026-02-27T14:30:45Z"
        />
      );

      const indicator = screen.getByTitle(/last update/);
      // Time should be formatted (exact format depends on locale, but should contain colon-separated values)
      expect(indicator.title).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Error Cases: Invalid Timestamps', () => {
    it('should gracefully handle invalid timestamp format', () => {
      render(
        <WSStatusIndicator
          status="open"
          lastUpdated="not-a-date"
        />
      );

      // Component should still render even with bad timestamp
      const indicator = screen.getByTitle(/WS live/);
      expect(indicator).toBeInTheDocument();
      // Invalid timestamp is displayed as-is
      expect(indicator.title).toContain('not-a-date');
    });

    it('should handle empty timestamp string', () => {
      render(
        <WSStatusIndicator
          status="open"
          lastUpdated=""
        />
      );

      const label = screen.getByText('WS live');
      expect(label).toBeInTheDocument();
    });
  });

  describe('Accessibility: ARIA Labels and Roles', () => {
    it('should have aria-label matching tooltip text', () => {
      render(<WSStatusIndicator status="open" />);

      const indicator = screen.getByTitle('WS live');
      expect(indicator).toHaveAttribute('aria-label', 'WS live');
    });

    it('should have aria-hidden dot for decorative element', () => {
      render(<WSStatusIndicator status="open" />);

      const dot = screen.getByRole('doc-noteref', { hidden: true });
      // Note: aria-hidden="true" elements are hidden from role checking,
      // but we can verify structure
      const indicator = screen.getByTitle('WS live');
      const decorativeDot = indicator.querySelector('[aria-hidden="true"]');
      expect(decorativeDot).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have all status values include aria-label for screen readers', () => {
      const statuses: WSStatus[] = ['open', 'connecting', 'closed', 'error'];

      statuses.forEach((status) => {
        const { unmount } = render(<WSStatusIndicator status={status} />);

        const indicator = document.querySelector('[aria-label]');
        expect(indicator).toHaveAttribute('aria-label');

        unmount();
      });
    });
  });

  describe('Type Safety: WSStatus Type Completeness', () => {
    it('should accept all valid WSStatus values without type errors', () => {
      const validStatuses: WSStatus[] = [
        'connecting',
        'open',
        'closed',
        'error',
      ];

      validStatuses.forEach((status) => {
        const { unmount } = render(<WSStatusIndicator status={status} />);
        expect(screen.getByTitle(/WS/)).toBeInTheDocument();
        unmount();
      });
    });
  });
});
