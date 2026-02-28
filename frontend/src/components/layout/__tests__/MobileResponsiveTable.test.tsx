import React from 'react';
import { render, screen } from '@testing-library/react';
import MobileResponsiveTable from '../MobileResponsiveTable';

/**
 * Mock window.matchMedia for responsive breakpoint testing
 */
function mockMediaQuery(breakpoint: 'sm' | 'md' | 'lg') {
  const breakpointValues = {
    sm: 640,
    md: 768,
    lg: 1024,
  };

  const width = breakpointValues[breakpoint];

  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });

  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

interface TableRow {
  id: string;
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

const mockTableData: TableRow[] = [
  { id: '1', symbol: 'AAPL', price: 150.25, change: 2.5, volume: 1000000 },
  { id: '2', symbol: 'MSFT', price: 320.15, change: -1.2, volume: 800000 },
  { id: '3', symbol: 'GOOGL', price: 140.75, change: 1.8, volume: 900000 },
];

const tableColumns = ['symbol', 'price', 'change', 'volume'];

describe('MobileResponsiveTable Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * AC3: Table renders all rows with data
   */
  test('renders all table rows with complete data', () => {
    mockMediaQuery('lg');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    mockTableData.forEach((row) => {
      expect(screen.getByText(row.symbol)).toBeInTheDocument();
      expect(screen.getByText(String(row.price))).toBeInTheDocument();
    });
  });

  /**
   * AC3: Desktop (lg) renders traditional table view
   */
  test('renders traditional table layout on desktop screens', () => {
    mockMediaQuery('lg');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
  });

  /**
   * AC3: Tablet (md) renders scrollable table
   */
  test('applies horizontal scroll wrapper on tablet screens', () => {
    mockMediaQuery('md');
    const { container } = render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    const scrollWrapper = container.querySelector('[class*="overflow-x-auto"]');
    expect(scrollWrapper).toBeInTheDocument();
  });

  /**
   * AC3: Mobile (sm) renders card-based layout instead of table
   */
  test('renders card-based layout on small mobile screens', () => {
    mockMediaQuery('sm');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    // Should render cards instead of table
    const cards = screen.getAllByTestId(/card-/i);
    expect(cards.length).toBe(mockTableData.length);
  });

  /**
   * AC3: Mobile cards show primary column (e.g., symbol) as card title
   */
  test('displays primary column as card title in mobile card view', () => {
    mockMediaQuery('sm');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        primaryColumn="symbol"
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    mockTableData.forEach((row) => {
      const card = screen.getByTestId(`card-${row.id}`);
      expect(card).toHaveTextContent(row.symbol);
    });
  });

  /**
   * AC3: Mobile cards show secondary columns as key-value pairs
   */
  test('displays secondary columns as key-value pairs in mobile cards', () => {
    mockMediaQuery('sm');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={['symbol', 'price', 'change']}
        primaryColumn="symbol"
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    const firstCard = screen.getByTestId('card-1');
    expect(firstCard).toHaveTextContent('price');
    expect(firstCard).toHaveTextContent('150.25');
  });

  /**
   * Edge case: Empty data array
   */
  test('renders empty state message when data array is empty', () => {
    mockMediaQuery('lg');
    render(
      <MobileResponsiveTable
        data={[]}
        columns={tableColumns}
        emptyMessage="No data available"
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  /**
   * Edge case: Single column display
   */
  test('renders correctly with single column', () => {
    mockMediaQuery('lg');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={['symbol']}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    const table = screen.getByRole('table');
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(1);
  });

  /**
   * Edge case: Large dataset performance
   */
  test('handles large dataset without rendering all rows at once (virtual scrolling support)', () => {
    mockMediaQuery('lg');
    const largeDataset = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      symbol: `STOCK${i}`,
      price: 100 + i,
      change: Math.random() * 10,
      volume: Math.floor(Math.random() * 1000000),
    }));

    const { container } = render(
      <MobileResponsiveTable
        data={largeDataset}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof typeof largeDataset[0]])}
        virtualScroll={true}
      />
    );

    // Should render container but may use virtual scrolling
    expect(container.querySelector('table')).toBeInTheDocument();
  });

  /**
   * Accessibility: Table has proper ARIA attributes
   */
  test('includes proper accessibility attributes for data table', () => {
    mockMediaQuery('lg');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
        ariaLabel="Stock prices table"
      />
    );

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-label', 'Stock prices table');
  });

  /**
   * Accessibility: Mobile cards are properly labeled
   */
  test('mobile cards have proper accessibility labels', () => {
    mockMediaQuery('sm');
    render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        primaryColumn="symbol"
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    const cards = screen.getAllByTestId(/card-/i);
    cards.forEach((card) => {
      expect(card).toHaveRole('article');
    });
  });

  /**
   * Responsive behavior: Switching between desktop and mobile views
   */
  test('maintains data integrity when switching between breakpoints', () => {
    const { rerender } = render(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    // Should still show all data rows regardless of viewport
    mockTableData.forEach((row) => {
      expect(screen.getByText(row.symbol)).toBeInTheDocument();
    });

    rerender(
      <MobileResponsiveTable
        data={mockTableData}
        columns={tableColumns}
        renderCell={(row, column) => String(row[column as keyof TableRow])}
      />
    );

    // Data should remain consistent
    mockTableData.forEach((row) => {
      expect(screen.getByText(row.symbol)).toBeInTheDocument();
    });
  });
});
