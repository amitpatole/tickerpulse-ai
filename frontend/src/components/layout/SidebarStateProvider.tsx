'use client';

import { createContext, useContext, useState } from 'react';

interface SidebarStateContextValue {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarStateContext = createContext<SidebarStateContextValue>({
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarStateContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState() {
  return useContext(SidebarStateContext);
}
