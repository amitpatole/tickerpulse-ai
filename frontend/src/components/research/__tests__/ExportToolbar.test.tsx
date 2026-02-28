```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ExportToolbar from '../ExportToolbar';
import type { ExportCapabilities } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_CAPABILITIES: ExportCapabilities = {
  formats: {
    markdown: { available: true },
    json: { available: true },
    csv: { available: true },
    zip: { available: true },
    pdf: { available: true },
  },
};

const NO_PDF_CAPABILITIES: ExportCapabilities = {
  formats: {
    ...FULL_CAPABILITIES.formats,
    pdf: { available: false },
  },
};

function makeIds(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, i) => i + 1));
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof ExportToolbar>> = {}
) {
  const onExport = jest.fn().mockResolvedValue(undefined);
  const props = {
    selectedIds: makeIds(2),
    capabilities: FULL_CAPABILITIES,
    onExport,
    exporting: false,
    ...overrides,
  };
  const result = render(<ExportToolbar {...props} />);
  return { ...result, onExport };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportToolbar', () => {
  describe('Format Dropdown', () => {
    it('renders all five format options', () => {
      renderToolbar();
      const select = screen.getByRole('combobox', { name: /export format/i });
      expect(select).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /markdown/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /json/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /csv/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /zip/i })).toBeInTheDocument();
      // PDF option exists regardless of availability
      const pdfOptions = screen.getAllByRole('option').filter((o) =>
        o.textContent?.toLowerCase().includes('pdf')
      );
      expect(pdfOptions.length).toBeGreaterThan(0);
    });

    it('defaults to markdown format', () => {
      renderToolbar();
      const select = screen.getByRole('combobox', { name: /export format/i });
      expect(select).toHaveValue('markdown');
    });

    it('disables PDF option when capabilities report PDF unavailable', () => {
      renderToolbar({ capabilities: NO_PDF_CAPABILITIES });
      const pdfOption = screen.getAllByRole('option').find((o) =>
        o.textContent?.toLowerCase().includes('pdf')
      );
      expect(pdfOption).toBeDisabled();
    });

    it('enables PDF option when capabilities report PDF available', () => {
      renderToolbar({ capabilities: FULL_CAPABILITIES });
      const pdfOption = screen.getAllByRole('option').find(
        (o) => o.getAttribute('value') === 'pdf'
      );
      expect(pdfOption).not.toBeDisabled();
    });

    it('assumes PDF available when capabilities is null', () => {
      renderToolbar({ capabilities: null });
      const pdfOption = screen.getAllByRole('option').find(
        (o) => o.getAttribute('value') === 'pdf'
      );
      expect(pdfOption).not.toBeDisabled();
    });
  });

  describe('Export Button — enabled/disabled states', () => {
    it('is disabled when no IDs are selected', () => {
      renderToolbar({ selectedIds: new Set() });
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('is disabled when more than 100 IDs are selected', () => {
      renderToolbar({ selectedIds: makeIds(101) });
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('is disabled while export is in progress', () => {
      renderToolbar({ exporting: true });
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('is enabled with exactly 1 ID selected and not exporting', () => {
      renderToolbar({ selectedIds: makeIds(1) });
      expect(screen.getByRole('button')).not.toBeDisabled();
    });

    it('is enabled with exactly 100 IDs selected and not exporting', () => {
      renderToolbar({ selectedIds: makeIds(100) });
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });

  describe('Export Button — click behaviour', () => {
    it('calls onExport with the current format on click', async () => {
      const user = userEvent.setup();
      const { onExport } = renderToolbar({ selectedIds: makeIds(3) });
      await user.click(screen.getByRole('button'));
      expect(onExport).toHaveBeenCalledTimes(1);
      expect(onExport).toHaveBeenCalledWith('markdown');
    });

    it('calls onExport with the format selected in the dropdown', async () => {
      const user = userEvent.setup();
      const { onExport } = renderToolbar({ selectedIds: makeIds(1) });
      await user.selectOptions(
        screen.getByRole('combobox', { name: /export format/i }),
        'csv'
      );
      await user.click(screen.getByRole('button'));
      expect(onExport).toHaveBeenCalledWith('csv');
    });

    it('does not call onExport when button is disabled (no selection)', async () => {
      const user = userEvent.setup();
      const { onExport } = renderToolbar({ selectedIds: new Set() });
      await user.click(screen.getByRole('button'));
      expect(onExport).not.toHaveBeenCalled();
    });
  });

  describe('Loading state', () => {
    it('shows "Exporting…" text while exporting', () => {
      renderToolbar({ exporting: true });
      expect(screen.getByRole('button')).toHaveTextContent(/Exporting/i);
    });

    it('shows "Export" text when idle', () => {
      renderToolbar({ exporting: false });
      expect(screen.getByRole('button')).toHaveTextContent(/^Export$/);
    });
  });

  describe('Over-limit warning', () => {
    it('shows warning message when more than 100 IDs are selected', () => {
      renderToolbar({ selectedIds: makeIds(101) });
      expect(screen.getByText(/max 100 briefs/i)).toBeInTheDocument();
    });

    it('does not show warning when exactly 100 IDs are selected', () => {
      renderToolbar({ selectedIds: makeIds(100) });
      expect(screen.queryByText(/max 100 briefs/i)).not.toBeInTheDocument();
    });

    it('does not show warning when 0 IDs are selected', () => {
      renderToolbar({ selectedIds: new Set() });
      expect(screen.queryByText(/max 100 briefs/i)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has toolbar role with accessible label', () => {
      renderToolbar();
      expect(screen.getByRole('toolbar', { name: /batch export/i })).toBeInTheDocument();
    });

    it('aria-label indicates exporting state when in progress', () => {
      renderToolbar({ exporting: true });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Exporting, please wait'
      );
    });

    it('aria-label indicates no selection when empty', () => {
      renderToolbar({ selectedIds: new Set() });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Export briefs, none selected'
      );
    });

    it('aria-label describes count and format when selection exists', () => {
      renderToolbar({ selectedIds: makeIds(5) });
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Export 5 briefs as MARKDOWN'
      );
    });

    it('title says "Select briefs to export" when nothing is selected', () => {
      renderToolbar({ selectedIds: new Set() });
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Select briefs to export'
      );
    });

    it('title says "Max 100 briefs per export" when over the limit', () => {
      renderToolbar({ selectedIds: makeIds(101) });
      expect(screen.getByRole('button')).toHaveAttribute(
        'title',
        'Max 100 briefs per export'
      );
    });

    it('title describes the export count when within limits', () => {
      renderToolbar({ selectedIds: makeIds(3) });
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Export 3 briefs');
    });
  });
});
```