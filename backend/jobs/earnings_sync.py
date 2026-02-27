"""
TickerPulse AI v3.0 - Earnings Sync Job

Fetches upcoming earnings dates and historical EPS/revenue data from yfinance
and upserts them into the earnings_events table.  Runs nightly at 6 AM ET.

Idempotent: repeated runs do not duplicate rows (UNIQUE on ticker + earnings_date).
"""

import logging
import sqlite3
from datetime import datetime, timezone
from typing import Optional

from backend.config import Config
from backend.jobs._helpers import _get_watchlist, job_timer

logger = logging.getLogger(__name__)

JOB_ID = 'earnings_sync'
JOB_NAME = 'Earnings Sync'


# ---------------------------------------------------------------------------
# yfinance helpers
# ---------------------------------------------------------------------------

def _parse_earnings_from_yfinance(ticker: str) -> list:
    """Fetch earnings data for a single ticker via yfinance.

    Tries ``get_earnings_dates()`` first (recent yfinance 0.2.x) for past and
    upcoming events, then falls back to ``calendar`` for the next event plus
    revenue estimates.

    Returns a list of dicts with keys:
        ticker, company, earnings_date, time_of_day,
        eps_estimate, eps_actual, revenue_estimate, revenue_actual, fiscal_quarter
    Returns an empty list when yfinance returns no usable data.
    """
    try:
        import yfinance as yf  # type: ignore
    except ImportError:
        logger.warning("yfinance is not installed — earnings sync skipped for %s", ticker)
        return []

    results: list = []

    try:
        t = yf.Ticker(ticker)

        # --- Strategy 1: get_earnings_dates (covers upcoming + recent past) ---
        try:
            import pandas as pd  # type: ignore
            earnings_dates = t.get_earnings_dates(limit=12)
            if earnings_dates is not None and not earnings_dates.empty:
                for dt_idx, row in earnings_dates.iterrows():
                    try:
                        if hasattr(dt_idx, 'date'):
                            earnings_date_str = dt_idx.date().isoformat()
                        else:
                            earnings_date_str = str(dt_idx)[:10]

                        eps_estimate: Optional[float] = None
                        eps_actual: Optional[float] = None

                        for col in ('EPS Estimate', 'Estimate'):
                            if col in row:
                                val = row[col]
                                if val is not None and str(val) not in ('nan', 'NaN', 'None'):
                                    try:
                                        eps_estimate = float(val)
                                    except (ValueError, TypeError):
                                        pass
                                    break

                        for col in ('Reported EPS', 'Actual'):
                            if col in row:
                                val = row[col]
                                if val is not None and str(val) not in ('nan', 'NaN', 'None'):
                                    try:
                                        eps_actual = float(val)
                                    except (ValueError, TypeError):
                                        pass
                                    break

                        results.append({
                            'ticker': ticker,
                            'company': None,
                            'earnings_date': earnings_date_str,
                            'time_of_day': None,
                            'eps_estimate': eps_estimate,
                            'eps_actual': eps_actual,
                            'revenue_estimate': None,
                            'revenue_actual': None,
                            'fiscal_quarter': None,
                        })
                    except Exception as row_exc:
                        logger.debug("Skipping earnings row for %s: %s", ticker, row_exc)
        except Exception as gde_exc:
            logger.debug("get_earnings_dates failed for %s: %s", ticker, gde_exc)

        # --- Strategy 2: calendar dict for upcoming date + revenue estimates ---
        try:
            cal = t.calendar
            if cal is not None and isinstance(cal, dict):
                ed_raw = cal.get('Earnings Date')
                if ed_raw is not None:
                    # Normalise: list, Timestamp, or plain date
                    if isinstance(ed_raw, list):
                        ed_raw = ed_raw[0] if ed_raw else None
                    if ed_raw is not None:
                        if hasattr(ed_raw, 'date'):
                            upcoming_str = ed_raw.date().isoformat()
                        elif hasattr(ed_raw, 'isoformat'):
                            upcoming_str = ed_raw.isoformat()[:10]
                        else:
                            upcoming_str = str(ed_raw)[:10]

                        rev_est_raw = cal.get('Revenue Average') or cal.get('Revenue Estimate')
                        eps_est_raw = cal.get('Earnings Average') or cal.get('EPS Estimate')

                        rev_est: Optional[float] = None
                        eps_est: Optional[float] = None
                        try:
                            if rev_est_raw is not None:
                                rev_est = float(rev_est_raw)
                        except (ValueError, TypeError):
                            pass
                        try:
                            if eps_est_raw is not None:
                                eps_est = float(eps_est_raw)
                        except (ValueError, TypeError):
                            pass

                        existing_dates = {r['earnings_date'] for r in results}
                        if upcoming_str not in existing_dates:
                            results.append({
                                'ticker': ticker,
                                'company': None,
                                'earnings_date': upcoming_str,
                                'time_of_day': None,
                                'eps_estimate': eps_est,
                                'eps_actual': None,
                                'revenue_estimate': rev_est,
                                'revenue_actual': None,
                                'fiscal_quarter': None,
                            })
                        else:
                            # Backfill revenue estimate onto the matching entry
                            for r in results:
                                if r['earnings_date'] == upcoming_str:
                                    if rev_est is not None and r['revenue_estimate'] is None:
                                        r['revenue_estimate'] = rev_est
                                    if eps_est is not None and r['eps_estimate'] is None:
                                        r['eps_estimate'] = eps_est
        except Exception as cal_exc:
            logger.debug("calendar fetch failed for %s: %s", ticker, cal_exc)

        # --- Backfill company name ---
        if results:
            try:
                info = t.info
                company_name = info.get('longName') or info.get('shortName') or ticker
                for r in results:
                    r['company'] = company_name
            except Exception:
                pass

    except Exception as exc:
        logger.warning("Failed to fetch earnings for %s: %s", ticker, exc)

    return results


# ---------------------------------------------------------------------------
# DB persistence
# ---------------------------------------------------------------------------

def _upsert_earnings_events(events: list) -> int:
    """Upsert earnings events into the database.

    Uses ``INSERT OR REPLACE`` semantics via the UNIQUE(ticker, earnings_date)
    constraint.  Existing ``eps_actual`` / ``revenue_actual`` values are
    preserved when the incoming row has NULL (COALESCE).

    Returns the number of rows successfully written.
    """
    if not events:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    count = 0

    try:
        conn = sqlite3.connect(Config.DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        for event in events:
            try:
                cursor.execute(
                    """
                    INSERT INTO earnings_events
                        (ticker, company, earnings_date, time_of_day,
                         eps_estimate, eps_actual, revenue_estimate, revenue_actual,
                         fiscal_quarter, fetched_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticker, earnings_date) DO UPDATE SET
                        company          = excluded.company,
                        time_of_day      = COALESCE(excluded.time_of_day,      earnings_events.time_of_day),
                        eps_estimate     = COALESCE(excluded.eps_estimate,     earnings_events.eps_estimate),
                        eps_actual       = COALESCE(excluded.eps_actual,       earnings_events.eps_actual),
                        revenue_estimate = COALESCE(excluded.revenue_estimate, earnings_events.revenue_estimate),
                        revenue_actual   = COALESCE(excluded.revenue_actual,   earnings_events.revenue_actual),
                        fiscal_quarter   = COALESCE(excluded.fiscal_quarter,   earnings_events.fiscal_quarter),
                        fetched_at       = excluded.fetched_at,
                        updated_at       = excluded.updated_at
                    """,
                    (
                        event['ticker'],
                        event.get('company'),
                        event['earnings_date'],
                        event.get('time_of_day'),
                        event.get('eps_estimate'),
                        event.get('eps_actual'),
                        event.get('revenue_estimate'),
                        event.get('revenue_actual'),
                        event.get('fiscal_quarter'),
                        now,
                        now,
                    ),
                )
                count += 1
            except Exception as row_exc:
                logger.debug(
                    "Failed to upsert earnings for %s on %s: %s",
                    event.get('ticker'),
                    event.get('earnings_date'),
                    row_exc,
                )

        conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("DB error during earnings upsert: %s", exc)

    return count


# ---------------------------------------------------------------------------
# Public job entry point
# ---------------------------------------------------------------------------

def run_earnings_sync() -> None:
    """Fetch and sync earnings calendar data for all watchlist tickers.

    For each ticker:
    - Calls yfinance to get upcoming + past earnings dates, EPS, and revenue.
    - Upserts into ``earnings_events`` (idempotent).

    Logs duration and result summary via the ``job_timer`` helper.
    """
    with job_timer(JOB_ID, JOB_NAME) as ctx:
        watchlist = _get_watchlist()
        if not watchlist:
            ctx['result_summary'] = 'Empty watchlist — nothing to sync'
            logger.info("Earnings sync: empty watchlist, skipping")
            return

        tickers = [s['ticker'] for s in watchlist]
        total_upserted = 0
        no_data_count = 0

        for ticker in tickers:
            events = _parse_earnings_from_yfinance(ticker)
            n = _upsert_earnings_events(events)
            total_upserted += n
            if not events:
                no_data_count += 1
                logger.debug("No earnings data found for %s", ticker)

        ctx['result_summary'] = (
            f"Synced {total_upserted} earnings events for "
            f"{len(tickers) - no_data_count}/{len(tickers)} tickers"
        )
        logger.info("Earnings sync complete: %s", ctx['result_summary'])
