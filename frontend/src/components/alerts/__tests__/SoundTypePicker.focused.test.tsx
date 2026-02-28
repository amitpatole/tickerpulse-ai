/**
 * TickerPulse AI — SoundTypePicker Focused Tests
 * Covers: edge cases, error scenarios, accessibility edge cases
 * Tests focus on: boundary conditions, disabled states, preview behavior
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SoundTypePicker from '@/components/alerts/SoundTypePicker';
import * as alertSound from '@/lib/alertSound';

jest.mock('@/lib/alertSound');

describe('SoundTypePicker — Focused Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test 1: Volume boundary values (0%, 100%) produce correct Web Audio range
   * AC: Volume conversion accurate at extremes (0→0.0, 100→1.0)
   */
  test('converts boundary volume values correctly: 0% → 0.0, 100% → 1.0', async () => {
    const onChange = jest.fn();

    const { rerender } = render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        volume={0}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    await userEvent.click(previewButton);
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.0);

    jest.clearAllMocks();

    // Test upper boundary
    rerender(
      <SoundTypePicker
        value="alarm"
        onChange={onChange}
        volume={100}
      />
    );

    await userEvent.click(previewButton);
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('alarm', 1.0);
  });

  /**
   * Test 2: Rapid selection changes before preview finishes
   * AC: onChange fires with latest value, not stale value
   */
  test('onChange reflects latest selection despite rapid changes', async () => {
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

    // Rapid change: chime → alarm → silent
    await userEvent.selectOptions(select, 'alarm');
    await userEvent.selectOptions(select, 'silent');

    // onChange called twice; latest is 'silent'
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('silent');
  });

  /**
   * Test 3: Preview when disabled should not call playAlertSound
   * AC: Disabled picker blocks all interactions including preview click
   */
  test('disabled picker ignores preview clicks (no playAlertSound call)', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        disabled={true}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    // Try clicking disabled button
    await userEvent.click(previewButton);

    // Should never call playAlertSound
    expect(alertSound.playAlertSound).not.toHaveBeenCalled();
  });

  /**
   * Test 4: Silent type remains disabled even with enablement of other controls
   * AC: Silent sound always disables preview button (no sound to play)
   */
  test('silent sound disables preview button across all conditions', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="silent"
        onChange={onChange}
        disabled={false}
        volume={70}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    // Select is enabled, but preview button disabled because sound is 'silent'
    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });
    expect(select).not.toBeDisabled();
    expect(previewButton).toBeDisabled();
  });

  /**
   * Test 5: String value prop type coercion (e.g., value="chime" vs value as enum)
   * AC: Component accepts string value prop, not enforced to literal type
   */
  test('accepts string value prop without type errors', () => {
    const onChange = jest.fn();

    // Render with plain string (not typed AlertSoundType)
    const stringValue = 'chime' as any;

    render(
      <SoundTypePicker
        value={stringValue}
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });

    expect(select).toHaveValue('chime');
  });

  /**
   * Test 6: Preview with volume 50% (middle of range)
   * AC: Midpoint volume (50) converts to 0.5 correctly
   */
  test('converts midpoint volume 50% to 0.5 for Web Audio', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="alarm"
        onChange={onChange}
        volume={50}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    await userEvent.click(previewButton);

    expect(alertSound.playAlertSound).toHaveBeenCalledWith('alarm', 0.5);
  });

  /**
   * Test 7: HideDefault removes exactly one option (default only)
   * AC: hideDefault=true removes 'Default' but leaves 3 options
   */
  test('hideDefault removes only default option, keeps chime/alarm/silent', () => {
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

    const options = Array.from(select.querySelectorAll('option'));
    const optionTexts = options.map((o) => o.textContent);

    // Exactly 3 options, no 'Default'
    expect(options).toHaveLength(3);
    expect(optionTexts).toEqual(['Chime', 'Alarm', 'Silent']);
    expect(optionTexts).not.toContain('Default');
  });

  /**
   * Test 8: ID attribute missing doesn't break component
   * AC: Component works fine without id prop (optional)
   */
  test('renders correctly without id prop (optional)', () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        // id prop intentionally omitted
      />
    );

    const select = screen.getByRole('combobox', {
      name: /Alert sound type/i,
    });

    expect(select).toBeInTheDocument();
    expect(select).not.toHaveAttribute('id'); // No id set
  });

  /**
   * Test 9: Multiple previews in succession (rapid clicks)
   * AC: Each preview click triggers playback immediately, no debounce
   */
  test('multiple rapid preview clicks each trigger playback', async () => {
    const onChange = jest.fn();

    render(
      <SoundTypePicker
        value="chime"
        onChange={onChange}
        volume={70}
      />
    );

    const previewButton = screen.getByRole('button', {
      name: /Preview selected alert sound/i,
    });

    // Rapid clicks
    await userEvent.click(previewButton);
    await userEvent.click(previewButton);
    await userEvent.click(previewButton);

    // playAlertSound called 3 times (no debounce)
    expect(alertSound.playAlertSound).toHaveBeenCalledTimes(3);
    expect(alertSound.playAlertSound).toHaveBeenCalledWith('chime', 0.7);
  });

  /**
   * Test 10: onChange not called when selecting same value again
   * AC: Selecting already-selected option still triggers onChange (no diff check)
   */
  test('onChange fires even when reselecting current value', async () => {
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

    // Select 'chime' again (already selected)
    await userEvent.selectOptions(select, 'chime');

    expect(onChange).toHaveBeenCalledWith('chime');
  });
});
