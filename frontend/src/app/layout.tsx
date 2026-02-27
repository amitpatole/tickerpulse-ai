```tsx
import type { Metadata } from 'next';
import './globals.css';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import GlobalErrorSetup from '@/components/layout/GlobalErrorSetup';

export const metadata: Metadata = {
  title: 'TickerPulse AI',
  description: 'Real-time stock monitoring and AI-powered market intelligence',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <GlobalErrorSetup />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
```