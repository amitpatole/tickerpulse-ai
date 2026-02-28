'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal';

interface KeyboardShortcutsContextValue {
  registerSearchInput: (el: HTMLInputElement | null) => void;
  registerNewsFeed: (cb: (() => void) | null) => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue>({
  registerSearchInput: () => {},
  registerNewsFeed: () => {},
});

export function useKeyboardShortcutsContext() {
  return useContext(KeyboardShortcutsContext);
}

export default function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const newsFeedCallbackRef = useRef<(() => void) | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const registerSearchInput = useCallback((el: HTMLInputElement | null) => {
    searchRef.current = el;
  }, []);

  const registerNewsFeed = useCallback((cb: (() => void) | null) => {
    newsFeedCallbackRef.current = cb;
  }, []);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  const focusNewsFeed = useCallback(() => {
    newsFeedCallbackRef.current?.();
  }, []);

  useKeyboardShortcuts({
    searchRef,
    onOpenHelp: openHelp,
    onCloseHelp: closeHelp,
    isHelpOpen,
    onFocusNewsFeed: focusNewsFeed,
  });

  return (
    <KeyboardShortcutsContext.Provider value={{ registerSearchInput, registerNewsFeed }}>
      {children}
      <KeyboardShortcutsModal isOpen={isHelpOpen} onClose={closeHelp} />
    </KeyboardShortcutsContext.Provider>
  );
