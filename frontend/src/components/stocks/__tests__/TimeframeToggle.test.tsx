import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimeframeToggle, { STOCK_CHART_TIMEFRAMES } from '../TimeframeToggle';
import type { Timeframe } from '@/lib/types';

describe('TimeframeToggle', () => {
  describe('Single-select mode (default)', () => {
    test('AC2: Renders all timeframes as unselected buttons', () => {
      const onChange = jest.fn();
      render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
        />
      );

      // All timeframes should render
      for (const tf of STOCK_CHART_TIMEFRAMES) {
        const button = screen.getByRole('button', { name: tf });
        expect(button).toBeInTheDocument();
      }

      // Only selected timeframe should have aria-pressed=true
      const selected1D = screen.getByRole('button', { name: '1D' });
      expect(selected1D).toHaveAttribute('aria-pressed', 'true');

      const other1W = screen.getByRole('button', { name: '1W' });
      expect(other1W).toHaveAttribute('aria-pressed', 'false');
    });

    test('Happy path: Clicking a button triggers onChange with new timeframe', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
        />
      );

      const button1W = screen.getByRole('button', { name: '1W' });
      fireEvent.click(button1W);

      expect(onChange).toHaveBeenCalledWith('1W');
      expect(onChange).toHaveBeenCalledTimes(1);

      // Simulate selection change
      rerender(
        <TimeframeToggle
          selected="1W"
          onChange={onChange}
        />
      );

      const selected1W = screen.getByRole('button', { name: '1W' });
      expect(selected1W).toHaveAttribute('aria-pressed', 'true');
    });

    test('No buttons are disabled in single-select mode', () => {
      const onChange = jest.fn();
      render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
        />
      );

      for (const tf of STOCK_CHART_TIMEFRAMES) {
        const button = screen.getByRole('button', { name: tf });
        expect(button).not.toBeDisabled();
      }
    });
  });

  describe('Multi-select mode: constraint enforcement', () => {
    test('AC3: Can select 2-4 timeframes; min 2, max 4 enforced', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W']}
          onChange={onChange}
        />
      );

      // Both selected timeframes show aria-pressed=true
      expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'false');

      // Add 3rd timeframe
      fireEvent.click(screen.getByRole('button', { name: '1M' }));
      expect(onChange).toHaveBeenCalledWith(['1D', '1W', '1M']);

      // Simulate state update
      rerender(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W', '1M']}
          onChange={onChange}
        />
      );

      // Add 4th timeframe
      fireEvent.click(screen.getByRole('button', { name: '3M' }));
      expect(onChange).toHaveBeenLastCalledWith(['1D', '1W', '1M', '3M']);

      // Simulate state with 4 selected
      rerender(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W', '1M', '3M']}
          onChange={onChange}
        />
      );

      // Try to add 5th — should NOT call onChange (button disabled)
      const button6M = screen.getByRole('button', { name: '6M' });
      fireEvent.click(button6M);
      // onChange should still only have 2 calls (3rd and 4th selections)
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    test('AC4: Min 2 enforcement — cannot deselect when only 2 selected', () => {
      const onChange = jest.fn();
      render(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W']}
          onChange={onChange}
        />
      );

      const button1D = screen.getByRole('button', { name: '1D' });
      expect(button1D).toBeDisabled(); // Cannot deselect when at min 2

      fireEvent.click(button1D);
      expect(onChange).not.toHaveBeenCalled(); // onClick prevented, no callback

      const button1W = screen.getByRole('button', { name: '1W' });
      expect(button1W).toBeDisabled(); // Both are locked at min 2
      fireEvent.click(button1W);
      expect(onChange).not.toHaveBeenCalled();
    });

    test('AC4: Max 4 enforcement — cannot add when 4 selected', () => {
      const onChange = jest.fn();
      render(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W', '1M', '3M']}
          onChange={onChange}
        />
      );

      // Unselected buttons should be disabled
      const button6M = screen.getByRole('button', { name: '6M' });
      expect(button6M).toBeDisabled();

      const button1Y = screen.getByRole('button', { name: '1Y' });
      expect(button1Y).toBeDisabled();

      fireEvent.click(button6M);
      fireEvent.click(button1Y);
      expect(onChange).not.toHaveBeenCalled(); // Both prevented

      // Selected buttons should NOT be disabled (can deselect)
      const button1D = screen.getByRole('button', { name: '1D' });
      expect(button1D).not.toBeDisabled();

      fireEvent.click(button1D);
      expect(onChange).toHaveBeenCalledWith(['1W', '1M', '3M']); // Deselection allowed
    });

    test('Edge case: With 3 selected, can add or deselect without restriction', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W', '1M']}
          onChange={onChange}
        />
      );

      // Can deselect without hitting min-2 violation
      const button1D = screen.getByRole('button', { name: '1D' });
      expect(button1D).not.toBeDisabled();
      fireEvent.click(button1D);
      expect(onChange).toHaveBeenCalledWith(['1W', '1M']);

      onChange.mockClear();
      rerender(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W', '1M']}
          onChange={onChange}
        />
      );

      // Can add without hitting max-4 violation
      const button3M = screen.getByRole('button', { name: '3M' });
      expect(button3M).not.toBeDisabled();
      fireEvent.click(button3M);
      expect(onChange).toHaveBeenCalledWith(['1D', '1W', '1M', '3M']);
    });
  });

  describe('Compact mode styling', () => {
    test('Compact=true renders smaller button classes', () => {
      const onChange = jest.fn();
      const { container } = render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
          compact
        />
      );

      // Compact buttons should have compact-specific classes
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);

      // Verify compact sizing class is present
      const firstButton = buttons[0];
      expect(firstButton.className).toMatch(/text-\[11px\]/); // Compact size
    });

    test('Compact=false (default) renders standard button classes', () => {
      const onChange = jest.fn();
      const { container } = render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
          compact={false}
        />
      );

      const firstButton = container.querySelector('button');
      expect(firstButton?.className).toMatch(/min-h-\[44px\]/); // Standard size
    });
  });

  describe('Custom timeframes prop', () => {
    test('Renders only provided timeframes instead of defaults', () => {
      const onChange = jest.fn();
      const customTimeframes: Timeframe[] = ['1D', '1W', '1M'];

      render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
          timeframes={customTimeframes}
        />
      );

      // Only custom ones should exist
      expect(screen.getByRole('button', { name: '1D' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1W' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '1M' })).toBeInTheDocument();

      // Defaults not in custom list should not exist
      expect(screen.queryByRole('button', { name: '3M' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '1Y' })).not.toBeInTheDocument();
    });
  });

  describe('ARIA accessibility', () => {
    test('Renders with role="group" and aria-label for screen readers', () => {
      const onChange = jest.fn();
      const { container } = render(
        <TimeframeToggle
          selected="1D"
          onChange={onChange}
        />
      );

      const group = container.querySelector('[role="group"]');
      expect(group).toHaveAttribute('aria-label', 'Chart timeframe');
    });

    test('Buttons have aria-pressed reflecting selection state', () => {
      const onChange = jest.fn();
      render(
        <TimeframeToggle
          multiSelect
          selected={['1D', '1W']}
          onChange={onChange}
        />
      );

      expect(screen.getByRole('button', { name: '1D' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '1W' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
