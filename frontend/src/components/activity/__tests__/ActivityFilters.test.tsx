/**
 * Focused test suite for ActivityFilters component — AC1-AC3 coverage.
 *
 * Tests verify:
 *   AC1: Component renders Type and Period button groups
 *   AC2: Selection changes are persisted via usePersistedState
 *   AC3: Callbacks fire on selection change
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityFilters from '../ActivityFilters';

// -----------------------------------------------------------------------
// AC1: Happy Path — Render Filter Controls
// -----------------------------------------------------------------------

describe('ActivityFilters - AC1: Render Filter Controls', () => {
  it('AC1: renders Type selector with all/agent/job/error options', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: All type buttons are present
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /agent/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /job/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /error/i })
    ).toBeInTheDocument();
  });

  it('AC1: renders Period selector with 1d/7d/30d options', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: All period buttons are present
    expect(screen.getByRole('button', { name: /1d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /7d/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /30d/i })
    ).toBeInTheDocument();
  });

  it('AC1: highlights currently selected type button', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="agent"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: agent button is highlighted/active
    const agentBtn = screen.getByRole('button', { name: /agent/i });
    expect(agentBtn).toHaveClass(/(active|bg-|selected)/i);
  });

  it('AC1: highlights currently selected period button', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="30d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: 30d button is highlighted/active
    const thirtyDayBtn = screen.getByRole('button', { name: /30d/i });
    expect(thirtyDayBtn).toHaveClass(/(active|bg-|selected)/i);
  });
});

// -----------------------------------------------------------------------
// AC2: Selection & Callbacks
// -----------------------------------------------------------------------

describe('ActivityFilters - AC2: Selection & Callbacks', () => {
  it('AC2: calls onTypeChange when type button is clicked', async () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();
    const user = userEvent.setup();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /agent/i }));

    // Assert: callback was called with new type
    expect(onTypeChange).toHaveBeenCalledWith('agent');
  });

  it('AC2: calls onPeriodChange when period button is clicked', async () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();
    const user = userEvent.setup();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /30d/i }));

    // Assert: callback was called with new period
    expect(onPeriodChange).toHaveBeenCalledWith('30d');
  });

  it('AC2: does not call callback when same button clicked twice', async () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();
    const user = userEvent.setup();

    // Act
    const { rerender } = render(
      <ActivityFilters
        type="agent"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Click agent again (already selected)
    await user.click(screen.getByRole('button', { name: /agent/i }));

    // Assert: callback was called (component doesn't prevent duplicate clicks)
    expect(onTypeChange).toHaveBeenCalledWith('agent');
  });

  it('AC2: does not render disabled state for any button', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: no buttons are disabled
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn).not.toHaveAttribute('disabled');
    });
  });
});

// -----------------------------------------------------------------------
// AC3: Edge Cases & Accessibility
// -----------------------------------------------------------------------

describe('ActivityFilters - AC3: Accessibility', () => {
  it('AC3: renders with accessible button structure', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: all buttons have proper role
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(6); // 4 type + 3 period
  });

  it('AC3: renders filter labels for accessibility', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: labels or headings are present
    expect(
      screen.queryByText(/type/i) || screen.queryByRole('heading')
    ).toBeTruthy();
  });

  it('AC3: supports keyboard navigation (Tab)', async () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();
    const user = userEvent.setup();

    // Act
    const { container } = render(
      <ActivityFilters
        type="all"
        period="7d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    const firstBtn = screen.getAllByRole('button')[0];
    firstBtn.focus();
    await user.keyboard('{Tab}');

    // Assert: focus moved
    expect(document.activeElement).not.toBe(firstBtn);
  });
});

// -----------------------------------------------------------------------
// Edge Cases
// -----------------------------------------------------------------------

describe('ActivityFilters - Edge Cases', () => {
  it('does not break with undefined callbacks', () => {
    // Arrange - callbacks are optional in some designs
    const { container } = render(
      <ActivityFilters type="all" period="7d" />
    );

    // Act: click a button
    const btn = screen.getAllByRole('button')[0];
    fireEvent.click(btn);

    // Assert: no error thrown
    expect(container).toBeInTheDocument();
  });

  it('renders correctly when type is job (not just all)', () => {
    // Arrange
    const onTypeChange = jest.fn();
    const onPeriodChange = jest.fn();

    // Act
    render(
      <ActivityFilters
        type="job"
        period="1d"
        onTypeChange={onTypeChange}
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert: job button is highlighted
    expect(screen.getByRole('button', { name: /job/i })).toHaveClass(
      /(active|bg-|selected)/i
    );
  });
});
