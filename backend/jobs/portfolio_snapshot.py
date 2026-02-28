"""
TickerPulse AI v3.0 - Portfolio Daily Snapshot Job

Captures total portfolio value and cost basis at market close for historical
P&L charts.  Runs at 4:00 PM ET on weekdays.

Key invariant: only total_value and total_cost are stored; per-position
allocations are always computed on the fly from the positions table.
"""

import logging
import sqlite3
from datetime import datetime
from typing import Optional

from backend.config import Config
from backend.jobs._helpers import job_timer

logger = logging.getLogger(__name__)

JOB_ID = 'portfolio_snapshot'
JOB_NAME = 'Portfolio Snapshot'


def _compute_snapshot_totals(db_path: str) -> Optional[tuple[float, float, int, int]]:
    """Read active positions and compute (total_value, total_cost, position_count, priced_count).

    Returns None if no active positions exist.
    Falls back to cost basis for positions that have no live price in ai_ratings.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT
                p.quantity,
                p.avg_cost,
                r.current_price
            FROM portfolio_positions p
            LEFT JOIN ai_ratings r ON r.ticker = p.ticker
            WHERE p.is_active = 1
            """
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return None

    total_cost: float = 0.0
    total_value: float = 0.0
    priced_count: int = 0

    for row in rows:
        cost_basis = row['quantity'] * row['avg_cost']
        total_cost += cost_basis
        if row['current_price'] is not None:
            total_value += row['quantity'] * row['current_price']
            priced_count += 1
        else:
            # No live price — use cost basis as a neutral placeholder so the
            # snapshot total is never understated.
            total_value += cost_basis

    return total_value, total_cost, len(rows), priced_count


def _upsert_snapshot(db_path: str, snapshot_date: str, total_value: float, total_cost: float) -> None:
    """UPSERT a portfolio snapshot row for *snapshot_date*."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO portfolio_snapshots (snapshot_date, total_value, total_cost)
            VALUES (?, ?, ?)
            ON CONFLICT(snapshot_date) DO UPDATE SET
                total_value = excluded.total_value,
                total_cost  = excluded.total_cost
            """,
            (snapshot_date, round(total_value, 4), round(total_cost, 4)),
        )
        conn.commit()
    finally:
        conn.close()


def run_portfolio_snapshot() -> None:
    """Calculate current portfolio value and persist a daily snapshot.

    Steps:
        1. Load active positions joined with ai_ratings for current prices.
        2. Sum total_value (quantity * current_price, falling back to cost
           basis when no live price is available) and total_cost (cost basis).
        3. UPSERT into portfolio_snapshots keyed by today's UTC date.
        4. Skip gracefully if no active positions exist.
    """
    with job_timer(JOB_ID, JOB_NAME) as ctx:
        snapshot_date = datetime.utcnow().strftime('%Y-%m-%d')

        result = _compute_snapshot_totals(Config.DB_PATH)

        if result is None:
            ctx['status'] = 'skipped'
            ctx['result_summary'] = 'No active positions — snapshot skipped.'
            return

        total_value, total_cost, position_count, priced_count = result

        _upsert_snapshot(Config.DB_PATH, snapshot_date, total_value, total_cost)

        pnl = total_value - total_cost
        ctx['result_summary'] = (
            f"Snapshot {snapshot_date}: value=${total_value:.2f}, "
            f"cost=${total_cost:.2f}, pnl=${pnl:+.2f} "
            f"({position_count} positions, {priced_count} with live price)."
        )
