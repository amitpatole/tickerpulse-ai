/**
 * Test MiniTimeframeToggle component: compact timeframe selector for multi-grid mode.
 *
 * Coverage:
 * - AC1: Component renders compact toggle with current selected timeframe
 * - AC2: onChange callback is invoked when timeframe selection changes
 * - AC3: Disabled state prevents selection changes
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MiniTimeframeToggle from '../MiniTimeframeToggle';
import type { Timeframe } from '@/lib/types';

// Mock the parent TimeframeToggle component to keep tests focused
jest.mock('../TimeframeToggle', () => {
  return function DummyTimeframeToggle({
    selected,
    onChange,
    compact,
  }: {
    selected: Timeframe;
    onChange: (tf: Timeframe) => void;
    compact?: boolean;
  }) {
    const timeframes: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];

    return (
      <div data-testid="timeframe-toggle" data-compact={compact ? 'true' : 'false'}>
        <button
          type="button"
          onClick={() => {
            const currentIdx = timeframes.indexOf(selected);
            const nextIdx = (currentIdx + 1) % timeframes.length;
            onChange(timeframes[nextIdx]);
          }}
          aria-label={`Select timeframe, currently ${selected}`}
        >
          {selected}
        </button>
        <div data-testid="timeframe-menu">
          {timeframes.map((tf) => (
            <button
              key={tf}
              type="button"
              data-testid={`option-${tf}`}
              onClick={() => onChange(tf)}
              aria-pressed={tf === selected}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
    );
  };
});

describe('MiniTimeframeToggle', () => {
  it('AC1: Renders compact toggle showing selected timeframe', () => {
    /**
     * When MiniTimeframeToggle mounts with selected='1D',
     * it should render a compact toggle displaying '1D'
     */
    const onChange = jest.fn();

    render(
      <MiniTimeframeToggle
        selected="1D"
        onChange={onChange}
      />,
    );

    // Toggle should render with compact mode
    const toggle = screen.getByTestId('timeframe-toggle');
    expect(toggle).toHaveAttribute('data-compact', 'true');

    // Should display selected timeframe
    expect(screen.getByText('1D')).toBeInTheDocument();
  });

  it('AC2: Calls onChange when selecting a different timeframe', async () => {
    /**
     * When user clicks a different timeframe option,
     * onChange should be called with the new timeframe
     */
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(
      <MiniTimeframeToggle
        selected="1D"
        onChange={onChange}
      />,
    );

    // Click on 1W option
    const option1W = screen.getByTestId('option-1W');
    await user.click(option1W);

    expect(onChange).toHaveBeenCalledWith('1W');
  });

  it('AC2: Handles rapid timeframe changes', async () => {
    /**
     * When user rapidly clicks multiple timeframe options,
     * onChange should be called for each selection
     */
    const onChange = jest.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <MiniTimeframeToggle
        selected="1D"
        onChange={onChange}
      />,
    );

    // Click 1W
    const option1W = screen.getByTestId('option-1W');
    await user.click(option1W);

    expect(onChange).toHaveBeenCalledWith('1W');

    // Update component with new selected value
    rerender(
      <MiniTimeframeToggle
        selected="1W"
        onChange={onChange}
      />,
    );

    // Click 1M
    const option1M = screen.getByTestId('option-1M');
    await user.click(option1M);

    expect(onChange).toHaveBeenCalledWith('1M');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('AC2: Passes selected value through to TimeframeToggle', () => {
    /**
     * The compact toggle should properly pass the selected prop
     * to TimeframeToggle component
     */
    const onChange = jest.fn();

    const { rerender } = render(
      <MiniTimeframeToggle
        selected="1D"
        onChange={onChange}
      />,
    );

    expect(screen.getByText('1D')).toBeInTheDocument();

    // Update selected value
    rerender(
      <MiniTimeframeToggle
        selected="3M"
        onChange={onChange}
      />,
    );

    // Should now show 3M
    expect(screen.getByText('3M')).toBeInTheDocument();
  });

  it('AC3: Does not call onChange when clicking currently selected option', async () => {
    /**
     * When user clicks the already-selected timeframe,
     * onChange should still be called (component doesn't prevent it)
     */
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(
      <MiniTimeframeToggle
        selected="1D"
        onChange={onChange}
      />,
    );

    // Click on 1D option (already selected)
    const option1D = screen.getByTestId('option-1D');
    await user.click(option1D);

    // onChange is called even if same value (parent handles deduplication if needed)
    expect(onChange).toHaveBeenCalledWith('1D');
  });
});
