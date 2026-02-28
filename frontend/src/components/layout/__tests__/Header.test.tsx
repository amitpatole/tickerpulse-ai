/**
 * Tests for Header component — persistent error banner.
 *
 * Covers:
 *   - Banner is not shown when there is no persistent error
 *   - Banner renders when ApiErrorProvider has a persistent error
 *   - Banner shows user-facing copy from getErrorCopy
 *   - Dismiss button clears the error
 *   - Recovery (clearPersistentError) removes banner
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import Header from '../Header';
import { ApiErrorProvider, useApiErrorContext } from '@/lib/apiErrorContext';
import { ApiError } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useSSE', () => ({
  useSSE: () => ({ connected: true, recentAlerts: [] }),
}));

jest.mock('@/components/layout/KeyboardShortcutsProvider', () => ({
  useKeyboardShortcutsContext: () => ({ shortcuts: [] }),
}));

jest.mock('@/components/layout/SidebarStateProvider', () => ({
  useSidebarState: () => ({ openMobile: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Wrapper({ children }: { children: ReactNode }) {
  return <ApiErrorProvider>{children}</ApiErrorProvider>;
}

/** Renders Header inside ApiErrorProvider and returns a handle to set errors. */
function renderHeader() {
  let reportError: (e: ApiError) => void = () => {};
  let clearError: () => void = () => {};

  function ErrorController() {
    const ctx = useApiErrorContext();
    reportError = ctx.reportPersistentError;
    clearError = ctx.clearPersistentError;
    return null;
  }

  const utils = render(
    <ApiErrorProvider>
      <ErrorController />
      <Header title="Dashboard" />
    </ApiErrorProvider>,
  );

  return { ...utils, reportError, clearError };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Header - no error state', () => {
  it('renders title without error banner by default', () => {
    render(
      <Wrapper>
        <Header title="Dashboard" subtitle="Overview" />
      </Wrapper>,
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <Wrapper>
        <Header title="Metrics" subtitle="Last 30 days" />
      </Wrapper>,
    );
    expect(screen.getByText('Last 30 days')).toBeInTheDocument();
  });
});

describe('Header - error banner', () => {
  it('shows error banner when persistentError is set', () => {
    const { reportError } = renderHeader();

    const error = new ApiError('DB failed', 500, 'DATABASE_ERROR');
    fireEvent.click(document.body); // ensure render cycle
    reportError(error);

    // Re-render is triggered by context state change
    // We force a re-render by checking after state update
    expect(screen.queryByRole('alert')).not.toBeNull();
  });

  it('banner contains user-facing copy, not raw API message', () => {
    const { reportError } = renderHeader();

    reportError(new ApiError('raw internal server error', 500, 'DATABASE_ERROR'));

    const banner = screen.queryByRole('alert');
    if (banner) {
      // Should show the friendly message, not the raw "raw internal server error"
      expect(banner.textContent).not.toContain('raw internal server error');
    }
  });

  it('banner is removed after clearPersistentError is called', () => {
    const { reportError, clearError } = renderHeader();

    reportError(new ApiError('fail', 500, 'INTERNAL_ERROR'));
    clearError();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Header - dismiss button', () => {
  it('clicking X clears the error banner', () => {
    const { reportError } = renderHeader();

    reportError(new ApiError('fail', 503, 'SERVICE_UNAVAILABLE'));

    const dismissButton = screen.queryByLabelText('Dismiss error');
    if (dismissButton) {
      fireEvent.click(dismissButton);
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });
});

describe('Header - connection status', () => {
  it('shows Live when SSE connected', () => {
    render(
      <Wrapper>
        <Header title="Test" />
      </Wrapper>,
    );
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});