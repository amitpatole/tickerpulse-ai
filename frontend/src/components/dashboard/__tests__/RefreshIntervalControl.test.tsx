```typescript
/**
 * Tests for RefreshIntervalControl component.
 *
 * Covers:
 * - Initial load: reads current interval from API
 * - Selection: changing interval writes to API
 * - Error handling: API failure reverts selection
 * - Manual mode: selecting 0 shows correct indicator state
 * - Live mode: non-zero value shows animate-pulse dot
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RefreshIntervalControl from '../RefreshIntervalControl';
import * as api from '@/lib/api';

jest.mock('@/lib/api');

const mockApi = api as jest.Mocked<typeof api>;

describe('RefreshIntervalControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial load', () => {
    it('reads current interval from API on mount and selects it', async () => {
      mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'db' });

      render(<RefreshIntervalControl />);

      await waitFor(() => {
        const select = screen.getByRole('combobox', { name: 'Price refresh interval' });
        expect(select).toHaveValue('30');
      });
    });

    it('falls back to 60s if getRefreshInterval fails', async () => {
      mockApi.getRefreshInterval.mockRejectedValue(new Error('Network error'));

      render(<RefreshIntervalControl />);

      await waitFor(() => {
        const select = screen.getByRole('combobox', { name: 'Price refresh interval' });
        expect(select).toHaveValue('60');
      });
    });

    it('disables select while loading (interval is null)', () => {
      // Never resolves — keeps interval null
      mockApi.getRefreshInterval.mockReturnValue(new Promise(() => {}));

      render(<RefreshIntervalControl />);

      const select = screen.getByRole('combobox', { name: 'Price refresh interval' });
      expect(select).toBeDisabled();
    });
  });

  describe('interval selection', () => {
    it('calls setRefreshInterval with new value when user selects an option', async () => {
      const user = userEvent.setup();
      mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'db' });
      mockApi.setRefreshInterval.mockResolvedValue({ success: true, interval: 60 });

      render(<RefreshIntervalControl />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('30');
      });

      await user.selectOptions(screen.getByRole('combobox'), '60');

      expect(mockApi.setRefreshInterval).toHaveBeenCalledWith(60);
    });

    it('calls onIntervalChanged callback after successful save', async () => {
      const user = userEvent.setup();
      const onChanged = jest.fn();
      mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'db' });
      mockApi.setRefreshInterval.mockResolvedValue({ success: true, interval: 15 });

      render(<RefreshIntervalControl onIntervalChanged={onChanged} />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('30');
      });

      await user.selectOptions(screen.getByRole('combobox'), '15');

      await waitFor(() => {
        expect(onChanged).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('error handling', () => {
    it('shows error message and reverts to previous value when save fails', async () => {
      const user = userEvent.setup();
      mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'db' });
      mockApi.setRefreshInterval.mockRejectedValue(new Error('Save error'));

      render(<RefreshIntervalControl />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('30');
      });

      await user.selectOptions(screen.getByRole('combobox'), '60');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
        expect(screen.getByRole('combobox')).toHaveValue('30');
      });
    });
  });

  describe('live indicator dot', () => {
    it('shows pulsing dot when interval is non-zero (live mode)', async () => {
      mockApi.getRefreshInterval.mockResolvedValue({ interval: 30, source: 'db' });

      const { container } = render(<RefreshIntervalControl />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('30');
      });

      const dot = container.querySelector('.animate-pulse');
      expect(dot).toBeInTheDocument();
    });

    it('shows static dot when interval is 0 (manual mode)', async () => {
      mockApi.getRefreshInterval.mockResolvedValue({ interval: 0, source: 'db' });

      const { container } = render(<RefreshIntervalControl />);

      await waitFor(() => {
        expect(screen.getByRole('combobox')).toHaveValue('0');
      });

      const dot = container.querySelector('.animate-pulse');
      expect(dot).not.toBeInTheDocument();
    });
  });
});
```