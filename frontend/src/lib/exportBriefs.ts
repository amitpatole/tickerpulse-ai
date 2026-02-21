import type { ResearchBrief } from './types';

export type ExportFormat = 'md' | 'json' | 'csv';

export function toMarkdown(briefs: ResearchBrief[]): string {
  return briefs
    .map((b) => `# ${b.title}\n\n${b.content}`)
    .join('\n\n---\n\n');
}

export function toJson(briefs: ResearchBrief[]): string {
  return JSON.stringify(briefs, null, 2);
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(briefs: ResearchBrief[]): string {
  const header = 'id,ticker,title,agent_name,model_used,created_at';
  const rows = briefs.map((b) =>
    [
      String(b.id),
      escapeCsvField(b.ticker),
      escapeCsvField(b.title),
      escapeCsvField(b.agent_name),
      escapeCsvField(b.model_used ?? ''),
      escapeCsvField(b.created_at),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export function exportFilename(format: ExportFormat, ticker?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const tickerPart = ticker ? ticker.toUpperCase() : 'all';
  return `research-briefs-${tickerPart}-${date}.${format}`;
}

const MIME_TYPES: Record<ExportFormat, string> = {
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
};

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportBriefs(
  briefs: ResearchBrief[],
  format: ExportFormat,
  ticker?: string,
): void {
  let content: string;
  if (format === 'md') content = toMarkdown(briefs);
  else if (format === 'json') content = toJson(briefs);
  else content = toCsv(briefs);

  const filename = exportFilename(format, ticker);
  downloadFile(content, filename, MIME_TYPES[format]);
}
