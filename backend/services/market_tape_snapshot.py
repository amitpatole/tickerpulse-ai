"""Daily market tape snapshot for the /news morning digest."""

from __future__ import annotations

import logging
import math
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TAPE_SYMBOLS: tuple[tuple[str, str], ...] = (
    ("SPY", "S&P 500 (SPY)"),
    ("QQQ", "Nasdaq 100 (QQQ)"),
    ("IWM", "Russell 2000 (IWM)"),
    ("SMH", "Semis (SMH)"),
    ("^VIX", "VIX"),
    ("^TNX", "US 10Y yield (TNX, % x10)"),
    ("BTC-USD", "Bitcoin"),
)

FetchCloses = Callable[[Sequence[str]], Mapping[str, Sequence[tuple[str, float]]]]


def build_market_tape_snapshot(
    *,
    fetch_closes: FetchCloses | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    fetch = fetch_closes or _yfinance_closes
    symbols = [symbol for symbol, _label in TAPE_SYMBOLS]
    try:
        closes_by_symbol = fetch(symbols)
    except Exception as exc:  # tape failure must not kill the news run
        return {
            "source_status": "error",
            "generated_at": timestamp,
            "as_of": "",
            "rows": [],
            "errors": [{"source": "tape", "message": str(exc)}],
        }

    rows: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []
    as_of = ""
    for symbol, label in TAPE_SYMBOLS:
        closes = [
            (str(date), float(value))
            for date, value in (closes_by_symbol.get(symbol) or [])
            if value is not None and not math.isnan(float(value))
        ]
        if len(closes) < 2:
            errors.append({"source": symbol, "message": "insufficient close history"})
            continue
        last_date, last = closes[-1]
        prev = closes[-2][1]
        base_5d = closes[-6][1] if len(closes) >= 6 else closes[0][1]
        rows.append(
            {
                "symbol": symbol,
                "label": label,
                "last": round(last, 2),
                "chg_1d_pct": round((last / prev - 1) * 100, 2) if prev else None,
                "chg_5d_pct": round((last / base_5d - 1) * 100, 2) if base_5d else None,
                "as_of": last_date,
            }
        )
        as_of = max(as_of, last_date)

    if rows and not errors:
        status = "ok"
    elif rows:
        status = "degraded"
    else:
        status = "error"
    return {
        "source_status": status,
        "generated_at": timestamp,
        "as_of": as_of,
        "rows": rows,
        "errors": errors,
    }


def _yfinance_closes(symbols: Sequence[str]) -> dict[str, list[tuple[str, float]]]:
    import yfinance as yf

    frame = yf.download(
        list(symbols),
        period="10d",
        interval="1d",
        progress=False,
        auto_adjust=False,
        group_by="ticker",
        threads=True,
    )
    out: dict[str, list[tuple[str, float]]] = {}
    for symbol in symbols:
        try:
            closes = frame[symbol]["Close"] if len(symbols) > 1 else frame["Close"]
        except (KeyError, TypeError):
            out[symbol] = []
            continue
        series = closes.dropna()
        out[symbol] = [
            (index.date().isoformat(), float(value)) for index, value in series.items()
        ]
    return out
