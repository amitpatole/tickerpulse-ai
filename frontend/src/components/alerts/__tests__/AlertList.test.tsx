import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AlertList } from '../AlertList';
import * as api from '@/lib/api';
import * as useApiModule from '@/hooks/useApi';
import type { PriceAlert } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('@/hooks/useApi');
jest.mock('@/components/alerts/SoundTypePicker', () => ({
  SoundTypePicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <select
      data-testid={`sound-picker-${value}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Alert sound type"
    >
      <option value="default">Default</option>
      <option value="chime">Chime</option>
      <option value="alarm">Alarm</option>
      <option value="silent">Silent</option>
    </select>
  ),
}));

const mockAlerts: PriceAlert[] = [
  {
    id: 1,
    ticker: 'AAPL',
    condition_type: 'price_above',
    threshold: 150.0,
    enabled: true,
    sound_type: 'default',
    fire_count: 0,
    triggered_at: null,
  },
  {
    id: 2,
    ticker: 'GOOGL',
    condition_type: 'price_below',
    threshold: 120.0,
    enabled: true,
    sound_type: 'chime',
    fire_count: 3,
    triggered_at: '2026-02-28T10:30:00Z',
  },
];

const mockRefetch = jest.fn();

describe('AlertList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially, then displays alerts', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    const { rerender } = render(<AlertList />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();

    // Now return data and rerender
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: mockAlerts,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    rerender(<AlertList />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('GOOGL')).toBeInTheDocument();
    });
  });

  it('shows empty state when no alerts exist', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<AlertList />);

    expect(screen.getByText(/no price alerts configured/i)).toBeInTheDocument();
  });

  it('displays error message when alert loading fails', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: null,
      loading: false,
      error: 'Network error',
      refetch: mockRefetch,
    });

    render(<AlertList />);

    expect(screen.getByText(/failed to load alerts: network error/i)).toBeInTheDocument();
  });

  it('renders alert conditions correctly for all condition types', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: mockAlerts,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<AlertList />);

    // Check price_above format
    expect(screen.getByText('above $150.00')).toBeInTheDocument();

    // Check price_below format
    expect(screen.getByText('below $120.00')).toBeInTheDocument();

    // Check fire count badge
    expect(screen.getByText('3×')).toBeInTheDocument();
  });

  it('toggles alert enabled state optimistically, refetches on error', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: mockAlerts,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    (api.toggleAlert as jest.Mock).mockRejectedValue(new Error('Toggle failed'));

    render(<AlertList />);

    const toggleButtons = screen.getAllByLabelText(/disable alert|enable alert/i);
    fireEvent.click(toggleButtons[0]); // Click first alert's toggle

    // Optimistic update happens before API call completes
    await waitFor(() => {
      expect(api.toggleAlert).toHaveBeenCalledWith(1);
    });

    // Error triggers refetch
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('deletes alert optimistically, refetches on error', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: mockAlerts,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    (api.deleteAlert as jest.Mock).mockRejectedValue(new Error('Delete failed'));

    render(<AlertList />);

    const deleteButtons = screen.getAllByLabelText(/delete alert/i);
    fireEvent.click(deleteButtons[0]); // Click first alert's delete

    // Optimistic removal happens immediately
    expect(api.deleteAlert).toHaveBeenCalledWith(1);

    // Error triggers refetch
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('changes per-alert sound type and refetches on error', async () => {
    (useApiModule.useApi as jest.Mock).mockReturnValue({
      data: mockAlerts,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    (api.patchAlertSound as jest.Mock).mockRejectedValue(new Error('Sound change failed'));

    render(<AlertList />);

    // Find the second alert's sound picker (GOOGL which has 'chime')
    const soundPicker = screen.getByTestId('sound-picker-chime');
    fireEvent.change(soundPicker, { target: { value: 'alarm' } });

    await waitFor(() => {
      expect(api.patchAlertSound).toHaveBeenCalledWith(2, 'alarm');
    });

    // Error triggers refetch
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});
