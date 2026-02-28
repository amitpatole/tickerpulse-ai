'use client';

import { Play } from 'lucide-react';
import { playAlertSound } from '@/lib/alertSound';

export const SOUND_OPTIONS: { value: string; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'chime', label: 'Chime' },
  { value: 'alarm', label: 'Alarm' },
  { value: 'silent', label: 'Silent' },
];

interface SoundTypePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Preview volume, 0–100. Defaults to 70. */
  volume?: number;
  disabled?: boolean;
  /** id applied to the <select> for external <label htmlFor> association. */
  id?: string;
}

/**
 * Reusable sound-type picker: a <select> with four options and an audition
 * button. Keyboard-navigable; the select carries its own aria-label so it
 * works standalone as well as inside a labelled form field.
 */
export default function SoundTypePicker({
  value,
  onChange,
  volume = 70,
  disabled = false,
  id,
}: SoundTypePickerProps) {
  function handlePreview() {
    if (value === 'silent') return;
    const effective = value === 'default' ? 'chime' : value;
    playAlertSound(effective, volume / 100);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Alert sound type"
        className="flex-1 rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
      >
        {SOUND_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handlePreview}
        disabled={disabled || value === 'silent'}
        aria-label="Preview selected alert sound"
        className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700/50 px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Play className="h-3 w-3" aria-hidden="true" />
        Preview
      </button>
    </div>
  );
}