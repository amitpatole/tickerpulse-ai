'use client';

import { SidebarStateProvider } from '@/components/layout/SidebarStateProvider';
import Sidebar from '@/components/layout/Sidebar';
import KeyboardShortcutsProvider from '@/components/layout/KeyboardShortcutsProvider';

function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Flex row: Sidebar takes its own natural width as a flex item and pushes
     * the main content area to the right automatically. On mobile the sidebar
     * is an overlay (fixed position) so main fills the full viewport width.
     */
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarStateProvider>
      <KeyboardShortcutsProvider>
        <ShellLayout>{children}</ShellLayout>
      </KeyboardShortcutsProvider>
    </SidebarStateProvider>
  );
}