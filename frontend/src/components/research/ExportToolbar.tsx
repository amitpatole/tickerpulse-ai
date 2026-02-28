```typescript
'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { ExportFormat, ExportCapabilities } from '@/lib/types';

export interface ExportToolbarProps {
  selectedIds: Set<number>;
  capabilities: ExportCapabilities | null;
  onExport: (format: ExportFormat) => Promise<void>;
  exporting: boolean;
}

export default function ExportToolbar({
  selectedIds,
  capabilities,
  onExport,
  exporting,
}: ExportToolbarProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown');

  const pdfAvailable = capabilities?.formats.pdf.available !== false;
  const exportDisabled = selectedIds.size === 0 || selectedIds.size > 100 || exporting;

  const exportTitle =
    selectedIds.size > 100
      ? 'Max 100 briefs per export'
      : selectedIds.size === 0
      ? 'Select briefs to export'
      : `Export ${selectedIds.size} brief${selectedIds.size !== 1 ? 's' : ''}`;

  const exportAriaLabel = exporting
    ? 'Exporting, please wait'
    : selectedIds.size === 0
      ? 'Export briefs, none selected'
      : `Export ${selectedIds.size} brief${selectedIds.size === 1 ? '' : 's'} as ${exportFormat.toUpperCase()}`;

  return (
    <div
      role="toolbar"
      aria-label="Batch export"
      className="border-b border-slate-700/50 px-4 py-2.5 bg-slate-900/60 flex flex-wrap items-center gap-2"
    >
      <select
        value={exportFormat}
        onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
        className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 outline-none border border-slate-600 focus:border-blue-500"
        aria-label="Export format"
      >
        <option value="markdown">Markdown (.md)</option>
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
        <option value="zip">ZIP (per-file .md)</option>
        <option
          value="pdf"
          disabled={!pdfAvailable}
          title={!pdfAvailable ? 'PDF export not available' : undefined}
        >
          PDF{!pdfAvailable ? ' (unavailable)' : ''}
        </option>
      </select>

      <button
        onClick={() => onExport(exportFormat)}
        disabled={exportDisabled}
        title={exportTitle}
        aria-label={exportAriaLabel}
        className={clsx(
          'flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors',
          exportDisabled
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {exporting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        {exporting ? 'Exporting\u2026' : 'Export'}
      </button>

      {selectedIds.size > 100 && (
        <span className="text-xs text-amber-400">Max 100 briefs per export</span>
      )}
    </div>
  );
}
```