/**
 * SoundTypePicker Component Tests
 *
 * AC1: Render sound type selector with four options (default, chime, alarm, silent)
 * AC2: Preview button plays selected sound via playAlertSound
 * AC3: Preview disabled for 'silent' sound type
 * AC4: onChange callback fires with new sound type when selection changes
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SoundTypePicker, { SOUND_OPTIONS } from '../SoundTypePicker';
import * as alertSound from '@/lib/alertSound';

jest.mock('@/lib/alertSound');

describe('SoundTypePicker Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Renders all four sound options', () => {
    test('displays select element with all sound type options', () => {
      const handleChange = jest.fn();
      render(
        <SoundTypePicker
          value="default"
          onChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox', {
        name: /alert sound type/i,
      });
      expect(select).toBeInTheDocument();

      // Verify all four options exist
      SOUND_OPTIONS.forEach((opt) => {
        const option = screen.getByRole('option', { name: opt.label });
        expect(option).toBeInTheDocument();
        expect(option).toHaveValue(opt.value);
      });
    });

    test('correctly selects current value in dropdown', () => {
      const handleChange = jest.fn();
      const { rerender } = render(
        <SoundTypePicker
          value="chime"
          onChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('chime');

      // Change value and verify it updates
      rerender(
        <SoundTypePicker
          value="alarm"
          onChange={handleChange}
        />
      );

      expect(select.value).toBe('alarm');
    });
  });

  describe('AC2: Preview button plays selected sound', () => {
    test('preview button calls playAlertSound with selected sound type', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="alarm"
          onChange={handleChange}
          volume={80}
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      });

      await user.click(previewButton);

      expect(alertSound.playAlertSound).toHaveBeenCalledWith('alarm', 0.8);
    });

    test('preview resolves default sound type to chime for playback', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="default"
          onChange={handleChange}
          volume={70}
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      });

      await user.click(previewButton);

      // Default should resolve to 'chime' for preview
      expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
    });

    test('preview uses custom volume parameter', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      const { rerender } = render(
        <SoundTypePicker
          value="chime"
          onChange={handleChange}
          volume={50}
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      });

      await user.click(previewButton);
      expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.5);

      jest.clearAllMocks();

      // Test with higher volume
      rerender(
        <SoundTypePicker
          value="chime"
          onChange={handleChange}
          volume={100}
        />
      );

      await user.click(previewButton);
      expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 1.0);
    });
  });

  describe('AC3: Preview button disabled for silent sound', () => {
    test('disables preview button when sound_type is silent', () => {
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="silent"
          onChange={handleChange}
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      }) as HTMLButtonElement;

      expect(previewButton.disabled).toBe(true);
      expect(previewButton).toHaveClass('disabled:opacity-40');
    });

    test('silent sound type does not trigger playback on preview click', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="silent"
          onChange={handleChange}
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      });

      await user.click(previewButton);

      expect(alertSound.playAlertSound).not.toHaveBeenCalled();
    });
  });

  describe('AC4: onChange fires when sound type changes', () => {
    test('onChange called with new value when user selects different sound', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="chime"
          onChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox', {
        name: /alert sound type/i,
      });

      await user.selectOptions(select, 'alarm');

      expect(handleChange).toHaveBeenCalledWith('alarm');
    });

    test('onChange called for each sound type option', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="default"
          onChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox');

      for (const option of SOUND_OPTIONS) {
        jest.clearAllMocks();
        await user.selectOptions(select, option.value);
        expect(handleChange).toHaveBeenCalledWith(option.value);
      }
    });

    test('disabled prop prevents onChange from firing', async () => {
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="chime"
          onChange={handleChange}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.disabled).toBe(true);
    });
  });

  describe('Accessibility', () => {
    test('select has proper aria-label', () => {
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="default"
          onChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toHaveAttribute('aria-label', 'Alert sound type');
    });

    test('preview button has proper aria-label', () => {
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="default"
          onChange={handleChange}
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      });
      expect(previewButton).toHaveAttribute(
        'aria-label',
        'Preview selected alert sound'
      );
    });

    test('play icon is marked as aria-hidden', () => {
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="default"
          onChange={handleChange}
        />
      );

      // The Play icon from lucide-react should have aria-hidden="true"
      const icon = screen.getByRole('button').querySelector('[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    test('renders with custom id prop for external label association', () => {
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          id="custom-sound-id"
          value="default"
          onChange={handleChange}
        />
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.id).toBe('custom-sound-id');
    });

    test('defaults volume to 70 when not provided', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();

      render(
        <SoundTypePicker
          value="chime"
          onChange={handleChange}
          // No volume prop
        />
      );

      const previewButton = screen.getByRole('button', {
        name: /preview selected alert sound/i,
      });

      await user.click(previewButton);

      expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
    });
  });
});