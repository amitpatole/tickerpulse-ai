'use client';

/**
 * DashboardCustomizer — slide-over panel that lets users toggle widget
 * visibility and reorder widgets within each zone via up/down buttons.
 */

import { useEffect, useRef } from 'react';
import type { WidgetId } from '@/lib/types';
import type { WidgetZone, ZoneMeta } from '@/hooks/useDashboardLayout';
import { WIDGET_ZONES, WIDGET_LABELS } from '@/hooks/useDashboardLayout';

interface DashboardCustomizerProps {
  open: boolean;
  onClose: () => void;
  isEnabled: (id: WidgetId) => boolean;
  toggleWidget: (id: WidgetId) => void;
  moveWidget: (id: WidgetId, zoneIds: WidgetId[], direction: 'up' | 'down') => void;
  getSortedZone: (ids: WidgetId[]) => WidgetId[];
  resetLayout: () => void;
  syncing: boolean;
}

const ZONE_ORDER: WidgetZone[] = ['overview', 'left', 'right', 'analysis', 'tables'];

export default function DashboardCustomizer({
  open,
  onClose,
  isEnabled,
  toggleWidget,
  moveWidget,
  getSortedZone,
  resetLayout,
  syncing,
}: DashboardCustomizerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Trap focus within panel when open
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Customize Dashboard"
        className="relative ml-auto flex h-full w-full max-w-sm flex-col bg-slate-900 shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Customize Dashboard</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Toggle widgets on or off, and reorder within each section.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white"
            aria-label="Close customizer"
          >
            <XIcon />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-6">
            {ZONE_ORDER.map((zoneKey) => {
              const zone = WIDGET_ZONES[zoneKey];
              const sorted = getSortedZone(zone.ids);

              return (
                <ZoneSection
                  key={zoneKey}
                  zone={zone}
                  sortedIds={sorted}
                  isEnabled={isEnabled}
                  onToggle={toggleWidget}
                  onMove={(id, dir) => moveWidget(id, zone.ids, dir)}
                />
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={resetLayout}
              disabled={syncing}
              className="flex-1 rounded-lg border border-slate-600/50 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-50"
            >
              Reset to defaults
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500"
            >
              Done
            </button>
          </div>
          {syncing && (
            <p className="mt-2 text-center text-xs text-slate-500">Saving…</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zone section
// ---------------------------------------------------------------------------

interface ZoneSectionProps {
  zone: ZoneMeta;
  sortedIds: WidgetId[];
  isEnabled: (id: WidgetId) => boolean;
  onToggle: (id: WidgetId) => void;
  onMove: (id: WidgetId, direction: 'up' | 'down') => void;
}

function ZoneSection({
  zone,
  sortedIds,
  isEnabled,
  onToggle,
  onMove,
}: ZoneSectionProps) {
  const canReorder = sortedIds.length > 1;

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {zone.label}
        </h3>
        <p className="text-xs text-slate-500">{zone.description}</p>
      </div>

      <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 divide-y divide-slate-700/40">
        {sortedIds.map((id, idx) => {
          const enabled = isEnabled(id);
          const isFirst = idx === 0;
          const isLast  = idx === sortedIds.length - 1;

          return (
            <div
              key={id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              {/* Toggle */}
              <button
                role="switch"
                aria-checked={enabled}
                onClick={() => onToggle(id)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  enabled ? 'bg-blue-600' : 'bg-slate-600'
                }`}
                aria-label={`Toggle ${WIDGET_LABELS[id]}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>

              {/* Label */}
              <span
                className={`flex-1 text-xs font-medium transition-colors ${
                  enabled ? 'text-white' : 'text-slate-500'
                }`}
              >
                {WIDGET_LABELS[id]}
              </span>

              {/* Reorder buttons */}
              {canReorder && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onMove(id, 'up')}
                    disabled={isFirst}
                    className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move ${WIDGET_LABELS[id]} up`}
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    onClick={() => onMove(id, 'down')}
                    disabled={isLast}
                    className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move ${WIDGET_LABELS[id]} down`}
                  >
                    <ChevronDownIcon />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons — avoids adding an icon library dependency
// ---------------------------------------------------------------------------

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
    >
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3 w-3"
    >
      <path
        fillRule="evenodd"
        d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3 w-3"
    >
      <path
        fillRule="evenodd"
        d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L8.53 10.53a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
