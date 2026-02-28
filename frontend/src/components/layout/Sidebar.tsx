'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  GitCompareArrows,
  Briefcase,
  Bot,
  Activity,
  BarChart2,
  Calendar,
  Clock,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSidebarState } from './SidebarStateProvider';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/',           icon: LayoutDashboard },
  { label: 'Stocks',     href: '/stocks',      icon: TrendingUp },
  { label: 'Earnings',   href: '/earnings',    icon: Calendar },
  { label: 'Research',   href: '/research',    icon: FileText },
  { label: 'Compare',    href: '/compare',     icon: GitCompareArrows },
  { label: 'Portfolio',  href: '/portfolio',   icon: Briefcase },
  { label: 'Agents',     href: '/agents',      icon: Bot },
  { label: 'Activity',   href: '/activity',    icon: Activity },
  { label: 'Metrics',    href: '/metrics',     icon: BarChart2 },
  { label: 'Scheduler',  href: '/scheduler',   icon: Clock },
  { label: 'Chat',       href: '/chat',        icon: MessageSquare },
  { label: 'Settings',   href: '/settings',    icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, close } = useSidebarState();

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  const nav = (inDrawer = false) => (
    <nav className="flex flex-col gap-0.5 px-2 py-3">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = isActive(href);
        const collapsedItem = !inDrawer && collapsed;
        return (
          <Link
            key={href}
            href={href}
            onClick={inDrawer ? close : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
              collapsedItem && 'justify-center',
            )}
            aria-current={active ? 'page' : undefined}
            title={collapsedItem ? label : undefined}
          >
            <Icon
              className={clsx('h-4 w-4 shrink-0', active ? 'text-blue-400' : 'text-slate-500')}
              aria-hidden="true"
            />
            {!collapsedItem && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar — part of flex layout, pushes main content naturally */}
      <aside
        className={clsx(
          'hidden flex-col border-r border-slate-700/50 bg-slate-900 transition-all duration-200 md:flex',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        {/* Logo / brand */}
        <div
          className={clsx(
            'flex h-16 shrink-0 items-center border-b border-slate-700/50 px-4',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight text-white">
              TickerPulse<span className="text-blue-400"> AI</span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">{nav()}</div>
      </aside>

      {/* Mobile overlay — shown via mobileOpen state */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          {/* Drawer */}
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900 shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-700/50 px-4">
              <span className="text-sm font-bold tracking-tight text-white">
                TickerPulse<span className="text-blue-400"> AI</span>
              </span>
              <button
                onClick={close}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav(true)}</div>
          </aside>
        </div>
      )}
    </>
  );
}
