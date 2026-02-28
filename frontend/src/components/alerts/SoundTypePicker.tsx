'use client';

import { useCallback } from 'react';
import type { AlertSoundType } from '@/lib/types';
import { playAlertSound } from '@/lib/alertSound';

const SOUND_OPTIONS: Array<{ value: AlertSoundType; label: string }> = [
  { value: 'default', label: 'Default (use global)' },
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
  { value: 'silent', label: 'Silent' },
];

const SOUND_OPTIONS_NO_DEFAULT: Array<{ value: AlertSoundType; label: string }> = [
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
  { value: 'silent', label: 'Silent' },
];

interface SoundTypePickerProps {
  value: AlertSoundType;
  onChange: (type: AlertSoundType) => void;
  /** Preview volume (0–100). Defaults to 70. */
  volume?: number;
  /** When true, omits the 'default' option (for use in global settings context). */
  hideDefault?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SoundTypePicker({
  value,
  onChange,
  volume = 70,
  hideDefault = false,
  disabled = false,
  className = '',
}: SoundTypePickerProps) {
  const options = hideDefault ? SOUND_OPTIONS_NO_DEFAULT : SOUND_OPTIONS;

  const handlePreview = useCallback(() => {
    const previewType = value === 'default' ? 'chime' : value;
    if (previewType !== 'silent') {
      playAlertSound(previewType as Exclude<AlertSoundType, 'default'>, volume);
    }
  }, [value, volume]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AlertSoundType)}
        disabled={disabled}
        className="bg-slate-700 border border-slate-600 text-slate-100 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        aria-label="Sound type"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handlePreview}
        disabled={disabled || value === 'silent'}
        title="Preview sound"
        aria-label="Preview alert sound"
        className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
        </svg>
      </button>
    </div>
  );
}
