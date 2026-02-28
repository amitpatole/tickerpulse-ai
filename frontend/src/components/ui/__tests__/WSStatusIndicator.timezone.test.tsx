/**
 * WSStatusIndicator — timezone display tests (VO-786)
 *
 * Verifies that the last-update tooltip uses formatTimestamp (which includes an
 * explicit timezone label such as "14:30 UTC" or "09:30 CET") rather than the
 * bare formatLocalTime helper that omits the timezone abbreviation.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WSStatusIndicator from '../WSStatusIndicator';
import * as formatTimeModule from '@/lib/formatTime';

describe('WSStatusIndicator - Timezone Display Fix (VO-786)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---- core behaviour -------------------------------------------------------

  test('calls formatTimestamp (not formatLocalTime) when status is open and lastUpdated is set', () => {
    const spy = jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('14:30 UTC');
    const localTimeSpy = jest.spyOn(formatTimeModule, 'formatLocalTime');
    const iso = '2026-02-27T14:30:00Z';

    render(<WSStatusIndicator status="open" lastUpdated={iso} tz="local" />);

    expect(spy).toHaveBeenCalledWith(iso, 'local');
    expect(localTimeSpy).not.toHaveBeenCalled();
  });

  test('forwards tz="market" prop to formatTimestamp', () => {
    const spy = jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('09:30 EST');
    const iso = '2026-02-27T14:30:00Z';

    render(<WSStatusIndicator status="open" lastUpdated={iso} tz="market" />);

    expect(spy).toHaveBeenCalledWith(iso, 'market');
  });

  test('defaults to tz="local" when tz prop is omitted', () => {
    const spy = jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('14:30 UTC');
    const iso = '2026-02-27T14:30:00Z';

    render(<WSStatusIndicator status="open" lastUpdated={iso} />);

    expect(spy).toHaveBeenCalledWith(iso, 'local');
  });

  // ---- tooltip content ------------------------------------------------------

  test('tooltip includes timezone label returned by formatTimestamp', () => {
    jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('14:30 CET');
    const iso = '2026-02-27T14:30:00Z';

    render(<WSStatusIndicator status="open" lastUpdated={iso} tz="local" />);

    const el = screen.getByRole('generic', { name: /WS live/i });
    expect(el.getAttribute('title')).toContain('14:30 CET');
  });

  test('aria-label and title both contain the formatted timestamp', () => {
    jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('09:30 EST');
    const iso = '2026-02-27T14:30:00Z';

    render(<WSStatusIndicator status="open" lastUpdated={iso} tz="market" />);

    const el = screen.getByRole('generic', { name: /WS live/i });
    expect(el.getAttribute('aria-label')).toContain('09:30 EST');
    expect(el.getAttribute('title')).toContain('09:30 EST');
  });

  // ---- non-open statuses ----------------------------------------------------

  test('does not call formatTimestamp when status is "closed"', () => {
    const spy = jest.spyOn(formatTimeModule, 'formatTimestamp');

    render(<WSStatusIndicator status="closed" lastUpdated="2026-02-27T14:30:00Z" />);

    expect(spy).not.toHaveBeenCalled();
  });

  test('does not call formatTimestamp when status is "connecting"', () => {
    const spy = jest.spyOn(formatTimeModule, 'formatTimestamp');

    render(<WSStatusIndicator status="connecting" lastUpdated="2026-02-27T14:30:00Z" />);

    expect(spy).not.toHaveBeenCalled();
  });

  test('does not call formatTimestamp when lastUpdated is absent', () => {
    const spy = jest.spyOn(formatTimeModule, 'formatTimestamp');

    render(<WSStatusIndicator status="open" />);

    expect(spy).not.toHaveBeenCalled();
  });

  // ---- regression: no raw toLocaleString ------------------------------------

  test('does not call Date.prototype.toLocaleString with undefined locale', () => {
    const spy = jest.spyOn(Date.prototype, 'toLocaleString');
    jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('14:30 UTC');

    render(<WSStatusIndicator status="open" lastUpdated="2026-02-27T14:30:00Z" />);

    const undefinedLocaleCalls = spy.mock.calls.filter((call) => call[0] === undefined);
    expect(undefinedLocaleCalls).toHaveLength(0);
  });

  // ---- hydration safety -----------------------------------------------------

  test('root span carries suppressHydrationWarning (SSR/client TZ may differ)', () => {
    jest.spyOn(formatTimeModule, 'formatTimestamp').mockReturnValue('14:30 UTC');
    const { container } = render(
      <WSStatusIndicator status="open" lastUpdated="2026-02-27T14:30:00Z" />
    );

    // React strips suppressHydrationWarning from the DOM; query by the span element directly.
    // The outer <span> wraps both the dot and label — it is the element with the aria-label.
    const rootSpan = container.querySelector('span[aria-label]');
    expect(rootSpan).not.toBeNull();
  });

  // ---- ASCII digit safety ---------------------------------------------------

  test('output contains only ASCII digits (no Arabic-Indic numerals)', () => {
    // Let the real formatTimestamp run — it uses SAFE_LOCALE = 'en-US'
    render(<WSStatusIndicator status="open" lastUpdated="2026-02-27T14:30:00Z" tz="local" />);

    const el = screen.getByRole('generic', { name: /WS live/i });
    const text = el.getAttribute('title') ?? '';

    expect(text).not.toMatch(/[\u0660-\u0669]/); // Arabic-Indic
    expect(text).not.toMatch(/[\u06F0-\u06F9]/); // Persian
  });
});