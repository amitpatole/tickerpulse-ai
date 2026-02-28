```python
"""
TickerPulse AI - Research Brief Export Utilities
Generates ZIP, CSV, and PDF exports from research brief records.
"""

import csv
import io
import json as _json
import logging
import re
import zipfile
from typing import Literal

logger = logging.getLogger(__name__)

ExportFormat = Literal['zip', 'csv', 'pdf', 'markdown', 'json']

_JSON_FIELDS: tuple[str, ...] = (
    'id', 'ticker', 'title', 'summary',
    'agent_name', 'model_used', 'created_at', 'content',
)

_MARKDOWN_HEADER = """\
# {title}

**Ticker:** {ticker}
**Agent:** {agent_name}
**Model:** {model_used}
**Created:** {created_at}

---

"""


def _brief_to_markdown(brief: dict) -> str:
    """Render a brief dict as a Markdown string with a metadata header."""
    header = _MARKDOWN_HEADER.format(
        title=brief.get('title', ''),
        ticker=brief.get('ticker', ''),
        agent_name=brief.get('agent_name', ''),
        model_used=brief.get('model_used', ''),
        created_at=brief.get('created_at', ''),
    )
    return header + (brief.get('content') or '')


def _safe_filename(ticker: str, brief_id: int) -> str:
    """Return a filesystem-safe filename for a brief."""
    safe_ticker = re.sub(r'[^\w.-]', '_', ticker.upper())
    return f"{safe_ticker}-{brief_id}.md"


def build_zip(briefs: list[dict]) -> bytes:
    """Return a ZIP archive containing one Markdown file per brief."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        for brief in briefs:
            filename = _safe_filename(brief.get('ticker', 'UNKNOWN'), brief['id'])
            content = _brief_to_markdown(brief)
            zf.writestr(filename, content.encode('utf-8'))
    return buf.getvalue()


def build_csv(briefs: list[dict]) -> bytes:
    """Return a UTF-8-with-BOM CSV with one row per brief (BOM for Excel compatibility)."""
    buf = io.StringIO()
    fieldnames = ['id', 'ticker', 'title', 'summary', 'agent_name', 'model_used', 'created_at', 'content']
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    for brief in briefs:
        writer.writerow({k: brief.get(k, '') for k in fieldnames})
    # utf-8-sig writes the UTF-8 BOM (0xEF 0xBB 0xBF) that Excel needs to
    # auto-detect the encoding on double-click open.
    return buf.getvalue().encode('utf-8-sig')


def build_markdown(briefs: list[dict]) -> bytes:
    """Return a single UTF-8 Markdown file concatenating all briefs with HR separators."""
    separator = '\n\n---\n\n'
    return separator.join(_brief_to_markdown(b) for b in briefs).encode('utf-8')


def build_json(briefs: list[dict]) -> bytes:
    """Return a UTF-8 JSON array of brief objects.

    Includes key_metrics when present (populated for PDF and JSON formats by
    the export handler so data consumers get live price/rating data).
    """
    export_data: list[dict] = []
    for b in briefs:
        record: dict = {k: b.get(k) for k in _JSON_FIELDS}
        metrics = b.get('key_metrics')
        if metrics and isinstance(metrics, dict):
            record['key_metrics'] = metrics
        export_data.append(record)
    return _json.dumps(export_data, ensure_ascii=False, indent=2).encode('utf-8')


def _latin1(text: str) -> str:
    """Drop characters that are outside Latin-1; replace common Unicode punctuation."""
    replacements = {
        '\u2014': '-', '\u2013': '-', '\u2018': "'", '\u2019': "'",
        '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u00a0': ' ',
        '\u2022': '-',  # bullet
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text.encode('latin-1', errors='ignore').decode('latin-1')


# ---------------------------------------------------------------------------
# PDF helpers
# ---------------------------------------------------------------------------

def _pdf_render_metrics(pdf, metrics: dict) -> None:
    """Render key metrics as a light-blue row of stat boxes."""
    items: list[tuple[str, str]] = []

    price = metrics.get('price')
    if price is not None:
        change = metrics.get('change_pct')
        if change is not None:
            sign = '+' if change >= 0 else ''
            items.append(('Price', f'${price:.2f}  ({sign}{change:.2f}%)'))
        else:
            items.append(('Price', f'${price:.2f}'))

    rsi = metrics.get('rsi')
    if rsi is not None:
        label = 'Overbought' if rsi > 70 else ('Oversold' if rsi < 30 else 'Neutral')
        items.append(('RSI', f'{rsi:.1f}  {label}'))

    rating = metrics.get('rating')
    if rating:
        items.append(('Rating', str(rating)))

    score = metrics.get('score')
    if score is not None:
        items.append(('AI Score', f'{score:.1f}/10'))

    sentiment = metrics.get('sentiment_label')
    if sentiment:
        items.append(('Sentiment', sentiment.capitalize()))

    if not items:
        return

    cols = min(len(items), 4)
    col_w = 170.0 / cols
    start_y = pdf.get_y()
    box_h = 10 * ((len(items) + cols - 1) // cols) + 4

    # Background fill
    pdf.set_fill_color(235, 243, 255)
    pdf.set_draw_color(180, 210, 240)
    pdf.rect(20, start_y, 170, box_h, 'FD')

    for i, (label, value) in enumerate(items):
        col = i % cols
        row = i // cols
        x = 22 + col * col_w
        y = start_y + 2 + row * 10

        pdf.set_xy(x, y)
        pdf.set_font('Helvetica', 'B', 8)
        pdf.set_text_color(70, 100, 170)
        pdf.cell(col_w * 0.38, 4, _latin1(label))
        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(20, 20, 20)
        pdf.cell(col_w * 0.62, 4, _latin1(value))

    pdf.set_y(start_y + box_h + 4)


def _pdf_render_summary(pdf, summary: str) -> None:
    """Render executive summary in a bordered callout box."""
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(40, 90, 170)
    pdf.cell(0, 6, 'Executive Summary', ln=True)
    pdf.ln(1)

    start_y = pdf.get_y()
    # Estimate box height by character density
    approx_lines = max(int(len(summary) / 88) + 1, 2)
    box_h = approx_lines * 5.5 + 8

    pdf.set_fill_color(248, 250, 255)
    pdf.set_draw_color(185, 210, 240)
    pdf.rect(20, start_y, 170, box_h, 'FD')

    pdf.set_xy(23, start_y + 3)
    pdf.set_font('Helvetica', 'I', 10)
    pdf.set_text_color(30, 40, 70)
    pdf.multi_cell(164, 5.5, _latin1(summary))

    # Ensure we move past the box even if multi_cell was shorter
    pdf.set_y(max(pdf.get_y(), start_y + box_h) + 4)


def _pdf_render_content(pdf, content: str) -> None:
    """Render brief markdown content with styled section headers."""
    for line in content.split('\n'):
        stripped = line.strip()

        if stripped.startswith('## '):
            pdf.ln(3)
            pdf.set_font('Helvetica', 'B', 11)
            pdf.set_text_color(50, 110, 200)
            pdf.cell(0, 7, _latin1(stripped[3:]), ln=True)
            pdf.set_draw_color(180, 210, 240)
            pdf.line(20, pdf.get_y(), 190, pdf.get_y())
            pdf.ln(3)

        elif stripped.startswith('# '):
            pdf.ln(2)
            pdf.set_font('Helvetica', 'B', 13)
            pdf.set_text_color(20, 20, 20)
            pdf.cell(0, 8, _latin1(stripped[2:]), ln=True)
            pdf.ln(1)

        elif stripped.startswith('### '):
            pdf.ln(1)
            pdf.set_font('Helvetica', 'B', 10)
            pdf.set_text_color(50, 50, 60)
            pdf.cell(0, 6, _latin1(stripped[4:]), ln=True)

        elif stripped.startswith(('- ', '* ')):
            bullet = re.sub(r'\*\*(.+?)\*\*', r'\1', stripped[2:])
            bullet = re.sub(r'\*(.+?)\*', r'\1', bullet)
            pdf.set_font('Helvetica', '', 10)
            pdf.set_text_color(30, 30, 30)
            pdf.set_x(24)
            # Use a simple dash bullet (Latin-1 safe)
            pdf.cell(4, 5.5, '-')
            pdf.set_x(28)
            pdf.multi_cell(162, 5.5, _latin1(bullet))

        elif stripped == '---':
            pdf.set_draw_color(200, 200, 200)
            pdf.line(20, pdf.get_y(), 190, pdf.get_y())
            pdf.ln(3)

        elif stripped:
            text = re.sub(r'\*\*(.+?)\*\*', r'\1', stripped)
            text = re.sub(r'\*(.+?)\*', r'\1', text)
            text = re.sub(r'`(.+?)`', r'\1', text)
            pdf.set_font('Helvetica', '', 10)
            pdf.set_text_color(30, 30, 30)
            pdf.multi_cell(0, 5.5, _latin1(text))

        else:
            pdf.ln(2)


# ---------------------------------------------------------------------------
# PDF builder
# ---------------------------------------------------------------------------

def build_pdf(briefs: list[dict]) -> bytes:
    """Return a PDF with one section per brief.

    Each brief page includes:
    - Ticker badge + title + metadata
    - Key metrics row (price, RSI, rating, AI score, sentiment) if available
    - Executive summary callout box if available
    - Full brief content with styled section headers
    """
    from fpdf import FPDF

    class BriefPDF(FPDF):
        def header(self):
            self.set_font('Helvetica', 'B', 9)
            self.set_text_color(130, 130, 130)
            self.cell(0, 8, 'TickerPulse AI - Research Brief Export', align='C')
            self.ln(2)

        def footer(self):
            self.set_y(-12)
            self.set_font('Helvetica', '', 8)
            self.set_text_color(160, 160, 160)
            self.cell(0, 6, f'Page {self.page_no()}', align='C')

    pdf = BriefPDF(orientation='P', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(left=20, top=18, right=20)

    errors: list[str] = []

    for brief in briefs:
        try:
            pdf.add_page()

            # --- Ticker badge ---
            pdf.set_font('Helvetica', 'B', 22)
            pdf.set_text_color(50, 120, 230)
            pdf.cell(0, 10, _latin1(brief.get('ticker', '')), ln=True)

            # --- Title ---
            pdf.set_font('Helvetica', 'B', 14)
            pdf.set_text_color(15, 15, 15)
            pdf.multi_cell(0, 7, _latin1(brief.get('title', '')))
            pdf.ln(2)

            # --- Metadata row ---
            pdf.set_font('Helvetica', '', 9)
            pdf.set_text_color(120, 120, 120)
            meta = (
                f"Agent: {brief.get('agent_name', '')}  |  "
                f"Model: {brief.get('model_used', '')}  |  "
                f"Created: {brief.get('created_at', '')}"
            )
            pdf.multi_cell(0, 5, _latin1(meta))
            pdf.ln(3)

            # Separator
            pdf.set_draw_color(200, 210, 220)
            pdf.line(20, pdf.get_y(), 190, pdf.get_y())
            pdf.ln(5)

            # --- Key metrics (if available) ---
            key_metrics = brief.get('key_metrics')
            if key_metrics and isinstance(key_metrics, dict):
                _pdf_render_metrics(pdf, key_metrics)

            # --- Executive summary callout (if available) ---
            summary = brief.get('summary')
            if summary:
                _pdf_render_summary(pdf, summary)

            # --- Full content ---
            _pdf_render_content(pdf, brief.get('content', ''))

        except Exception as exc:
            logger.warning("PDF: failed to render brief id=%s: %s", brief.get('id'), exc)
            errors.append(f"Brief ID {brief.get('id')} ({brief.get('ticker')}): {exc}")

    if errors:
        pdf.add_page()
        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(200, 50, 50)
        pdf.cell(0, 10, 'Export Errors', ln=True)
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(50, 50, 50)
        for msg in errors:
            pdf.multi_cell(0, 6, _latin1(msg))

    return bytes(pdf.output())
```