import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePathname, useRouter } from 'next/navigation';
import MobileNav from '../MobileNav';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Menu: () => <div data-testid="menu-icon">Menu</div>,
  X: () => <div data-testid="close-icon">X</div>,
  LayoutDashboard: () => <div>Dashboard</div>,
  TrendingUp: () => <div>Stocks</div>,
  FileText: () => <div>Research</div>,
  Settings: () => <div>Settings</div>,
  ChevronRight: () => <div>Chevron</div>,
}));

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: 'LayoutDashboard' },
  { label: 'Stocks', href: '/stocks', icon: 'TrendingUp' },
  { label: 'Research', href: '/research', icon: 'FileText' },
  { label: 'Settings', href: '/settings', icon: 'Settings' },
];

describe('MobileNav Component', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  });

  /**
   * AC1: Mobile navigation renders hamburger button on small screens
   */
  test('renders hamburger button that is visible on mobile screens only', () => {
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    expect(hamburger).toBeInTheDocument();
    expect(hamburger).toHaveClass('md:hidden');
  });

  /**
   * AC1: Drawer opens when hamburger is clicked
   */
  test('opens navigation drawer when hamburger button is clicked', async () => {
    const user = userEvent.setup();
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });

    // Drawer should not be visible initially
    expect(screen.queryByRole('navigation', { hidden: false })).not.toBeInTheDocument();

    // Click hamburger to open
    await user.click(hamburger);

    // Drawer should now be visible
    const drawer = screen.getByRole('navigation');
    expect(drawer).toBeVisible();
  });

  /**
   * AC1: All navigation items are rendered in drawer
   */
  test('renders all navigation items in drawer', async () => {
    const user = userEvent.setup();
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    NAV_ITEMS.forEach((item) => {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    });
  });

  /**
   * AC1: Navigation links highlight active route
   */
  test('highlights active navigation link based on current pathname', async () => {
    (usePathname as jest.Mock).mockReturnValue('/stocks');
    const user = userEvent.setup();
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    const stocksLink = screen.getByRole('link', { name: /stocks/i });
    expect(stocksLink).toHaveClass('bg-blue-600/20', 'text-blue-400');
  });

  /**
   * AC2: Drawer closes when navigation link is clicked
   */
  test('closes drawer when a navigation link is clicked', async () => {
    const user = userEvent.setup();
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    const stocksLink = screen.getByRole('link', { name: /stocks/i });
    await user.click(stocksLink);

    // Drawer should be closed after clicking link
    const drawer = screen.queryByRole('navigation', { hidden: false });
    expect(drawer).not.toBeVisible();
  });

  /**
   * AC2: Close button (X icon) closes drawer
   */
  test('closes drawer when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    const closeButton = screen.getByRole('button', { name: /close navigation/i });
    await user.click(closeButton);

    const drawer = screen.queryByRole('navigation', { hidden: false });
    expect(drawer).not.toBeVisible();
  });

  /**
   * Edge case: Clicking backdrop closes drawer
   */
  test('closes drawer when backdrop overlay is clicked', async () => {
    const user = userEvent.setup();
    render(<MobileNav navItems={NAV_ITEMS} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    const backdrop = screen.getByTestId('mobile-nav-backdrop');
    await user.click(backdrop);

    const drawer = screen.queryByRole('navigation', { hidden: false });
    expect(drawer).not.toBeVisible();
  });

  /**
   * Edge case: Empty nav items array
   */
  test('renders empty drawer gracefully when nav items array is empty', async () => {
    const user = userEvent.setup();
    render(<MobileNav navItems={[]} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    const drawer = screen.getByRole('navigation');
    expect(drawer).toBeInTheDocument();
    expect(drawer.children.length).toBe(0);
  });

  /**
   * Edge case: Very long navigation labels truncate properly
   */
  test('truncates long navigation labels on mobile', async () => {
    const longNavItems = [
      { label: 'This is a very long navigation label that should truncate', href: '/', icon: 'LayoutDashboard' },
    ];
    const user = userEvent.setup();
    render(<MobileNav navItems={longNavItems} />);

    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    await user.click(hamburger);

    const link = screen.getByRole('link', { name: /very long/ });
    expect(link.querySelector('span')).toHaveClass('truncate');
  });
});
