"""Daily dealer gamma-exposure monitor from CBOE option chains (HVL framework).

Estimates where the dealer community flips from net positive to net negative
gamma for each tracked underlying:

- Above the zero-gamma flip level dealers are net +gamma: they sell strength
  and buy weakness, suppressing volatility.
- Below it dealers are net -gamma: hedging forces them to sell into declines
  and buy into rallies, amplifying moves. The flip break is the point where
  the market structure itself turns into systematic sell pressure.

Method (documented approximation, the standard public proxy for
SpotGamma-style "HVL"/"volatility trigger" levels):

- Naive dealer-positioning convention: dealers are long calls (+gamma) and
  short puts (-gamma), weighted by open interest.
- Per-contract gamma is recomputed with Black-Scholes (r=0, feed IV) on a
  spot ladder of +/-15% in 0.5% steps; the flip is the sign-change crossing
  nearest the current spot, linearly interpolated.
- Net GEX is quoted in dollars of dealer delta-hedging per 1% spot move.

Source: CBOE delayed-quotes CDN, the same feed vol_structure_monitor uses.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping, Sequence
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import requests

CBOE_OPTIONS_URL = "https://cdn.cboe.com/api/global/delayed_quotes/options/{symbol}.json"

_SYMBOLS = {"SPX": "_SPX", "SMH": "SMH", "QQQ": "QQQ"}

THRESHOLDS: dict[str, float] = {
    "flip_proximity_watch_pct": 1.0,
}

# CBOE delayed-quotes timestamps are New York wall-clock; convert with DST.
_EASTERN = ZoneInfo("America/New_York")
# Delayed feed lags ~15 min; allow slack before calling an open-session read stale.
_FRESH_LIVE_MAX_MIN = 20.0
# Beyond this, a closed-market snapshot is too old even for a long holiday weekend.
_FRESH_CLOSED_MAX_MIN = 96.0 * 60.0
_FRESH_ORDER = {"live": 0, "prior_close": 1, "unknown": 2, "stale": 3}

_METHOD = (
    "naive dealer GEX (calls +gamma, puts -gamma, OI-weighted); Black-Scholes "
    "gamma recompute (r=0, feed IV) on +/-15% spot ladder; flip = zero-gamma "
    "crossing nearest spot. Public proxy for SpotGamma-style HVL, not the "
    "proprietary level."
)

_STRIKE_BAND = 0.30  # ignore strikes beyond +/-30% of spot (negligible gamma)
_LADDER_BAND = 0.15
_LADDER_STEP = 0.005
_CONTRACT_MULTIPLIER = 100.0
_EXPIRY_HOUR_UTC = 21  # ~16:00 New York close

_LEVEL_ORDER = {"normal": 0, "watch": 1, "alert": 2}

_OPTION_SYMBOL_RE = re.compile(r"^[A-Z]+(\d{6})([CP])(\d{8})$")

FetchFn = Callable[[str], Mapping[str, object]]


def fetch_option_chain(symbol: str, *, timeout: float = 30.0) -> Mapping[str, object]:
    """Fetch one CBOE delayed-quotes option-chain payload."""
    response = requests.get(CBOE_OPTIONS_URL.format(symbol=symbol), timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") if isinstance(payload, Mapping) else None
    if not isinstance(data, Mapping):
        raise ValueError(f"empty CBOE option chain for {symbol}")
    return data


def assess_freshness(last_trade_time: object, now: datetime) -> dict[str, object]:
    """Classify how fresh a chain snapshot is from its own ``last_trade_time``.

    Returns ``as_of`` (UTC ISO), ``age_minutes``, and a ``freshness`` label:
    ``live`` (recent enough to act on), ``prior_close`` (market shut, this is
    the most recent settled session - valid as the daily anchor, not live),
    ``stale`` (lagging mid-session or frozen beyond a long weekend), or
    ``unknown`` (no parseable timestamp). Never lets old data look live.
    """
    stamp = _parse_eastern(str(last_trade_time or ""))
    if stamp is None:
        return {"as_of": "", "age_minutes": None, "freshness": "unknown"}
    age_min = (now - stamp).total_seconds() / 60.0
    if age_min <= _FRESH_LIVE_MAX_MIN:
        label = "live"
    elif _is_regular_session(now):
        label = "stale"  # market open but the feed has not updated -> suspect
    elif age_min <= _FRESH_CLOSED_MAX_MIN:
        label = "prior_close"
    else:
        label = "stale"  # closed, yet older than any normal holiday weekend
    return {"as_of": stamp.isoformat(), "age_minutes": round(age_min, 1), "freshness": label}


def _parse_eastern(timestamp: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(timestamp)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc)
    return parsed.replace(tzinfo=_EASTERN).astimezone(timezone.utc)


def _is_regular_session(now: datetime) -> bool:
    eastern = now.astimezone(_EASTERN)
    if eastern.weekday() >= 5:  # Saturday/Sunday
        return False
    minutes = eastern.hour * 60 + eastern.minute
    return 9 * 60 + 30 <= minutes < 16 * 60


def parse_option_symbol(symbol: str) -> tuple[date, str, float] | None:
    """Parse an OCC-style option symbol into (expiry, 'C'|'P', strike)."""
    match = _OPTION_SYMBOL_RE.match(str(symbol or ""))
    if not match:
        return None
    raw_date, side, raw_strike = match.groups()
    try:
        expiry = datetime.strptime(raw_date, "%y%m%d").date()
    except ValueError:
        return None
    return expiry, side, int(raw_strike) / 1000.0


def bs_gamma(*, spot: float, strike: float, iv: float, t_years: float) -> float:
    """Black-Scholes gamma with r=0; identical for calls and puts."""
    if spot <= 0.0 or strike <= 0.0 or iv <= 0.0 or t_years <= 0.0:
        return 0.0
    vol_sqrt_t = iv * math.sqrt(t_years)
    d1 = (math.log(spot / strike) + 0.5 * iv * iv * t_years) / vol_sqrt_t
    density = math.exp(-0.5 * d1 * d1) / math.sqrt(2.0 * math.pi)
    return density / (spot * vol_sqrt_t)


def build_gamma_exposure_monitor(
    *,
    fetch: FetchFn | None = None,
    now: datetime | None = None,
    symbols: Mapping[str, str] | None = None,
) -> dict[str, object]:
    """Build the daily dealer gamma / zero-gamma-flip monitor payload."""
    fetch = fetch or fetch_option_chain
    timestamp = now or datetime.now(timezone.utc)
    tracked = dict(symbols) if symbols is not None else dict(_SYMBOLS)
    errors: list[str] = []
    underlyings: dict[str, dict[str, object]] = {}

    for name, symbol in tracked.items():
        try:
            chain = fetch(symbol)
            underlyings[name] = _analyze_chain(chain, now=timestamp)
        except Exception as exc:  # report every fetch/parse failure explicitly
            errors.append(f"{symbol} option chain failed: {exc}")

    signals = _classify(underlyings)
    overall = _overall_level(signals)
    freshness = _overall_freshness(underlyings)
    status = _status(underlyings, errors, expected=len(tracked), freshness=freshness)

    return {
        "status": status,
        "generated_at": timestamp.isoformat(),
        "underlyings": underlyings,
        "signals": signals,
        "overall_level": overall if status != "error" else "unknown",
        "freshness": freshness,
        "headline": _headline(status, overall, freshness, signals, underlyings),
        "interpretation": _interpretation(signals),
        "thresholds": dict(THRESHOLDS),
        "method": _METHOD,
        "errors": errors,
    }


def _analyze_chain(chain: Mapping[str, object], *, now: datetime) -> dict[str, object]:
    spot = float(str(chain.get("current_price")))
    if spot <= 0.0:
        raise ValueError(f"bad spot {spot}")
    rows = chain.get("options")
    contracts, skipped = _usable_contracts(
        rows if isinstance(rows, list) else [], spot=spot, now=now
    )
    if not contracts:
        raise ValueError("no usable contracts after filtering")

    net_at_spot = _net_dollar_gamma_per_pct(contracts, spot)
    flip = _flip_level(contracts, spot)
    regime = "negative" if net_at_spot < 0.0 else "positive"
    distance_pct = None
    if flip is not None and flip > 0.0:
        distance_pct = round((spot - flip) / flip * 100.0, 2)

    freshness = assess_freshness(chain.get("last_trade_time"), now)
    return {
        "spot": round(spot, 2),
        "flip_level": round(flip, 2) if flip is not None else None,
        "distance_to_flip_pct": distance_pct,
        "regime": regime,
        "net_gex_usd_per_pct": round(net_at_spot, 0),
        "net_gex_bn_per_pct": round(net_at_spot / 1e9, 3),
        "contracts_used": len(contracts),
        "contracts_skipped": skipped,
        "as_of": freshness["as_of"],
        "age_minutes": freshness["age_minutes"],
        "freshness": freshness["freshness"],
    }


def _usable_contracts(
    rows: Sequence[object],
    *,
    spot: float,
    now: datetime,
) -> tuple[list[tuple[float, float, float, float]], int]:
    """Return (strike, sign*oi, iv, t_years) tuples plus the skipped count."""
    contracts: list[tuple[float, float, float, float]] = []
    skipped = 0
    lower, upper = spot * (1.0 - _STRIKE_BAND), spot * (1.0 + _STRIKE_BAND)
    for row in rows:
        if not isinstance(row, Mapping):
            skipped += 1
            continue
        parsed = parse_option_symbol(str(row.get("option") or ""))
        oi = _as_float(row.get("open_interest"))
        iv = _as_float(row.get("iv"))
        if parsed is None or oi is None or iv is None or oi <= 0.0 or iv <= 0.0:
            skipped += 1
            continue
        expiry, side, strike = parsed
        t_years = _year_fraction(expiry, now)
        if t_years <= 0.0 or not (lower <= strike <= upper):
            skipped += 1
            continue
        sign = 1.0 if side == "C" else -1.0
        contracts.append((strike, sign * oi, iv, t_years))
    return contracts, skipped


def _net_dollar_gamma_per_pct(
    contracts: Sequence[tuple[float, float, float, float]],
    eval_spot: float,
) -> float:
    """Dealer dollar gamma per 1% move with all contracts marked at ``eval_spot``."""
    total = 0.0
    for strike, signed_oi, iv, t_years in contracts:
        gamma = bs_gamma(spot=eval_spot, strike=strike, iv=iv, t_years=t_years)
        total += signed_oi * gamma
    return total * _CONTRACT_MULTIPLIER * eval_spot * eval_spot * 0.01


def _flip_level(
    contracts: Sequence[tuple[float, float, float, float]],
    spot: float,
) -> float | None:
    steps = int(round(2 * _LADDER_BAND / _LADDER_STEP))
    ladder = [spot * (1.0 - _LADDER_BAND + _LADDER_STEP * index) for index in range(steps + 1)]
    values = [_net_dollar_gamma_per_pct(contracts, level) for level in ladder]

    best: float | None = None
    for index in range(len(ladder) - 1):
        lo_value, hi_value = values[index], values[index + 1]
        if lo_value == 0.0:
            crossing = ladder[index]
        elif lo_value * hi_value < 0.0:
            fraction = lo_value / (lo_value - hi_value)
            crossing = ladder[index] + fraction * (ladder[index + 1] - ladder[index])
        else:
            continue
        if best is None or abs(crossing - spot) < abs(best - spot):
            best = crossing
    return best


def _year_fraction(expiry: date, now: datetime) -> float:
    close = datetime(expiry.year, expiry.month, expiry.day, _EXPIRY_HOUR_UTC, tzinfo=timezone.utc)
    return (close - now).total_seconds() / (365.0 * 24 * 3600)


def _as_float(value: object) -> float | None:
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _classify(underlyings: Mapping[str, Mapping[str, object]]) -> list[dict[str, str]]:
    signals: list[dict[str, str]] = []
    for name, info in underlyings.items():
        spot = info.get("spot")
        flip = info.get("flip_level")
        distance = info.get("distance_to_flip_pct")
        net_bn = info.get("net_gex_bn_per_pct")
        if info.get("regime") == "negative":
            flip_text = f"{flip}" if flip is not None else "n/a (no crossing in band)"
            signals.append(
                {
                    "name": "negative_gamma",
                    "level": "alert",
                    "detail": (
                        f"{name} spot {spot} below zero-gamma flip {flip_text} "
                        f"(net GEX {net_bn}bn per 1%): dealers are short gamma - hedging forces "
                        "them to sell into declines and buy rallies, so moves are amplified and "
                        "dips are systematic sell pressure, not automatic buy-the-dip. Structure "
                        "has flipped short; per the HVL framework this is the highest-win-rate "
                        "zone to hold/add shorts until spot reclaims the flip."
                    ),
                }
            )
        elif (
            isinstance(distance, (int, float))
            and isinstance(flip, (int, float))
            and 0.0 < float(distance) <= THRESHOLDS["flip_proximity_watch_pct"]
        ):
            signals.append(
                {
                    "name": "gamma_flip_proximity",
                    "level": "watch",
                    "detail": (
                        f"{name} spot {spot} only {distance}% above zero-gamma flip {flip}: "
                        "dealers are still +gamma (vol suppressed) but one ordinary down session "
                        "flips them into forced sellers. Pre-set level: a break of "
                        f"{flip} turns market makers into systematic sellers - the structural "
                        "short-add trigger, no top-guessing needed."
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


def _overall_freshness(underlyings: Mapping[str, Mapping[str, object]]) -> str:
    if not underlyings:
        return "unknown"
    worst = "live"
    for info in underlyings.values():
        label = str(info.get("freshness") or "unknown")
        if _FRESH_ORDER.get(label, 2) > _FRESH_ORDER.get(worst, 0):
            worst = label
    return worst


def _status(
    underlyings: Mapping[str, object],
    errors: Sequence[str],
    *,
    expected: int,
    freshness: str,
) -> str:
    if not underlyings:
        return "error"
    if errors or len(underlyings) < expected or freshness == "stale":
        return "degraded"
    return "ok"


def _headline(
    status: str,
    overall: str,
    freshness: str,
    signals: Sequence[Mapping[str, str]],
    underlyings: Mapping[str, Mapping[str, object]],
) -> str:
    if status == "error":
        return (
            "Dealer gamma monitor failed: no CBOE option chains fetched - "
            "check connectivity, do not assume positive gamma."
        )
    prefix = ""
    if freshness == "stale":
        prefix = "[STALE DATA] "
    elif freshness == "prior_close":
        prefix = "[PRIOR CLOSE] "
    parts = []
    for name, info in underlyings.items():
        flip = info.get("flip_level")
        flip_text = flip if flip is not None else "n/a"
        parts.append(f"{name} {info.get('spot')} vs flip {flip_text} ({info.get('regime')} gamma)")
    levels = ", ".join(f"{signal['name']}={signal['level']}" for signal in signals) or "no critical signals"
    return f"{prefix}{overall.upper()}: {'; '.join(parts)} - {levels}"


def _interpretation(signals: Sequence[Mapping[str, str]]) -> list[str]:
    if not signals:
        return [
            "Dealer gamma structure unremarkable: tracked underlyings trade in positive-gamma "
            "territory with comfortable distance to the zero-gamma flip."
        ]
    return [str(signal["detail"]) for signal in signals]
