'use client';

import { createContext, useContext, useState } from 'react';

interface SidebarStateContextValue {
  // Mobile drawer state
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  // Desktop collapse state
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarStateContext = createContext<SidebarStateContextValue>({
  mobileOpen: false,
  setMobileOpen: () => {},
  toggle: () => {},
  close: () => {},
  collapsed: false,
  setCollapsed: () => {},
});

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const toggle = () => setMobileOpen((prev) => !prev);
  const close = () => setMobileOpen(false);

  return (
    <SidebarStateContext.Provider value={{ mobileOpen, setMobileOpen, toggle, close, collapsed, setCollapsed }}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState() {
  return useContext(SidebarStateContext);
}
