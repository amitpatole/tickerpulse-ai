import type { Metadata } from 'next';
import './globals.css';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import GlobalErrorSetup from '@/components/layout/GlobalErrorSetup';
import AppShell from '@/components/layout/AppShell';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const metadata: Metadata = {
  title: 'TickerPulse AI',
  description: 'Real-time stock monitoring and AI-powered market intelligence',
};

/**
 * Inline script injected into <head> to apply the correct theme class on
 * <html> before the first paint, preventing a flash of the wrong theme.
 *
 * Reads `tickerpulse_pref_color_scheme` from localStorage (written by
 * usePersistedState with the `tickerpulse_pref_` prefix).  Falls back to
 * the OS preference when the stored value is 'system' or absent.
 */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('tickerpulse_pref_color_scheme');
    var pref = stored ? JSON.parse(stored) : 'system';
    var resolved =
      pref === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : pref === 'light' ? 'light' : 'dark';
    document.documentElement.classList.add(resolved);
  } catch (_) {
    document.documentElement.classList.add('dark');
  }
})();
`.trim();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs synchronously before first paint to prevent flash of wrong theme */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <ThemeProvider>
          <GlobalErrorSetup />
          <ErrorBoundary>
            <AppShell>{children}</AppShell>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
