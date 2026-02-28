/**
 * TickerPulse AI v3.0 - API Client
 * Typed fetch wrappers for all backend REST endpoints.
 */

import type {
  AlertSoundSettings,
  AlertSoundType,
  PriceAlert,
  AlertConditionType,
  RefreshIntervalConfig,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Alert sound settings
// ---------------------------------------------------------------------------

export async function getAlertSoundSettings(): Promise<AlertSoundSettings> {
  return apiFetch<AlertSoundSettings>('/api/alerts/sound-settings');
}

export async function patchAlertSoundSettings(
  patch: Partial<AlertSoundSettings>,
): Promise<AlertSoundSettings> {
  return apiFetch<AlertSoundSettings>('/api/alerts/sound-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export async function patchAlertSound(
  alertId: number,
  soundType: AlertSoundType,
): Promise<{ id: number; sound_type: AlertSoundType }> {
  return apiFetch<{ id: number; sound_type: AlertSoundType }>(
    `/api/alerts/${alertId}/sound`,
    {
      method: 'PUT',
      body: JSON.stringify({ sound_type: soundType }),
    },
  );
}

// ---------------------------------------------------------------------------
// Price alerts CRUD
// ---------------------------------------------------------------------------

export async function getAlerts(): Promise<PriceAlert[]> {
  return apiFetch<PriceAlert[]>('/api/alerts');
}

export async function createAlert(params: {
  ticker: string;
  condition_type: AlertConditionType;
  threshold: number;
  sound_type?: AlertSoundType;
}): Promise<PriceAlert> {
  return apiFetch<PriceAlert>('/api/alerts', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function deleteAlert(alertId: number): Promise<{ success: boolean; id: number }> {
  return apiFetch<{ success: boolean; id: number }>(`/api/alerts/${alertId}`, {
    method: 'DELETE',
  });
}

export async function toggleAlert(alertId: number): Promise<PriceAlert> {
  return apiFetch<PriceAlert>(`/api/alerts/${alertId}/toggle`, {
    method: 'PUT',
  });
}

// ---------------------------------------------------------------------------
// Refresh interval settings
// ---------------------------------------------------------------------------

export async function getRefreshInterval(): Promise<RefreshIntervalConfig> {
  return apiFetch<RefreshIntervalConfig>('/api/settings/refresh-interval');
}

export async function setRefreshInterval(interval: number): Promise<{ success: boolean; interval: number }> {
  return apiFetch<{ success: boolean; interval: number }>('/api/settings/refresh-interval', {
    method: 'PUT',
    body: JSON.stringify({ interval }),
  });
}

// ---------------------------------------------------------------------------
// App state persistence
// ---------------------------------------------------------------------------

export async function getState(): Promise<Record<string, Record<string, unknown>>> {
  return apiFetch<Record<string, Record<string, unknown>>>('/api/app-state');
}

export async function patchState(
  updates: Record<string, Record<string, unknown> | null>,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/app-state', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}