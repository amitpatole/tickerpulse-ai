'use client';

import { useEffect } from 'react';
import { setupGlobalHandlers } from '@/lib/errorReporter';

/**
 * Client-only component that installs global error handlers once on mount.
 * Renders nothing — exists purely for its side effect.
 *
 * Placed in the root layout so handlers are active for the entire app lifetime.
 */
export default function GlobalErrorSetup(): null {
  useEffect(() => {
    setupGlobalHandlers();
  }, []);

  return null;
}
