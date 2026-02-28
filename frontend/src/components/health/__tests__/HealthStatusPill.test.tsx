/**
 * HealthStatusPill component tests
 *
 * Covers:
 *   - Renders green/Healthy indicator when status is 'ok'
 *   - Renders amber/Degraded indicator when status is 'degraded'
 *   - Renders red/Unreachable indicator when useHealth returns an error
 *   - Tooltip shows db latency and scheduler state on click
 *   - No crash when data is null (loading state)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HealthStatusPill from '../HealthStatusPill';
import type { HealthResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useHealth');

import { useHealth } from '@/hooks/useHealth';

const mockUseHealth = useHealth as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(status: 'ok' | 'degraded', latency = 2.5): HealthResponse {
  return {
    status,
    version: '3.0.0',
    timestamp: '2026-02-28T00:00:00Z',
    db: status,
    db_pool: 'ok',
    scheduler: 'ok',
    ai_provider: 'ok',
    error_log_count_1h: 0,
    checks: {
      db: { status: 'ok' },
      db_pool: { status: 'ok', pool_size: 5, available: 3 },
      scheduler: { status: 'ok', running: true, job_count: 2, timezone: 'UTC' },
      ai_provider: { status: 'ok', provider: 'anthropic' },
      ws_manager: { status: 'ok', client_count: 3 },
      errors: { count_1h: 0 },
    },
    services: {
      db: { status: 'ok', latency_ms: latency, wal_mode: 'wal', pool: null },
      scheduler: { status: 'ok', running: true, job_count: 2, timezone: 'UTC' },
      agent_registry: { status: 'ok', agent_count: 3 },
      data_providers: { status: 'ok', configured: true, providers: [] },
      data_freshness: {
        prices_updated_at: null,
        prices_age_min: null,
        earnings_updated_at: null,
        stale: false,
      },
    },
    metrics: { error_log_count_1h: 0, sse_client_count: 0 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HealthStatusPill - ok status', () => {
  it('renders Healthy label when status is ok', () => {
    vi.mocked(mockUseHealth).mockReturnValue({
      data: makeData('ok'),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<HealthStatusPill />);

    const btn = screen.getByRole('button', { name: /system health: healthy/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/emerald/);
  });
});

describe('HealthStatusPill - degraded status', () => {
  it('renders Degraded label when status is degraded', () => {
    vi.mocked(mockUseHealth).mockReturnValue({
      data: makeData('degraded'),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<HealthStatusPill />);

    const btn = screen.getByRole('button', { name: /system health: degraded/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/amber/);
  });
});

describe('HealthStatusPill - unreachable (fetch error)', () => {
  it('renders Unreachable label when useHealth returns an error', () => {
    vi.mocked(mockUseHealth).mockReturnValue({
      data: null,
      loading: false,
      error: 'Network Error',
      refetch: vi.fn(),
    });

    render(<HealthStatusPill />);

    const btn = screen.getByRole('button', { name: /system health: unreachable/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/red/);
  });
});

describe('HealthStatusPill - tooltip', () => {
  it('shows db latency and scheduler status in tooltip on click', () => {
    vi.mocked(mockUseHealth).mockReturnValue({
      data: makeData('ok', 4.2),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<HealthStatusPill />);

    fireEvent.click(screen.getByRole('button'));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain('4.2 ms');
    expect(tooltip.textContent).toContain('Running');
  });
});

describe('HealthStatusPill - loading state', () => {
  it('renders without crashing when data is null during initial load', () => {
    vi.mocked(mockUseHealth).mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<HealthStatusPill />);

    // During load we optimistically show 'ok' (no error yet)
    expect(screen.getByRole('button', { name: /system health: healthy/i })).toBeInTheDocument();
  });
});
