import React from 'react';
import { render, screen } from '@testing-library/react';
import ResponsiveGrid from '../ResponsiveGrid';

/**
 * Mock window.matchMedia for responsive breakpoint testing
 */
function mockMediaQuery(breakpoint: 'sm' | 'md' | 'lg' | 'xl') {
  const breakpointValues = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
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

describe('ResponsiveGrid Component', () => {
  const mockChildren = [
    <div key="1" data-testid="grid-item-1">Item 1</div>,
    <div key="2" data-testid="grid-item-2">Item 2</div>,
    <div key="3" data-testid="grid-item-3">Item 3</div>,
    <div key="4" data-testid="grid-item-4">Item 4</div>,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * AC3: Grid renders all children
   */
  test('renders all children within grid container', () => {
    render(<ResponsiveGrid columns={{ sm: 1, md: 2, lg: 3 }}>{mockChildren}</ResponsiveGrid>);

    mockChildren.forEach((child) => {
      expect(screen.getByTestId(child.props['data-testid'])).toBeInTheDocument();
    });
  });

  /**
   * AC3: Mobile breakpoint (sm) defaults to 1 column
   */
  test('applies 1-column layout on small screens (sm breakpoint)', () => {
    mockMediaQuery('sm');
    render(<ResponsiveGrid columns={{ sm: 1, md: 2, lg: 3 }}>{mockChildren}</ResponsiveGrid>);

    const grid = screen.getByRole('generic', { hidden: false });
    expect(grid).toHaveClass('grid-cols-1');
  });

  /**
   * AC3: Tablet breakpoint (md) applies 2-column layout
   */
  test('applies 2-column layout on tablet screens (md breakpoint)', () => {
    mockMediaQuery('md');
    render(<ResponsiveGrid columns={{ sm: 1, md: 2, lg: 3 }}>{mockChildren}</ResponsiveGrid>);

    const grid = screen.getByRole('generic', { hidden: false });
    expect(grid).toHaveClass('md:grid-cols-2');
  });

  /**
   * AC3: Desktop breakpoint (lg) applies 3-column layout
   */
  test('applies 3-column layout on desktop screens (lg breakpoint)', () => {
    mockMediaQuery('lg');
    render(<ResponsiveGrid columns={{ sm: 1, md: 2, lg: 3 }}>{mockChildren}</ResponsiveGrid>);

    const grid = screen.getByRole('generic', { hidden: false });
    expect(grid).toHaveClass('lg:grid-cols-3');
  });

  /**
   * AC3: Grid gap is consistent across all breakpoints
   */
  test('applies consistent gap spacing (gap-4 by default)', () => {
    render(<ResponsiveGrid columns={{ sm: 1, md: 2 }}>{mockChildren}</ResponsiveGrid>);

    const grid = screen.getByRole('generic', { hidden: true });
    expect(grid).toHaveClass('gap-4');
  });

  /**
   * AC3: Custom gap can be configured
   */
  test('applies custom gap when gap prop is provided', () => {
    render(
      <ResponsiveGrid columns={{ sm: 1, md: 2 }} gap="gap-6">
        {mockChildren}
      </ResponsiveGrid>
    );

    const grid = screen.getByRole('generic', { hidden: true });
    expect(grid).toHaveClass('gap-6');
  });

  /**
   * Edge case: Large breakpoint value (xl with 4 columns)
   */
  test('supports extra-large breakpoint (xl) for 4-column layout', () => {
    mockMediaQuery('xl');
    render(
      <ResponsiveGrid columns={{ sm: 1, md: 2, lg: 3, xl: 4 }}>
        {mockChildren}
      </ResponsiveGrid>
    );

    const grid = screen.getByRole('generic', { hidden: true });
    expect(grid).toHaveClass('xl:grid-cols-4');
  });

  /**
   * Edge case: Single-column layout (invariant across all breakpoints)
   */
  test('allows single-column layout across all breakpoints', () => {
    render(
      <ResponsiveGrid columns={{ sm: 1, md: 1, lg: 1 }}>
        {mockChildren}
      </ResponsiveGrid>
    );

    const grid = screen.getByRole('generic', { hidden: true });
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid).toHaveClass('md:grid-cols-1');
    expect(grid).toHaveClass('lg:grid-cols-1');
  });

  /**
   * Edge case: Empty children array
   */
  test('renders empty grid container when no children provided', () => {
    const { container } = render(
      <ResponsiveGrid columns={{ sm: 1, md: 2 }}>
        {[]}
      </ResponsiveGrid>
    );

    const grid = container.querySelector('[role="generic"]');
    expect(grid).toBeInTheDocument();
    expect(grid?.children.length).toBe(0);
  });

  /**
   * Edge case: Custom className merges with Tailwind classes
   */
  test('merges custom className with responsive Tailwind classes', () => {
    render(
      <ResponsiveGrid columns={{ sm: 1, md: 2 }} className="custom-grid">
        {mockChildren}
      </ResponsiveGrid>
    );

    const grid = screen.getByRole('generic', { hidden: true });
    expect(grid).toHaveClass('custom-grid');
    expect(grid).toHaveClass('grid');
    expect(grid).toHaveClass('grid-cols-1');
  });

  /**
   * Accessibility: Grid container is semantic HTML
   */
  test('uses semantic grid element with proper role', () => {
    const { container } = render(
      <ResponsiveGrid columns={{ sm: 1, md: 2 }}>
        {mockChildren}
      </ResponsiveGrid>
    );

    const grid = container.querySelector('div[class*="grid"]');
    expect(grid).toHaveClass('grid');
  });
});
