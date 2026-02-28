import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import BottomNavBar from '../BottomNavBar';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  LayoutDashboard: () => <div>Dashboard Icon</div>,
  TrendingUp: () => <div>Stocks Icon</div>,
  FileText: () => <div>Research Icon</div>,
  Briefcase: () => <div>Portfolio Icon</div>,
  Settings: () => <div>Settings Icon</div>,
}));

const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
  { label: 'Stocks', href: '/stocks', icon: 'TrendingUp' },
  { label: 'Research', href: '/research', icon: 'FileText' },
  { label: 'Portfolio', href: '/portfolio', icon: 'Briefcase' },
  { label: 'Settings', href: '/settings', icon: 'Settings' },
];

describe('BottomNavBar Component', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
  });

  /**
   * AC2: Bottom navigation bar renders on mobile screens
   */
  test('renders bottom navigation bar on mobile screens', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const navbar = screen.getByRole('navigation', { name: /bottom navigation/i });
    expect(navbar).toBeInTheDocument();
    expect(navbar).toHaveClass('md:hidden');
  });

  /**
   * AC2: Bottom nav is hidden on desktop (md breakpoint and above)
   */
  test('applies md:hidden class to hide navigation on larger screens', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const navbar = screen.getByRole('navigation', { name: /bottom navigation/i });
    expect(navbar).toHaveClass('md:hidden');
  });

  /**
   * AC2: All 5 primary navigation items are rendered
   */
  test('renders exactly 5 primary navigation items', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const navLinks = screen.getAllByRole('link');
    expect(navLinks).toHaveLength(5);
  });

  /**
   * AC2: Active navigation item has correct styling (highlighted state)
   */
  test('highlights active navigation item with blue accent color', () => {
    (usePathname as jest.Mock).mockReturnValue('/stocks');
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const stocksLink = screen.getByRole('link', { name: /stocks/i });
    expect(stocksLink).toHaveClass('text-blue-400');
    expect(stocksLink.querySelector('svg')).toHaveClass('text-blue-400');
  });

  /**
   * AC2: Inactive navigation items have slate-400 color
   */
  test('inactive navigation items display with slate-400 color', () => {
    (usePathname as jest.Mock).mockReturnValue('/stocks');
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveClass('text-slate-400');
  });

  /**
   * AC2: Navigation bar sticks to bottom of viewport with fixed positioning
   */
  test('uses fixed positioning to stick to bottom of screen', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const navbar = screen.getByRole('navigation', { name: /bottom navigation/i });
    expect(navbar).toHaveClass('fixed', 'bottom-0', 'left-0', 'right-0');
  });

  /**
   * AC2: Navigation labels are hidden on small screens (label text only shows on sm and above)
   */
  test('hides navigation labels on very small screens', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const labels = screen.queryAllByText(/dashboard|stocks|research|portfolio|settings/i);
    // Labels should exist but may be hidden via CSS classes on mobile
    labels.forEach((label) => {
      expect(label.parentElement).toHaveClass('hidden', 'sm:inline');
    });
  });

  /**
   * Edge case: Custom className prop merges correctly
   */
  test('merges custom className prop with default classes', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} className="custom-class" />);

    const navbar = screen.getByRole('navigation', { name: /bottom navigation/i });
    expect(navbar).toHaveClass('custom-class');
    expect(navbar).toHaveClass('fixed', 'bottom-0'); // default classes still applied
  });

  /**
   * Edge case: Navigation works correctly with empty nav items
   */
  test('renders empty bottom nav gracefully when nav items array is empty', () => {
    render(<BottomNavBar navItems={[]} />);

    const navbar = screen.getByRole('navigation', { name: /bottom navigation/i });
    expect(navbar).toBeInTheDocument();

    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(0);
  });

  /**
   * Edge case: Root path (/) is correctly identified as active
   */
  test('correctly identifies root path as active for dashboard link', () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveClass('text-blue-400');
  });

  /**
   * Edge case: Sub-route active states work correctly
   */
  test('highlights parent nav item when on sub-route', () => {
    (usePathname as jest.Mock).mockReturnValue('/stocks/AAPL');
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const stocksLink = screen.getByRole('link', { name: /stocks/i });
    expect(stocksLink).toHaveClass('text-blue-400');
  });

  /**
   * Accessibility: Navigation bar has proper ARIA attributes
   */
  test('has proper accessibility attributes for navigation landmark', () => {
    render(<BottomNavBar navItems={PRIMARY_NAV_ITEMS} />);

    const navbar = screen.getByRole('navigation', { name: /bottom navigation/i });
    expect(navbar).toHaveAttribute('aria-label', 'Bottom navigation');
  });
});
