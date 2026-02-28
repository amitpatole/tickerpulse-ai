```typescript
'use client';

import { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';

const STATE_KEY = 'sidebar';

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  isLoading: boolean;
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
  isLoading: true,
  mobileOpen: false,
  openMobile: () => {},
  closeMobile: () => {},
});

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const { getState, setState, isLoading } = usePersistedState();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hydratedRef = useRef(false);

  // Hydrate collapsed state once the persisted state has loaded from the server
  useEffect(() => {
    if (!isLoading && !hydratedRef.current) {
      hydratedRef.current = true;
      const persisted = getState<{ collapsed?: boolean }>(STATE_KEY);
      if (persisted?.collapsed !== undefined) {
        setCollapsed(persisted.collapsed);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      setState(STATE_KEY, { collapsed: next });
      return next;
    });
  }, [setState]);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, isLoading, mobileOpen, openMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarState(): SidebarContextValue {
  return useContext(SidebarContext);
}
```