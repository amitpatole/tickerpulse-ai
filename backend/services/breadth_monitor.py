"""Market-breadth divergence monitor for the /news layer.

Flags the 2021/2007-style top setup: the index is in a confirmed uptrend while
breadth NARROWS (equal-weight RSP lagging cap-weight SPY). A cap-weighted index
can grind to new highs on a few mega-caps while most stocks roll over; an EMA
trend filter is blind to that because it only sees the index price. Breadth
divergence leads the trend break, so the daily report should catch it.

Self-contained (reuses the RSP/SPY-ratio + EMA-slope METHOD, not a cross-repo
import). Source: yfinance ^GSPC + RSP + SPY daily closes.

Contract mirrors the other /news monitors: returns a mapping with ``status`` and
a ``signals`` list of ``{key, level, message}``.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np
import pandas as pd

_FAST = 50
_SLOW = 200
_SLOPE_LOOKBACK = 21
_BREADTH_EMA = 50

PARAMS: dict[str, int] = {
    "index_ema_fast": _FAST,
    "index_ema_slow": _SLOW,
    "slope_lookback": _SLOPE_LOOKBACK,
    "breadth_ema": _BREADTH_EMA,
}

CONFIRMED_UP = "confirmed_up"
CHOP = "chop"
GRIND_DOWN = "grind_down"
BROAD = "broad"
NARROWING = "narrowing"
MIXED = "mixed"


def _ema(values: np.ndarray, span: int) -> np.ndarray:
    return pd.Series(values, dtype="float64").ewm(span=span, adjust=False).mean().to_numpy()


def _index_phase(close: np.ndarray) -> str:
    c = np.asarray(close, dtype="float64")
    if len(c) < _SLOW + _SLOPE_LOOKBACK:
        return CHOP
    ema_fast = _ema(c, _FAST)
    ema_slow = _ema(c, _SLOW)
    price, e_fast, e_slow = float(c[-1]), float(ema_fast[-1]), float(ema_slow[-1])
    slow_rising = float(ema_slow[-1]) > float(ema_slow[-1 - _SLOPE_LOOKBACK])
    if price > e_slow and e_fast > e_slow and slow_rising:
        return CONFIRMED_UP
    if price < e_slow and e_fast < e_slow and not slow_rising:
        return GRIND_DOWN
    return CHOP


def _breadth_phase(rsp: np.ndarray, spy: np.ndarray) -> str:
    rsp = np.asarray(rsp, dtype="float64")
    spy = np.asarray(spy, dtype="float64")
    n = min(len(rsp), len(spy))
    if n < _BREADTH_EMA + _SLOPE_LOOKBACK:
        return MIXED
    ratio = pd.Series(rsp[-n:] / spy[-n:], dtype="float64")
    ema = ratio.ewm(span=_BREADTH_EMA, adjust=False).mean().to_numpy()
    r = ratio.to_numpy()
    above, below = r[-1] > ema[-1], r[-1] < ema[-1]
    rising = r[-1] > r[-1 - _SLOPE_LOOKBACK]
    falling = r[-1] < r[-1 - _SLOPE_LOOKBACK]
    if above and rising:
        return BROAD
    if below and falling:
        return NARROWING
    return MIXED


def _yf_closes(ticker: str, *, period: str = "2y") -> np.ndarray:
    import yfinance as yf

    frame = yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=False)
    return frame["Close"].to_numpy(dtype="float64")


def build_breadth_monitor(
    fetch: Callable[[str], Sequence[float]] | None = None,
) -> dict[str, object]:
    """Index-trend vs breadth divergence read.

    ``fetch(ticker)`` returns that ticker's daily close series (newest last). The
    default pulls ^GSPC / RSP / SPY from yfinance. Fails soft to ``status=error``
    with no signals - breadth is a secondary monitor, never blocks the digest.
    """
    fetcher = fetch if fetch is not None else _yf_closes
    try:
        gspc = np.asarray(fetcher("^GSPC"), dtype="float64")
        rsp = np.asarray(fetcher("RSP"), dtype="float64")
        spy = np.asarray(fetcher("SPY"), dtype="float64")
    except Exception as exc:  # noqa: BLE001 - any fetch failure degrades, never raises
        return {"status": "error", "error": str(exc), "signals": [], "params": dict(PARAMS)}

    index_phase = _index_phase(gspc)
    breadth = _breadth_phase(rsp, spy)
    divergence = index_phase == CONFIRMED_UP and breadth == NARROWING

    signals: list[dict[str, str]] = []
    if divergence:
        signals.append(
            {
                "key": "breadth_divergence",
                "level": "alert",
                "message": (
                    "Index in a confirmed uptrend but breadth is NARROWING "
                    "(equal-weight RSP lagging cap-weight SPY) - the 2021/2007-style "
                    "mega-cap-led top warning. Throttle new buys and tighten stops; "
                    "the rally is carried by fewer names than the index implies."
                ),
            }
        )

    return {
        "status": "ok",
        "index_phase": index_phase,
        "breadth_phase": breadth,
        "divergence": divergence,
        "signals": signals,
        "params": dict(PARAMS),
    }
