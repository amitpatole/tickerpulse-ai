"""Daily leverage/correlation structure monitor from CBOE dispersion indices.

Watches three CBOE indices that describe how much single-stock leverage is
stacked under a calm index surface:

- ``VIXEQ``: cap-weighted implied volatility of S&P 500 constituents. A high
  VIXEQ premium over VIX means single-stock options are being bid aggressively
  versus the index (concentrated single-name speculation).
- ``COR1M``: 1-month implied correlation. Schematically, index variance is
  single-stock variance plus weighted pairwise correlation, so a COR1M floor
  means investors are being rewarded for independent single-stock bets while
  the index surface stays calm. A shock can force correlations sharply higher.
- ``VIX``: index-level implied volatility, used for the spread/ratio context.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone

import requests

CBOE_QUOTE_URL = "https://cdn.cboe.com/api/global/delayed_quotes/quotes/{symbol}.json"
CBOE_HISTORY_URL = "https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/{symbol}.json"

_SYMBOLS = {"COR1M": "_COR1M", "VIXEQ": "_VIXEQ", "VIX": "_VIX"}
_TRADING_DAYS_1Y = 252
_REGIME_ANCHOR_DATE = "2023-01-01"
_REGIME_INDEXES = ("COR1M", "VIXEQ")
_DRIFT_MIN_POINTS = 2.0
_DRIFT_MIN_PCT = 10.0
_DRIFT_STRONG_MIN_PCT = 20.0

THRESHOLDS: dict[str, float] = {
    "cor1m_alert_low": 10.0,
    "cor1m_watch_low": 15.0,
    "cor1m_full_pctile_alert": 2.0,
    "cor1m_1y_pctile_watch": 10.0,
    "cor1m_snap_1d_pts": 4.0,
    "cor1m_snap_1d_pct": 30.0,
    "cor1m_snap_5d_pts": 8.0,
    "ratio_alert": 3.0,
    "ratio_1y_pctile_alert": 98.0,
    "ratio_1y_pctile_watch": 90.0,
    "vixeq_stress_level": 40.0,
}

_LEVEL_ORDER = {"normal": 0, "watch": 1, "alert": 2}

FetchFn = Callable[[str, str], object]


def fetch_cboe(kind: str, symbol: str, *, timeout: float = 20.0) -> object:
    """Fetch one CBOE delayed-quotes payload. ``kind`` is ``quote`` or ``history``."""
    template = CBOE_QUOTE_URL if kind == "quote" else CBOE_HISTORY_URL
    response = requests.get(template.format(symbol=symbol), timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") if isinstance(payload, Mapping) else None
    if kind == "history":
        if not isinstance(data, list) or not data:
            raise ValueError(f"empty CBOE history for {symbol}")
        return data
    if not isinstance(data, Mapping):
        raise ValueError(f"empty CBOE quote for {symbol}")
    return data


def build_vol_structure_monitor(
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    """Build the daily VIXEQ/COR1M leverage & correlation monitor payload."""
    fetch = fetch or fetch_cboe
    timestamp = now or datetime.now(timezone.utc)
    errors: list[str] = []
    series: dict[str, list[tuple[str, float]]] = {}
    indices: dict[str, dict[str, object]] = {}

    for name, symbol in _SYMBOLS.items():
        closes = _fetch_history(fetch, symbol, errors)
        if closes is None:
            continue
        series[name] = closes
        indices[name] = _index_summary(name, symbol, closes, fetch)

    derived = _derived_metrics(series)
    signals = _classify(series, derived)
    overall = _overall_level(signals)
    status = _status(series, errors)

    return {
        "status": status,
        "generated_at": timestamp.isoformat(),
        "indices": indices,
        "derived": derived,
        "signals": signals,
        "overall_level": overall if status != "error" else "unknown",
        "headline": _headline(status, overall, signals, indices),
        "interpretation": _interpretation(signals),
        "thresholds": dict(THRESHOLDS),
        "errors": errors,
    }


def _fetch_history(
    fetch: FetchFn,
    symbol: str,
    errors: list[str],
) -> list[tuple[str, float]] | None:
    try:
        rows = fetch("history", symbol)
    except Exception as exc:  # report every fetch failure explicitly
        errors.append(f"{symbol} history fetch failed: {exc}")
        return None
    closes: list[tuple[str, float]] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, Mapping):
            continue
        try:
            closes.append((str(row.get("date") or ""), float(str(row.get("close")))))
        except (TypeError, ValueError):
            continue
    if not closes:
        errors.append(f"{symbol} history fetch failed: no parseable rows")
        return None
    closes.sort(key=lambda item: item[0])
    return closes


def _index_summary(
    name: str,
    symbol: str,
    closes: Sequence[tuple[str, float]],
    fetch: FetchFn,
) -> dict[str, object]:
    values = [value for _date, value in closes]
    latest_date, latest = closes[-1]
    summary: dict[str, object] = {
        "close": round(latest, 2),
        "close_date": latest_date,
        "change_1d": round(latest - values[-2], 2) if len(values) >= 2 else None,
        "pctile_1y": _percentile(values[-_TRADING_DAYS_1Y:], latest),
        "pctile_full": _percentile(values, latest),
        "full_start": closes[0][0],
        "live": None,
        "live_time": "",
    }
    if name in _REGIME_INDEXES:
        summary.update(_regime_window_summary(closes, latest))
    try:
        quote = fetch("quote", symbol)
    except Exception:  # quote is enrichment; close data already reported
        return summary
    if isinstance(quote, Mapping):
        try:
            summary["live"] = round(float(str(quote.get("current_price"))), 2)
            summary["live_time"] = str(quote.get("last_trade_time") or "")
        except (TypeError, ValueError):
            pass
    return summary


def _regime_window_summary(
    closes: Sequence[tuple[str, float]],
    latest: float,
) -> dict[str, object]:
    values = [value for _date, value in closes]
    trailing = values[-_TRADING_DAYS_1Y:]
    anchor_values = [value for date, value in closes if date >= _REGIME_ANCHOR_DATE]
    full_max_date, full_max = max(closes, key=lambda item: item[1])
    summary: dict[str, object] = {
        "full_start": closes[0][0],
        "full_max": round(full_max, 2),
        "full_max_date": full_max_date,
        "full_mean": _rounded_mean(values),
        "full_median": _rounded_median(values),
        "mean_1y": _rounded_mean(trailing),
        "median_1y": _rounded_median(trailing),
        "regime_anchor_date": _REGIME_ANCHOR_DATE,
    }
    if anchor_values:
        summary.update(
            {
                "pctile_2023": _percentile(anchor_values, latest),
                "mean_2023": _rounded_mean(anchor_values),
                "median_2023": _rounded_median(anchor_values),
            }
        )
    return summary


def _rounded_mean(values: Sequence[float]) -> float:
    return round(statistics.mean(values), 2)


def _rounded_median(values: Sequence[float]) -> float:
    return round(statistics.median(values), 2)


def _derived_metrics(series: Mapping[str, list[tuple[str, float]]]) -> dict[str, object]:
    derived: dict[str, object] = {
        "vixeq_vix_spread": None,
        "vixeq_vix_ratio": None,
        "ratio_pctile_1y": None,
        "cor1m_change_1d_pts": None,
        "cor1m_change_1d_pct": None,
        "cor1m_change_5d_pts": None,
        "regime_drift": {},
        "regime_state": {},
    }
    cor = series.get("COR1M")
    if cor and len(cor) >= 2:
        latest, prev = cor[-1][1], cor[-2][1]
        derived["cor1m_change_1d_pts"] = round(latest - prev, 2)
        if prev > 0:
            derived["cor1m_change_1d_pct"] = round((latest - prev) / prev * 100.0, 1)
    if cor and len(cor) >= 6:
        derived["cor1m_change_5d_pts"] = round(cor[-1][1] - cor[-6][1], 2)

    ratios = _ratio_series(series.get("VIXEQ"), series.get("VIX"))
    if ratios:
        latest_ratio = ratios[-1]
        derived["vixeq_vix_ratio"] = round(latest_ratio, 2)
        derived["ratio_pctile_1y"] = _percentile(ratios[-_TRADING_DAYS_1Y:], latest_ratio)
        vixeq = series.get("VIXEQ")
        vix = series.get("VIX")
        if vixeq and vix:
            derived["vixeq_vix_spread"] = round(vixeq[-1][1] - vix[-1][1], 2)
    derived["regime_drift"] = _regime_drift(series)
    derived["regime_state"] = _regime_state(series, derived)
    return derived


def _ratio_series(
    vixeq: Sequence[tuple[str, float]] | None,
    vix: Sequence[tuple[str, float]] | None,
) -> list[float]:
    if not vixeq or not vix:
        return []
    vix_by_date = {date: value for date, value in vix if value > 0}
    return [value / vix_by_date[date] for date, value in vixeq if date in vix_by_date]


def _regime_drift(series: Mapping[str, list[tuple[str, float]]]) -> dict[str, dict[str, object]]:
    drift: dict[str, dict[str, object]] = {}
    for name in _REGIME_INDEXES:
        closes = series.get(name)
        if not closes:
            continue
        item = _regime_drift_item(name, closes)
        if item:
            drift[name] = item
    return drift


def _regime_drift_item(
    name: str,
    closes: Sequence[tuple[str, float]],
) -> dict[str, object]:
    values = [value for _date, value in closes]
    trailing = values[-_TRADING_DAYS_1Y:]
    anchor_values = [value for date, value in closes if date >= _REGIME_ANCHOR_DATE]
    if not trailing or not anchor_values:
        return {}
    median_1y = statistics.median(trailing)
    median_anchor = statistics.median(anchor_values)
    drift_pts = median_1y - median_anchor
    drift_pct = (drift_pts / median_anchor * 100.0) if median_anchor else 0.0
    anchor_iqr = _iqr(anchor_values)
    direction = _direction(drift_pts)
    signal = _drift_signal(drift_pts, drift_pct, anchor_iqr)
    return {
        "anchor_date": _REGIME_ANCHOR_DATE,
        "median_1y": round(median_1y, 2),
        "median_2023": round(median_anchor, 2),
        "drift_pts": round(drift_pts, 2),
        "drift_pct": round(drift_pct, 1),
        "anchor_iqr": round(anchor_iqr, 2),
        "direction": direction,
        "signal": signal,
        "label": _drift_label(name, direction, signal),
    }


def _iqr(values: Sequence[float]) -> float:
    return _quantile(values, 0.75) - _quantile(values, 0.25)


def _quantile(values: Sequence[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def _direction(value: float) -> str:
    if value > 0:
        return "up"
    if value < 0:
        return "down"
    return "flat"


def _drift_signal(drift_pts: float, drift_pct: float, anchor_iqr: float) -> str:
    if abs(drift_pts) < _DRIFT_MIN_POINTS or abs(drift_pct) < _DRIFT_MIN_PCT:
        return "flat"
    if anchor_iqr > 0 and abs(drift_pts) >= anchor_iqr * 0.5:
        return "strong"
    if abs(drift_pct) >= _DRIFT_STRONG_MIN_PCT:
        return "strong"
    return "mild"


def _drift_label(name: str, direction: str, signal: str) -> str:
    if signal == "flat" or direction == "flat":
        return "baseline stable"
    if name == "COR1M" and direction == "up":
        return "correlation baseline rising; dispersion regime weakening"
    if name == "COR1M":
        return "correlation baseline lower; dispersion crowding baseline deeper"
    if direction == "up":
        return "single-stock vol baseline rising"
    return "single-stock vol baseline falling; froth easing"


def _regime_state(
    series: Mapping[str, list[tuple[str, float]]],
    derived: Mapping[str, object],
) -> dict[str, object]:
    cor = series.get("COR1M")
    if not cor:
        return {}
    latest = cor[-1][1]
    change_1d = derived.get("cor1m_change_1d_pts")
    change_pct = derived.get("cor1m_change_1d_pct")
    change_5d = derived.get("cor1m_change_5d_pts")
    if _cor1m_snap_active(change_1d, change_pct, change_5d):
        return {
            "label": "macro/beta",
            "detail": "correlation snap overriding low absolute COR1M; selection benefit is being compressed",
        }
    if latest <= THRESHOLDS["cor1m_watch_low"]:
        return {
            "label": "selection/alpha",
            "detail": "low implied correlation is selection-friendly, but it is not proof of stock-picking alpha",
        }
    if latest >= 30.0:
        return {"label": "macro/beta", "detail": "high implied correlation points to macro-beta dominance"}
    return {"label": "rotating", "detail": "COR1M is between selection-friendly and macro-beta regimes"}


def _cor1m_snap_active(change_pts: object, change_pct: object, change_5d: object) -> bool:
    snap_1d = (
        isinstance(change_pts, (int, float))
        and change_pts > 0
        and (
            change_pts >= THRESHOLDS["cor1m_snap_1d_pts"]
            or (isinstance(change_pct, (int, float)) and change_pct >= THRESHOLDS["cor1m_snap_1d_pct"])
        )
    )
    snap_5d = isinstance(change_5d, (int, float)) and change_5d >= THRESHOLDS["cor1m_snap_5d_pts"]
    return snap_1d or snap_5d


def _classify(
    series: Mapping[str, list[tuple[str, float]]],
    derived: Mapping[str, object],
) -> list[dict[str, str]]:
    signals: list[dict[str, str]] = []
    cor = series.get("COR1M")
    if cor:
        signals.extend(_cor1m_signals(cor, derived))
    signals.extend(_froth_signals(series, derived))
    return signals


def _cor1m_signals(
    cor: Sequence[tuple[str, float]],
    derived: Mapping[str, object],
) -> list[dict[str, str]]:
    signals: list[dict[str, str]] = []
    values = [value for _date, value in cor]
    latest = values[-1]
    pctile_1y = _percentile(values[-_TRADING_DAYS_1Y:], latest)
    pctile_full = _percentile(values, latest)

    pctile_text = f"pctile {pctile_1y:.0f} 252 sessions / {pctile_full:.0f} full"
    if latest <= THRESHOLDS["cor1m_alert_low"] or pctile_full <= THRESHOLDS["cor1m_full_pctile_alert"]:
        signals.append(
            {
                "name": "dispersion_crowding",
                "level": "alert",
                "detail": (
                    f"COR1M {latest:.2f} at/near historic floor ({pctile_text}): "
                    "implied correlation crushed - leverage stacked on independent single-stock bets, "
                    "index artificially flat. Crash fuel is loaded; any shock can force correlations "
                    "sharply higher."
                ),
            }
        )
    elif latest <= THRESHOLDS["cor1m_watch_low"] or pctile_1y <= THRESHOLDS["cor1m_1y_pctile_watch"]:
        signals.append(
            {
                "name": "dispersion_crowding",
                "level": "watch",
                "detail": (
                    f"COR1M {latest:.2f} below watch level {THRESHOLDS['cor1m_watch_low']:.0f} "
                    f"({pctile_text}): dispersion crowding building - single-stock leverage rising "
                    "while index vol stays suppressed."
                ),
            }
        )

    change_pts = derived.get("cor1m_change_1d_pts")
    change_pct = derived.get("cor1m_change_1d_pct")
    change_5d = derived.get("cor1m_change_5d_pts")
    snap_1d = (
        isinstance(change_pts, (int, float))
        and (
            change_pts >= THRESHOLDS["cor1m_snap_1d_pts"]
            or (isinstance(change_pct, (int, float)) and change_pct >= THRESHOLDS["cor1m_snap_1d_pct"])
        )
        and change_pts > 0
    )
    if snap_1d:
        signals.append(
            {
                "name": "correlation_snap",
                "level": "alert",
                "detail": (
                    f"COR1M +{float(change_pts):.2f} pts (+{float(change_pct or 0):.0f}%) in 1d to {latest:.2f}: "
                    "correlation snapping higher - stocks falling together, leveraged longs forced "
                    "to de-gross simultaneously. This is the deleveraging itself, not a warning of it."
                ),
            }
        )
    elif isinstance(change_5d, (int, float)) and change_5d >= THRESHOLDS["cor1m_snap_5d_pts"]:
        signals.append(
            {
                "name": "correlation_snap",
                "level": "watch",
                "detail": (
                    f"COR1M +{float(change_5d):.2f} pts over 5d to {latest:.2f}: correlation grinding back "
                    "up - dispersion/leverage unwind likely underway."
                ),
            }
        )
    return signals


def _froth_signals(
    series: Mapping[str, list[tuple[str, float]]],
    derived: Mapping[str, object],
) -> list[dict[str, str]]:
    signals: list[dict[str, str]] = []
    ratio = derived.get("vixeq_vix_ratio")
    ratio_pctile = derived.get("ratio_pctile_1y")
    if isinstance(ratio, (int, float)):
        is_alert = ratio >= THRESHOLDS["ratio_alert"] or (
            isinstance(ratio_pctile, (int, float)) and ratio_pctile >= THRESHOLDS["ratio_1y_pctile_alert"]
        )
        is_watch = isinstance(ratio_pctile, (int, float)) and ratio_pctile >= THRESHOLDS["ratio_1y_pctile_watch"]
        if is_alert or is_watch:
            level = "alert" if is_alert else "watch"
            signals.append(
                {
                    "name": "single_stock_froth",
                    "level": level,
                    "detail": (
                        f"VIXEQ/VIX ratio {float(ratio):.2f} "
                        f"({float(ratio_pctile or 0):.0f}th pctile 252 sessions): "
                        "single-stock options bid far above index - concentrated single-name "
                        "speculation/leverage is extreme."
                    ),
                }
            )

    vixeq = series.get("VIXEQ")
    if vixeq and vixeq[-1][1] >= THRESHOLDS["vixeq_stress_level"]:
        signals.append(
            {
                "name": "single_stock_vol_stress",
                "level": "watch",
                "detail": (
                    f"VIXEQ {vixeq[-1][1]:.2f} >= {THRESHOLDS['vixeq_stress_level']:.0f}: average "
                    "single-stock implied vol is stressed - margin/options leverage expensive to carry."
                ),
            }
        )
    return signals


def _overall_level(signals: Sequence[Mapping[str, str]]) -> str:
    level = "normal"
    for signal in signals:
        if _LEVEL_ORDER.get(str(signal.get("level")), 0) > _LEVEL_ORDER[level]:
            level = str(signal.get("level"))
    return level


def _status(series: Mapping[str, object], errors: Sequence[str]) -> str:
    if not series:
        return "error"
    if errors or len(series) < len(_SYMBOLS):
        return "degraded"
    return "ok"


def _headline(
    status: str,
    overall: str,
    signals: Sequence[Mapping[str, str]],
    indices: Mapping[str, Mapping[str, object]],
) -> str:
    if status == "error":
        return "Leverage monitor failed: no CBOE index data fetched - check connectivity, do not assume calm."
    parts = []
    for name in ("COR1M", "VIXEQ", "VIX"):
        info = indices.get(name)
        if info:
            parts.append(f"{name} {info.get('close')}")
    levels = ", ".join(f"{signal['name']}={signal['level']}" for signal in signals) or "no critical signals"
    return f"{overall.upper()}: {'; '.join(parts)} - {levels}"


def _interpretation(signals: Sequence[Mapping[str, str]]) -> list[str]:
    if not signals:
        return [
            "Leverage structure unremarkable: implied correlation and the single-stock vol premium "
            "are both inside normal ranges."
        ]
    return [str(signal["detail"]) for signal in signals]


def _percentile(window: Sequence[float], value: float) -> float:
    """inclusive empirical CDF percentile: percent of window values <= value."""
    if not window:
        return 0.0
    rank = sum(1 for item in window if item <= value)
    return round(rank / len(window) * 100.0, 1)
