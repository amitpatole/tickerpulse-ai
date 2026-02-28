'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ROUTE_MAP: Record<string, string> = {
  '1': '/',
  '2': '/agents',
  '3': '/research',
  '4': '/scheduler',
  '5': '/settings',
};

interface UseKeyboardShortcutsOptions {
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  isHelpOpen: boolean;
  onFocusNewsFeed?: () => void;
}

export function useKeyboardShortcuts({
  searchRef,
  onOpenHelp,
  onCloseHelp,
  isHelpOpen,
  onFocusNewsFeed,
}: UseKeyboardShortcutsOptions) {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Escape: always fires regardless of focus state
      if (e.key === 'Escape') {
        if (isHelpOpen) {
          onCloseHelp();
          return;
        }
        if (inInput) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      // Ctrl+K: focus search (bypasses input guard)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Ctrl+1-5: page navigation (bypasses input guard)
      if (e.ctrlKey && ROUTE_MAP[e.key]) {
        e.preventDefault();
        router.push(ROUTE_MAP[e.key]);
        return;
      }

      // Remaining shortcuts are blocked when typing in an input
      if (inInput) return;

      // /: focus search
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // ?: open help modal
      if (e.key === '?') {
        e.preventDefault();
        onOpenHelp();
        return;
      }

      // N: focus news feed
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onFocusNewsFeed?.();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, searchRef, onOpenHelp, onCloseHelp, isHelpOpen, onFocusNewsFeed]);
