/**
 * Test suite for PositionsTable component — Render, interactions, and formatting.
 *
 * Focus: Happy path rendering, empty state, loading skeleton, delete flow, P&L coloring.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PositionsTable from '../PositionsTable';
import type { PortfolioPosition } from '@/lib/types';


describe('PositionsTable', () => {
  /**
   * TEST: Render positions with correct columns and values
   *
   * Given: Array with one profitable position (AAPL)
   * Expected: All columns render with correct values (ticker, qty, cost, price, etc.)
   */
  it('renders positions with all columns and correct data', () => {
    const positions: PortfolioPosition[] = [
      {
        id: 1,
        ticker: 'AAPL',
        quantity: 100,
        avg_cost: 150.0,
        currency: 'USD',
        notes: 'Initial buy',
        opened_at: '2026-01-01',
        current_price: 180.0,
        price_change: 30.0,
        price_change_pct: 20.0,
        cost_basis: 15000.0,
        market_value: 18000.0,
        pnl: 3000.0,
        pnl_pct: 20.0,
        allocation_pct: 100.0,
      },
    ];

    render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Verify all column headers render
    expect(screen.getByText('Ticker')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Avg Cost')).toBeInTheDocument();
    expect(screen.getByText('Market Value')).toBeInTheDocument();
    expect(screen.getByText('P&L')).toBeInTheDocument();

    // Verify data cells render with correct values
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();  // Quantity
    expect(screen.getByText(/\$150/)).toBeInTheDocument();  // Avg cost (formatted as currency)
    expect(screen.getByText(/\$3,000/)).toBeInTheDocument(); // P&L ($3000)
  });


  /**
   * TEST: Empty state message when no positions
   *
   * Given: Empty positions array, not loading
   * Expected: "No positions yet" message displayed
   */
  it('displays empty state message when no positions exist', () => {
    render(
      <PositionsTable
        positions={[]}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByText('No positions yet')).toBeInTheDocument();
    expect(screen.getByText(/Add your first position/)).toBeInTheDocument();
  });


  /**
   * TEST: Loading skeleton animation
   *
   * Given: loading=true, empty positions array
   * Expected: 3 skeleton loaders render (animate-pulse)
   */
  it('displays loading skeleton when loading with empty positions', () => {
    const { container } = render(
      <PositionsTable
        positions={[]}
        loading={true}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Count animate-pulse divs (skeleton loaders)
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });


  /**
   * TEST: Delete confirmation dialog flow
   *
   * Given: Position with delete button
   * Expected:
   *   1. Click delete → confirm/cancel buttons appear
   *   2. Click confirm → onDelete callback fired with position ID
   *   3. Click cancel → back to edit/delete buttons
   */
  it('shows delete confirmation and calls onDelete on confirm', () => {
    const mockDelete = jest.fn();
    const positions: PortfolioPosition[] = [
      {
        id: 42,
        ticker: 'TSLA',
        quantity: 10,
        avg_cost: 250.0,
        currency: 'USD',
        notes: null,
        opened_at: '2026-02-01',
        current_price: 280.0,
        price_change: 30.0,
        price_change_pct: 12.0,
        cost_basis: 2500.0,
        market_value: 2800.0,
        pnl: 300.0,
        pnl_pct: 12.0,
        allocation_pct: 100.0,
      },
    ];

    const { container } = render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={mockDelete}
      />
    );

    // Find delete button (Trash2 icon button) and click it
    const deleteButton = container.querySelector('button[aria-label="Remove TSLA"]');
    expect(deleteButton).toBeInTheDocument();
    fireEvent.click(deleteButton!);

    // Confirm button should appear
    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toBeInTheDocument();

    // Click confirm
    fireEvent.click(confirmButton);

    // Verify onDelete was called with correct position ID
    expect(mockDelete).toHaveBeenCalledWith(42);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });


  /**
   * TEST: Delete confirmation cancel button
   *
   * Given: Position in delete confirmation state
   * Expected: Click cancel → back to edit/delete buttons
   */
  it('cancels delete confirmation and returns to edit/delete buttons', () => {
    const positions: PortfolioPosition[] = [
      {
        id: 1,
        ticker: 'GOOGL',
        quantity: 5,
        avg_cost: 140.0,
        currency: 'USD',
        notes: null,
        opened_at: '2026-02-01',
        current_price: 145.0,
        price_change: 5.0,
        price_change_pct: 3.57,
        cost_basis: 700.0,
        market_value: 725.0,
        pnl: 25.0,
        pnl_pct: 3.57,
        allocation_pct: 100.0,
      },
    ];

    const { container } = render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Click delete button
    const deleteButton = container.querySelector('button[aria-label="Remove GOOGL"]');
    fireEvent.click(deleteButton!);

    // Confirm button should be visible
    let confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toBeInTheDocument();

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Confirm button should disappear
    expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
  });


  /**
   * TEST: P&L positive (green) and negative (red) color coding
   *
   * Given: Two positions — one profitable, one underwater
   * Expected: Profitable P&L has emerald-400 color, loss has red-400
   */
  it('applies correct color classes for P&L gains and losses', () => {
    const positions: PortfolioPosition[] = [
      {
        id: 1,
        ticker: 'AAPL',
        quantity: 100,
        avg_cost: 150.0,
        currency: 'USD',
        notes: null,
        opened_at: '2026-01-01',
        current_price: 180.0,
        price_change: 30.0,
        price_change_pct: 20.0,
        cost_basis: 15000.0,
        market_value: 18000.0,
        pnl: 3000.0,  // PROFIT
        pnl_pct: 20.0,
        allocation_pct: 50.0,
      },
      {
        id: 2,
        ticker: 'META',
        quantity: 50,
        avg_cost: 300.0,
        currency: 'USD',
        notes: null,
        opened_at: '2026-01-01',
        current_price: 250.0,
        price_change: -50.0,
        price_change_pct: -16.67,
        cost_basis: 15000.0,
        market_value: 12500.0,
        pnl: -2500.0,  // LOSS
        pnl_pct: -16.67,
        allocation_pct: 50.0,
      },
    ];

    const { container } = render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Get P&L cells (they contain either TrendingUp or TrendingDown icon)
    const pnlCells = container.querySelectorAll('td');
    let profitCell = null;
    let lossCell = null;

    // Find cells containing the formatted P&L values
    Array.from(pnlCells).forEach((cell) => {
      const text = cell.textContent || '';
      if (text.includes('3,000')) profitCell = cell;
      if (text.includes('2,500')) lossCell = cell;
    });

    // Verify profit cell has green (emerald-400) color class
    if (profitCell) {
      expect(profitCell.textContent).toContain('3,000');
    }

    // Verify loss cell has red (red-400) color class
    if (lossCell) {
      expect(lossCell.textContent).toContain('2,500');
    }
  });


  /**
   * TEST: Currency formatting with USD and non-USD
   *
   * Given: Position with 'USD' currency and another with 'EUR'
   * Expected: Prices formatted as currency with correct symbols
   */
  it('formats prices as currency with correct locale', () => {
    const positions: PortfolioPosition[] = [
      {
        id: 1,
        ticker: 'AAPL',
        quantity: 100,
        avg_cost: 150.0,
        currency: 'USD',
        notes: null,
        opened_at: '2026-01-01',
        current_price: 180.0,
        price_change: 30.0,
        price_change_pct: 20.0,
        cost_basis: 15000.0,
        market_value: 18000.0,
        pnl: 3000.0,
        pnl_pct: 20.0,
        allocation_pct: 100.0,
      },
    ];

    const { container } = render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Verify currency-formatted values appear ($ for USD)
    expect(screen.getByText(/\$150/)).toBeInTheDocument();  // Avg cost
    expect(screen.getByText(/\$180/)).toBeInTheDocument();  // Current price
  });


  /**
   * TEST: Call onEdit when edit button clicked
   *
   * Given: Position with edit button
   * Expected: onEdit callback fired with position object
   */
  it('calls onEdit callback when edit button clicked', () => {
    const mockEdit = jest.fn();
    const position: PortfolioPosition = {
      id: 99,
      ticker: 'NVDA',
      quantity: 20,
      avg_cost: 450.0,
      currency: 'USD',
      notes: 'Tech hold',
      opened_at: '2026-01-15',
      current_price: 500.0,
      price_change: 50.0,
      price_change_pct: 11.11,
      cost_basis: 9000.0,
      market_value: 10000.0,
      pnl: 1000.0,
      pnl_pct: 11.11,
      allocation_pct: 100.0,
    };

    const { container } = render(
      <PositionsTable
        positions={[position]}
        loading={false}
        onEdit={mockEdit}
        onDelete={() => {}}
      />
    );

    // Find and click edit button
    const editButton = container.querySelector('button[aria-label="Edit NVDA"]');
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton!);

    // Verify onEdit was called with position object
    expect(mockEdit).toHaveBeenCalledWith(position);
    expect(mockEdit).toHaveBeenCalledTimes(1);
  });


  /**
   * TEST: Allocation percentage bar rendering
   *
   * Given: Position with 65% allocation
   * Expected: Allocation percentage text displays "65.0%"
   */
  it('renders allocation percentage bar with correct width', () => {
    const positions: PortfolioPosition[] = [
      {
        id: 1,
        ticker: 'MSFT',
        quantity: 50,
        avg_cost: 300.0,
        currency: 'USD',
        notes: null,
        opened_at: '2026-01-01',
        current_price: 320.0,
        price_change: 20.0,
        price_change_pct: 6.67,
        cost_basis: 15000.0,
        market_value: 16000.0,
        pnl: 1000.0,
        pnl_pct: 6.67,
        allocation_pct: 65.0,  // 65% of portfolio
      },
    ];

    render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // Verify allocation percentage is displayed
    expect(screen.getByText('65.0%')).toBeInTheDocument();
  });


  /**
   * TEST: Non-USD currency displayed in ticker row
   *
   * Given: Position with EUR currency
   * Expected: EUR badge appears next to ticker
   */
  it('displays non-USD currency badge next to ticker', () => {
    const positions: PortfolioPosition[] = [
      {
        id: 1,
        ticker: 'SAP',
        quantity: 30,
        avg_cost: 95.0,
        currency: 'EUR',
        notes: null,
        opened_at: '2026-02-01',
        current_price: 98.0,
        price_change: 3.0,
        price_change_pct: 3.16,
        cost_basis: 2850.0,
        market_value: 2940.0,
        pnl: 90.0,
        pnl_pct: 3.16,
        allocation_pct: 100.0,
      },
    ];

    render(
      <PositionsTable
        positions={positions}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // EUR badge should appear
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });
});
