'use client';

/**
 * ThemeProvider — system-aware dark/light theme with persisted user preference.
 *
 * Resolves the effective theme in this order:
 *   1. User preference stored in the backend (synced via usePersistedState).
 *   2. localStorage snapshot for instant restore on mount (no flash).
 *   3. OS/browser prefers-color-scheme when preference is 'system'.
 *
 * Applies the resolved theme as a class ('dark' | 'light') on <html> and
 * reacts to OS preference changes in real time when the user has chosen 'system'.
 *
 * Smooth transitions are gated behind the `theme-transitioning` class so that
 * normal hover/focus interactions remain instantaneous.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
} from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

// localStorage key read by the inline init script in layout.tsx (flash prevention).
const LS_KEY = 'tickerpulse_pref_color_scheme';

interface ThemeContextValue {
  /** The user's stored preference (including 'system'). */
  theme: ThemeMode;
  /** The actual applied theme after resolving 'system' → OS preference. */
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  /** True while the initial server state is being fetched. */
  syncing: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => {},
  syncing: false,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

const TRANSITION_DURATION_MS = 300;

function applyTheme(resolved: ResolvedTheme): void {
  const html = document.documentElement;
  html.classList.add('theme-transitioning');
  html.classList.remove('dark', 'light');
  html.classList.add(resolved);
  setTimeout(() => html.classList.remove('theme-transitioning'), TRANSITION_DURATION_MS);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // usePersistedState returns { state, setState, getState, isLoading, error }.
  const { state, setState, isLoading } = usePersistedState();

  // Read the stored preference from the 'ui_prefs' namespace.
  const uiPrefs = (state['ui_prefs'] ?? {}) as Record<string, unknown>;
  const theme: ThemeMode = (uiPrefs.color_scheme as ThemeMode) ?? 'system';

  // Track the resolved (OS-adjusted) theme so we can update it when the OS
  // preference changes while the user is on 'system'.
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme)
  );

  // Apply theme to DOM whenever the preference changes, and persist to
  // localStorage so the init script in layout.tsx prevents a flash on next load.
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(theme));
    } catch (_) {}
  }, [theme]);

  // Mirror OS preference changes in real time (only when mode === 'system').
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setState('ui_prefs', { ...uiPrefs, color_scheme: mode });
    },
    [setState, uiPrefs]
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, syncing: isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}
