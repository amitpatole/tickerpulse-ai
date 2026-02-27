```tsx
'use client';

// ============================================================
// TickerPulse AI v3.0 — Global Error Handler Setup
// Registers window.onerror and unhandledrejection listeners
// once at application mount via errorReporter.setupGlobalHandlers.
// Renders nothing — purely a side-effect component.
// ============================================================

import { useEffect } from 'react';
import { setupGlobalHandlers } from '@/lib/errorReporter';

export default function GlobalErrorSetup(): null {
  useEffect(() => {
    setupGlobalHandlers();
  }, []);
  return null;
}
```