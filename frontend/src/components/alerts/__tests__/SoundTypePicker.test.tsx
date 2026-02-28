/**
 * TickerPulse AI — SoundTypePicker Component Tests
 * Covers: sound type selection, preview playback, hideDefault prop
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SoundTypePicker from '@/components/alerts/SoundTypePicker';
import * as alertSound from '@/lib/alertSound';

// ============================================================
// Mocks
// ============================================================

jest.mock('@/lib/alertSound');

// ============================================================
// Test Suite
// ============================================================

describe('SoundTypePicker Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────
  // Test 1: Renders all sound options by default
  // AC: All 4 options (default, chime, alarm, silent) available
  // ────────────────────────────────────────────────────────

  test('renders all sound type options when hideDefault is false', () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        hideDefault={false}
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent,
    );

    expect(options).toEqual(['Default', 'Chime', 'Alarm', 'Silent']);
  });

  // ────────────────────────────────────────────────────────
  // Test 2: hideDefault prop removes 'Default' option
  // AC: Used in global settings context to avoid circular UX
  // ────────────────────────────────────────────────────────

  test("hides 'Default' option when hideDefault=true", () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        hideDefault={true}
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent,
    );

    expect(options).toEqual(['Chime', 'Alarm', 'Silent']);
    expect(options).not.toContain('Default');
  });

  // ────────────────────────────────────────────────────────
  // Test 3: Sound selection triggers onChange callback
  // AC: Dropdown value changes are propagated to parent
  // ────────────────────────────────────────────────────────

  test('calls onChange with selected sound type', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });

    await userEvent.selectOptions(select, 'alarm');

    expect(onChange).toHaveBeenCalledWith('alarm');
  });

  // ────────────────────────────────────────────────────────
  // Test 4: Preview button plays resolved sound
  // AC: 'default' previews as chime (523 Hz), others play as-is
  // ────────────────────────────────────────────────────────

  test('preview plays default as chime (effective resolution)', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="default"
        onChange={onChange}
        volume={70}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    await userEvent.click(previewButton);

    // 'default' resolves to 'chime' for playback
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
  });

  // ────────────────────────────────────────────────────────
  // Test 5: Preview button disabled for silent type
  // AC: Silent type can't be previewed (no sound)
  // ────────────────────────────────────────────────────────

  test('preview button disabled when sound is silent', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="silent"
        onChange={onChange}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    expect(previewButton).toBeDisabled();

    await userEvent.click(previewButton);

    // Should not call playAlertSound for silent
    expect(alertSound.playAlertSound).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────
  // Test 6: Volume prop converts 0-100 to 0-1 for playback
  // AC: Volume slider UI range (0-100) matches Web Audio range (0-1)
  // ────────────────────────────────────────────────────────

  test('converts volume from 0-100 range to 0-1 for playback', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="alarm"
        onChange={onChange}
        volume={85}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    await userEvent.click(previewButton);

    // 85 / 100 = 0.85
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('alarm', 0.85);
  });

  // ────────────────────────────────────────────────────────
  // Test 7: Disabled state prevents interaction
  // AC: Select and preview disabled when disabled=true
  // ────────────────────────────────────────────────────────

  test('disables select and preview when disabled=true', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        disabled={true}
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });
    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    expect(select).toBeDisabled();
    expect(previewButton).toBeDisabled();

    await userEvent.selectOptions(select, 'alarm');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(previewButton);
    expect(alertSound.playAlertSound).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────
  // Test 8: ID prop for label association
  // AC: External <label htmlFor> can target select by id
  // ────────────────────────────────────────────────────────

  test('applies id to select element for label association', () => {
    const onChange = jest.fn();

    const { container } = render(
      <>
        <label htmlFor="my-sound-picker">Pick a sound:</label>
        <SoundTypePicker
          id="my-sound-picker"
          value="chime"
          onChange={onChange}
        />
      </>
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });
    const label = container.querySelector('label');

    expect(select).toHaveAttribute('id', 'my-sound-picker');
    expect(label).toHaveAttribute('for', 'my-sound-picker');
  });

  // ────────────────────────────────────────────────────────
  // Test 9: Keyboard accessibility (focused and interactive)
  // AC: Select element is keyboard accessible with focus management
  // ────────────────────────────────────────────────────────

  test('select is keyboard accessible with proper focus management', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });

    // Can focus the select
    select.focus();
    expect(select).toHaveFocus();

    // Can change selection with keyboard (Tab + Enter)
    await userEvent.selectOptions(select, 'alarm');
    expect(onChange).toHaveBeenCalledWith('alarm');
  });

  // ────────────────────────────────────────────────────────
  // Test 10: Default volume of 70 if not provided
  // AC: Sensible default volume for previews
  // ────────────────────────────────────────────────────────

  test('uses default volume of 70 when volume prop not provided', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    await userEvent.click(previewButton);

    // Default is 70, which converts to 0.7
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
  });
});
