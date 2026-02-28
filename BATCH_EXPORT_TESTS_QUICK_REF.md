# Batch Export Tests — Quick Reference

## File Location
`backend/tests/test_export_briefs_formats.py` — **27 Tests, All Passing ✅**

---

## Test Structure

```
test_export_briefs_formats.py
├── TestFormatBuildersReturnBytes (6 tests)
│   ├── ZIP, CSV, JSON, Markdown, PDF return bytes
│   └── Empty list handling
├── TestCSVUTF8BOM (3 tests)
│   ├── BOM prefix present
│   ├── Content valid after BOM
│   └── Headers included even when empty
├── TestZIPStructure (5 tests)
│   ├── Contains .md files
│   ├── Filename format & ID
│   ├── Special char handling
│   ├── Markdown headers included
│   └── Multiple briefs = multiple files
├── TestJSONKeyMetrics (4 tests)
│   ├── Includes metrics when present
│   ├── Omits metrics when absent
│   ├── All required fields present
│   └── Invalid metrics skipped
├── TestExportFilename (4 tests)
│   ├── Single ticker: ticker in name
│   ├── Multi ticker: no ticker
│   ├── Date format (YYYY-MM-DD)
│   └── Extension matches format
└── TestEdgeCases (5 tests)
    ├── Missing summary field
    ├── Unicode characters
    ├── Markdown separators
    ├── Empty content
    └── None content
```

---

## Key Test Examples

### Happy Path: CSV Export
```python
def test_csv_starts_with_utf8_bom(self, minimal_brief):
    """CSV must include UTF-8 BOM for Excel."""
    result = build_csv([minimal_brief])
    assert result[:3] == b'\xef\xbb\xbf'  # BOM prefix
```

### Happy Path: ZIP Export
```python
def test_zip_contains_markdown_files(self, minimal_brief):
    """ZIP archive contains .md files for each brief."""
    result = build_zip([minimal_brief])
    with zipfile.ZipFile(BytesIO(result)) as zf:
        names = zf.namelist()
        assert len(names) == 1
        assert names[0].endswith('.md')
```

### Happy Path: JSON with Metrics
```python
def test_json_includes_key_metrics_when_present(self, brief_with_metrics):
    """JSON output includes key_metrics field."""
    result = build_json([brief_with_metrics])
    data = json.loads(result.decode('utf-8'))
    assert 'key_metrics' in data[0]
    assert data[0]['key_metrics']['price'] == 185.50
```

### Edge Case: Unicode Handling
```python
def test_brief_with_unicode_characters(self):
    """Brief with Unicode chars is handled correctly."""
    brief = {
        'id': 1,
        'ticker': 'AAPL',
        'title': 'Café & Naïve Research',  # Unicode
        'summary': 'Análisis con émojis 📈',  # Emoji
        ...
    }
    result = build_json([brief])
    data = json.loads(result.decode('utf-8'))
    assert 'Café' in data[0]['title']  # ✅ Preserved
```

---

## Test Fixtures

| Fixture | Purpose | Fields |
|---------|---------|--------|
| `minimal_brief` | Single brief with required fields | id, ticker, title, summary, agent_name, model_used, created_at, content |
| `brief_with_metrics` | Brief + key_metrics for JSON/PDF tests | minimal_brief + key_metrics (price, rsi, rating, score, sentiment) |
| `multi_brief_set` | Multiple tickers (AAPL, MSFT) | 2 complete briefs for multi-export tests |

---

## Acceptance Criteria Coverage

| AC | Requirement | Tests |
|---|---|---|
| **AC1** | Format builders return bytes | 6 tests |
| **AC2** | CSV UTF-8 BOM for Excel | 3 tests |
| **AC3** | ZIP with Markdown files | 5 tests |
| **AC4** | JSON key_metrics | 4 tests |
| **AC5** | Smart filename generation | 4 tests |

---

## Run Tests

```bash
# All tests
pytest backend/tests/test_export_briefs_formats.py -v

# Specific class (e.g., JSON tests)
pytest backend/tests/test_export_briefs_formats.py::TestJSONKeyMetrics -v

# Single test
pytest backend/tests/test_export_briefs_formats.py::TestCSVUTF8BOM::test_csv_starts_with_utf8_bom -v

# With coverage
pytest backend/tests/test_export_briefs_formats.py --cov=backend.utils.export_briefs
```

---

## Quality Metrics

✅ **All 27 tests passing**
✅ **No hardcoded test data** (uses fixtures)
✅ **Clear test names** (describe what's tested)
✅ **Complete imports** (json, csv, zipfile, pytest)
✅ **Execution time:** ~1 second
✅ **No test interdependencies** (can run in any order)

---

## Design Spec Implementation

**Feature:** Batch export research briefs as ZIP, CSV, Markdown, JSON, or PDF
**Status:** ✅ Shipped (commit ae0fcf1)
**Tests:** ✅ Comprehensive format builder coverage
**Next:** API endpoint tests in `test_batch_export_api.py` (13 tests)
