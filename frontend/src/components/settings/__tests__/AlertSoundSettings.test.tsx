import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AlertSoundSettings } from '../AlertSoundSettings';
import * as api from '@/lib/api';
import type { AlertSoundSettings as AlertSoundSettingsType } from '@/lib/types';

jest.mock('@/lib/api');
jest.mock('@/components/alerts/SoundTypePicker', () => ({
  SoundTypePicker: ({
    value,
    onChange,
    disabled,
    hideDefault,
  }: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    hideDefault?: boolean;
  }) => (
    <select
      data-testid="sound-type-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Sound type"
    >
      {!hideDefault && <option value="default">Default</option>}
      <option value="chime">Chime</option>
      <option value="alarm">Alarm</option>
      <option value="silent">Silent</option>
    </select>
  ),
}));

const defaultSettings: AlertSoundSettingsType = {
  enabled: true,
  sound_type: 'chime',
  volume: 70,
  mute_when_active: false,
};

describe('AlertSoundSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue({ ...defaultSettings });
    (api.patchAlertSoundSettings as jest.Mock).mockImplementation((patch) =>
      Promise.resolve({ ...defaultSettings, ...patch }),
    );
  });

  it('shows a loading indicator then renders controls after load', async () => {
    render(<AlertSoundSettings />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /toggle alert sounds/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('slider', { name: /alert volume/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /mute when window is active/i })).toBeInTheDocument();
    expect(screen.getByTestId('sound-type-picker')).toBeInTheDocument();
  });

  it('reflects initial settings from API', async () => {
    render(<AlertSoundSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle alert sounds/i }));

    const enabledToggle = screen.getByRole('switch', { name: /toggle alert sounds/i });
    expect(enabledToggle).toHaveAttribute('aria-checked', 'true');

    const volumeSlider = screen.getByRole('slider', { name: /alert volume/i });
    expect(volumeSlider).toHaveValue('70');

    expect(screen.getByTestId('sound-type-picker')).toHaveValue('chime');
  });

  it('disables volume, sound type, and mute controls when enabled is false', async () => {
    (api.getAlertSoundSettings as jest.Mock).mockResolvedValue({
      ...defaultSettings,
      enabled: false,
    });

    render(<AlertSoundSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle alert sounds/i }));

    expect(screen.getByRole('slider', { name: /alert volume/i })).toBeDisabled();
    expect(screen.getByTestId('sound-type-picker')).toBeDisabled();
    expect(screen.getByRole('switch', { name: /mute when window is active/i })).toBeDisabled();
  });

  it('calls patchAlertSoundSettings with enabled: false when toggle is clicked', async () => {
    render(<AlertSoundSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle alert sounds/i }));

    fireEvent.click(screen.getByRole('switch', { name: /toggle alert sounds/i }));

    await waitFor(() => {
      expect(api.patchAlertSoundSettings).toHaveBeenCalledWith({ enabled: false });
    });
  });

  it('calls patchAlertSoundSettings with mute_when_active: true when mute toggle is clicked', async () => {
    render(<AlertSoundSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /mute when window is active/i }));

    fireEvent.click(screen.getByRole('switch', { name: /mute when window is active/i }));

    await waitFor(() => {
      expect(api.patchAlertSoundSettings).toHaveBeenCalledWith({ mute_when_active: true });
    });
  });

  it('debounces volume changes — does not call API until 300ms after last change', async () => {
    jest.useFakeTimers();

    render(<AlertSoundSettings />);
    await act(async () => {
      await Promise.resolve(); // flush initial API call
    });
    await act(async () => {
      await Promise.resolve(); // flush setState
    });

    const slider = screen.getByRole('slider', { name: /alert volume/i });

    act(() => {
      fireEvent.change(slider, { target: { value: '40' } });
    });
    expect(api.patchAlertSoundSettings).not.toHaveBeenCalled();

    act(() => {
      fireEvent.change(slider, { target: { value: '50' } });
    });
    expect(api.patchAlertSoundSettings).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(api.patchAlertSoundSettings).toHaveBeenCalledTimes(1);
    expect(api.patchAlertSoundSettings).toHaveBeenCalledWith({ volume: 50 });

    jest.useRealTimers();
  });

  it('calls patchAlertSoundSettings with new sound_type on picker change', async () => {
    render(<AlertSoundSettings />);
    await waitFor(() => screen.getByTestId('sound-type-picker'));

    fireEvent.change(screen.getByTestId('sound-type-picker'), { target: { value: 'alarm' } });

    await waitFor(() => {
      expect(api.patchAlertSoundSettings).toHaveBeenCalledWith({ sound_type: 'alarm' });
    });
  });

  it('shows an error message when save fails', async () => {
    (api.patchAlertSoundSettings as jest.Mock).mockRejectedValue(new Error('Server error'));

    render(<AlertSoundSettings />);
    await waitFor(() => screen.getByRole('switch', { name: /toggle alert sounds/i }));

    fireEvent.click(screen.getByRole('switch', { name: /toggle alert sounds/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error');
    });
  });
});
