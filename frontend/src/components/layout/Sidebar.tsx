```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Bot,
  FileSearch,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  History,
  Zap,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSidebarState } from './SidebarStateProvider';

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agents',    label: 'Agents',    icon: Bot             },
  { href: '/research',  label: 'Research',  icon: FileSearch      },
  { href: '/activity',  label: 'Activity',  icon: History         },
  { href: '/scheduler', label: 'Scheduler', icon: Calendar        },
  { href: '/settings',  label: 'Settings',  icon: Settings        },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebarState();

  // Close mobile drawer on route change
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <>
      {/* Mobile backdrop — sits behind drawer, closes it on tap */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-slate-700/50 bg-slate-900 transition-all duration-300',
          // Mobile: slide off-screen by default; slide in when mobileOpen
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: always visible; respect collapsed width
          'md:translate-x-0',
          collapsed && 'md:w-16',
        )}
      >
        {/* Logo + mobile close button */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-700/50 px-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-5 w-5 text-white" />
          </div>
          {/* Text: always visible on mobile (w-60 always), hidden on desktop-collapsed */}
          <div className={clsx('overflow-hidden', collapsed && 'md:hidden')}>
            <h1 className="text-sm font-bold text-white tracking-wide">TickerPulse AI</h1>
            <p className="text-[10px] text-slate-400">v3.0</p>
          </div>

          {/* Close button — mobile only */}
          <button
            onClick={closeMobile}
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors md:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {/* Label: always visible on mobile, hidden on desktop-collapsed */}
                <span className={clsx(collapsed && 'md:hidden')}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Connection Status */}
        <div className="border-t border-slate-700/50 p-3">
          <div className={clsx('flex items-center gap-2', collapsed && 'md:justify-center')}>
            <Activity className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            <span className={clsx('text-xs text-slate-400', collapsed && 'md:hidden')}>
              System Online
            </span>
          </div>
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={toggle}
          className="hidden h-10 items-center justify-center border-t border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors md:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      {/* Desktop spacer — pushes main content right. Hidden on mobile (drawer overlays). */}
      <div
        className={clsx(
          'hidden flex-shrink-0 transition-all duration-300 md:block',
          collapsed ? 'md:w-16' : 'md:w-60',
        )}
      />
    </>
  );
}
```