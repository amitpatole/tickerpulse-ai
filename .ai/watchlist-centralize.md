# Watchlist centralization — tickerpulse-ai slice (2026-06-15)

Branch `feat/watchlist-centralize` off `f1c177a` (tip of feat/news-morning-digest;
the dashboard_watchlist files were created by that feature, absent on origin/main).
Companion change in kova-screener (same branch name). Full design + evidence:
`C:\Repos\kova-screener\.ai\implementation-notes.md` (2026-06-15 section).

## Goal
Make `config/dashboard_watchlist.yaml` the single hand-edited watchlist master.
Per-item `bucket:` tags drive /daily-chart; `news: false` keeps chart-only names
out of /news.

## Changes here
- `backend/services/dashboard_watchlist.py`: `load_dashboard_watchlist` now drops
  `news: false` items by default (single choke point covering all 3 news consumers:
  DB seed, news-wire tickers, known cashtags); `include_all=True` escape hatch.
  Deliberately did NOT edit news_layer_review.py / news_wire_collector.py — the
  other active session is touching those; the loader filter covers them anyway.
- `config/dashboard_watchlist.yaml`: migrated — bucket tags on all 52 existing
  names (news untouched), 29 chart-only kova names appended with `news: false`.
  /news universe verified unchanged (52 -> 52). source_symbol 12 -> 12 preserved.
- `backend/scripts/migrate_watchlist_buckets.py`: one-shot CSV->yaml bootstrap with
  a no-name-lost / no-double-bucket parity assert. Idempotent.
- `tests/test_dashboard_watchlist_config.py`: +2 tests (news:false excluded by
  default + kept with include_all; sync-to-db skips news:false).

## Verify
`venv\Scripts\python.exe -m pytest tests/test_dashboard_watchlist_config.py tests/test_market_sweep_service.py tests/test_news_wire_collector.py -q` -> 24 passed.

## Consequence (accepted)
Chart-only names are also excluded from the web stock-dashboard DB seed.
