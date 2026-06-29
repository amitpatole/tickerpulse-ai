"""Claim/story-card layer between raw X posts and the news-layer Markdown report.

Turns collected followed-account and search posts into clustered story cards
with a concrete claim, expectation delta, impact, confidence, affected
tickers, graded sources, and a causal next check. Also owns source grading
and Bernstein public-echo assessment so quality gating has one home.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone

CASHTAG_RE = re.compile(r"(?<![A-Za-z0-9_])\$[A-Za-z]{1,6}(?:\.[A-Za-z]{1,3})?")

# Ordered most-specific first so a Bernstein echo about CPO clusters with the
# CPO story instead of forming a separate generic Bernstein story.
STORY_THEMES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "CPO / 800VDC / interconnect timing",
        (
            "cpo", "800v", "800vdc", "lpo", "npo", "co-packaged", "silicon photonics",
            "optical interconnect", "光模块", "硅光",
        ),
    ),
    (
        "HBM / memory supply chain",
        ("hbm", "hbm4", "nand", "dram", "cowos", "advanced packaging", "memory"),
    ),
    (
        "AI infrastructure capex",
        (
            "gpu", "nvl72", "rubin", "blackwell", "data center", "datacenter", "power",
            "liquid cooling", "hyperscaler", "capex",
        ),
    ),
    (
        "China / policy tape",
        ("export control", "bis", "tariff", "a-share", "a share", "commerce department", "china"),
    ),
    (
        "Crypto liquidity",
        ("btc", "bitcoin", "eth", "ethereum", "etf", "liquidation", "stablecoin"),
    ),
    ("Bernstein AI/semi research", ("bernstein", "sanford", "伯恩斯坦")),
)

THEME_BASKETS: dict[str, tuple[str, ...]] = {
    "CPO / 800VDC / interconnect timing": ("$AAOI", "$LITE", "$COHR", "$CRDO", "$MRVL"),
    "HBM / memory supply chain": ("$MU", "$LRCX", "$AMAT"),
    "AI infrastructure capex": ("$NVDA", "$AMD", "$AVGO", "$TSM", "$ANET"),
    "China / policy tape": ("$NVDA", "$AMD", "$ASML"),
    "Crypto liquidity": ("$COIN", "$MSTR"),
    "Bernstein AI/semi research": ("$NVDA", "$AVGO"),
}

# Config intent from config/x_watchlists.yaml quality_filters:
# drop_obvious_promo / drop_giveaways / drop_telegram_signal_ads.
PROMO_MARKERS: tuple[str, ...] = (
    "giveaway", "airdrop", "join my telegram", "telegram signal", "signal group",
    "presale", "whitelist", "pump group", "referral code", "promo code", "100x",
)
PRIMARY_SOURCE_MARKERS: tuple[str, ...] = (
    "sec filing", "8-k", "10-q", "10-k", "s-1", "424b", "press release", "prospectus",
    "earnings call", "transcript", "commerce department", "federal register",
    "white house", "official statement", "exchange notice", "filing",
)
CITED_SOURCE_MARKERS: tuple[str, ...] = (
    "according to", "reuters", "bloomberg", "wsj", "wall street journal", "nikkei",
    "financial times", "report", "note", "summary", "research", "says", "said",
    "研报", "纪要", "报道",
)

BERNSTEIN_KEYWORDS: tuple[str, ...] = ("bernstein", "sanford", "伯恩斯坦")
_AI_SEMI_THEME_NAMES = (
    "CPO / 800VDC / interconnect timing",
    "HBM / memory supply chain",
    "AI infrastructure capex",
)
AI_SEMI_RELEVANCE_KEYWORDS: tuple[str, ...] = tuple(
    keyword
    for name, keywords in STORY_THEMES
    if name in _AI_SEMI_THEME_NAMES
    for keyword in keywords
) + ("semiconductor", "semis", "中际旭创", "optical")


# ---------------------------------------------------------------------------
# Shared post primitives
# ---------------------------------------------------------------------------


def post_text(post: Mapping[str, object]) -> str:
    return str(post.get("text") or "")


def contains_any(text: str, keywords: Sequence[str]) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def truncate(value: str, max_chars: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 3].rstrip() + "..."


def parse_datetime(value: str) -> datetime | None:
    text = value.strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def post_datetime(post: Mapping[str, object]) -> datetime | None:
    return parse_datetime(str(post.get("date") or ""))


def post_timestamp(post: Mapping[str, object]) -> float:
    timestamp = post_datetime(post)
    return timestamp.timestamp() if timestamp is not None else 0.0


def freshness_bucket(post: Mapping[str, object], reference: datetime | None) -> int:
    timestamp = post_datetime(post)
    if timestamp is None:
        return 0
    if reference is None:
        return 1
    age = reference - timestamp
    if age <= timedelta(hours=48):
        return 3
    if age <= timedelta(days=7):
        return 2
    return 1


def fresh_posts(
    posts: Sequence[Mapping[str, object]],
    *,
    generated_at: str,
) -> list[Mapping[str, object]]:
    reference = parse_datetime(generated_at)
    if reference is None:
        return list(posts)
    fresh = [post for post in posts if freshness_bucket(post, reference) >= 2]
    return fresh or list(posts)


def signal_score(post: Mapping[str, object]) -> int:
    try:
        return int(post.get("signal_score") or 0)
    except (TypeError, ValueError):
        return 0


def source_reliability_score(post: Mapping[str, object]) -> float:
    try:
        return float(post.get("source_reliability_score") or 0)
    except (TypeError, ValueError):
        return 0.0


def tickers_for_post(post: Mapping[str, object]) -> list[str]:
    tags = {match.upper() for match in CASHTAG_RE.findall(post_text(post))}
    seeds = post.get("ticker_seeds")
    if isinstance(seeds, (list, tuple)):
        tags.update(
            "$" + str(seed).strip().upper().lstrip("$")
            for seed in seeds if str(seed).strip()
        )
    return sorted(tags)


def source_identity(post: Mapping[str, object]) -> str:
    return str(post.get("handle") or post.get("source_query") or "x")


# ---------------------------------------------------------------------------
# Source grading
# ---------------------------------------------------------------------------


def grade_source(post: Mapping[str, object]) -> dict[str, object]:
    """Grade one post's source quality for the story layer.

    Ladder: followed-account posts outrank news wire headlines, which outrank
    search echoes; primary/official and named research/wire citations outrank
    plain text; uncited search hits are downgraded; promotional posts are
    dropped from the story layer entirely (raw tape keeps them visible).
    """
    text = post_text(post).lower()
    if str(post.get("source_type") or "") == "news_wire":
        origin = "news_wire"
    elif str(post.get("handle") or ""):
        origin = "followed"
    else:
        origin = "search"
    if contains_any(text, PROMO_MARKERS):
        return {"score": 0, "label": "promotional post (dropped)", "origin": origin, "cites_primary": False}

    cites_primary = contains_any(text, PRIMARY_SOURCE_MARKERS)
    cites_named = contains_any(text, CITED_SOURCE_MARKERS)
    if origin == "followed":
        if cites_primary:
            return {"score": 8, "label": "followed account citing primary/official source", "origin": origin, "cites_primary": True}
        if cites_named:
            return {"score": 7, "label": "followed account citing named research/wire", "origin": origin, "cites_primary": False}
        return {"score": 6, "label": "followed account original post", "origin": origin, "cites_primary": False}
    if origin == "news_wire":
        return {"score": 5, "label": "news wire headline", "origin": origin, "cites_primary": cites_primary}
    if cites_primary:
        return {"score": 4, "label": "search echo citing primary/official source", "origin": origin, "cites_primary": True}
    if cites_named:
        return {"score": 3, "label": "search echo citing named research/wire", "origin": origin, "cites_primary": False}
    if "http" not in text:
        return {"score": 1, "label": "uncited search echo, downgraded", "origin": origin, "cites_primary": False}
    return {"score": 2, "label": "generic search echo", "origin": origin, "cites_primary": False}


# ---------------------------------------------------------------------------
# Bernstein public-echo assessment
# ---------------------------------------------------------------------------


def is_bernstein_post(post: Mapping[str, object]) -> bool:
    source_query = str(post.get("source_query") or "").lower()
    if source_query == "bernstein_ai_semis":
        return True
    return contains_any(post_text(post), BERNSTEIN_KEYWORDS)


def bernstein_echo_relevant(post: Mapping[str, object]) -> bool:
    """True when the echo is about AI/semi coverage, not unrelated Bernstein tape."""
    return contains_any(post_text(post), AI_SEMI_RELEVANCE_KEYWORDS)


def bernstein_source_label(post: Mapping[str, object]) -> str:
    """Default-run labels only; `primary Bernstein report` requires entitled access."""
    if contains_any(post_text(post), CITED_SOURCE_MARKERS):
        return "public summary of Bernstein"
    return "unconfirmed echo"


# ---------------------------------------------------------------------------
# Claim heuristics (claim, expectation delta, impact, next action)
# ---------------------------------------------------------------------------


def is_cpo_delay_post(text: str) -> bool:
    has_cpo_or_power = contains_any(text, ("cpo", "800v", "800vdc", "optical"))
    has_delay = contains_any(
        text,
        ("push", "pushed", "pushout", "delay", "delayed", "slip", "slipped", "2028", "2029"),
    )
    return has_cpo_or_power and has_delay


def what_happened_for_post(post: Mapping[str, object]) -> str:
    text = post_text(post).lower()
    if is_cpo_delay_post(text):
        return (
            "SemiAnalysis/public echoes say NVIDIA 800VDC and CPO mass adoption "
            "is being pushed toward 2028-2029."
        )
    if contains_any(text, ("cpo", "800v", "800vdc", "optical")):
        return "The tape is debating whether AI optical and power timing slipped or was overread."
    if contains_any(text, ("nand", "hbm", "dram", "memory", "sk hynix", "tokyo electron")):
        return "The memory tape points to possible density, capex, and equipment-share readthroughs."
    if contains_any(text, ("cowos", "asic", "gpu", "gb200", "nvl72", "blackwell", "inference")):
        return "The item matters if it changes accelerator, networking, foundry, or packaging demand."
    if contains_any(text, ("btc", "bitcoin", "eth", "ethereum", "liquidation", "etf")):
        return "Crypto stress is a risk-appetite signal, not an equity call by itself."
    if contains_any(text, ("iran", "venezuela", "nuclear", "tariff", "cpi", "inflation", "oil", "fed")):
        return "The macro tape matters if it changes oil, rates, the dollar, or semis risk premium."
    return "The post ranked highly enough to review, but it still needs a clean ticker or source map."


def expectation_delta_for_post(post: Mapping[str, object]) -> str:
    text = post_text(post).lower()
    if is_cpo_delay_post(text):
        return (
            "Slower/later than expected: a push to 2028-2029 is a delay versus "
            "the 2027 ramp investors expected."
        )
    if contains_any(text, ("denied", "contrary", "overblown", "not delayed")):
        return "Better than the bearish read: pushback lowers confidence in the delay narrative."
    if contains_any(text, ("mass production", "mass-produce", "by year-end", "selects")):
        return "Faster/cleaner than feared if confirmed: production timing appears closer, not later."
    if contains_any(text, ("guidance", "growth", "beat", "raise", "strong")):
        return "Better than expectations if the company commentary is confirmed by transcript or filings."
    if contains_any(text, ("cpi", "inflation", "oil", "tariff", "iran")):
        return "Macro risk is worse if it lifts oil, rates, or the dollar more than equities expected."
    if contains_any(text, ("btc", "bitcoin", "eth", "liquidation", "etf")):
        return "Liquidity is worse if price/flow confirms stress; otherwise it is just noisy tape."
    return "Unclear versus expectations until the claim is mapped to affected tickers and verified."


def impact_for_post(
    post: Mapping[str, object],
    tickers: Sequence[str],
    *,
    source_type: str,
) -> str:
    text = post_text(post).lower()
    ticker_text = ", ".join(tickers[:5]) if tickers else "affected watchlist names"
    if is_cpo_delay_post(text):
        return (
            "Negative for near-term CPO/optical revenue expectations because the "
            "revenue ramp shifts out; pressure should fall on AAOI, LITE, COHR, "
            "CRDO, MRVL, WOLF-type baskets unless company checks refute it."
        )
    if contains_any(text, ("denied", "contrary", "overblown", "not delayed")):
        return (
            "Positive for beaten-up optical/power names if true because the market "
            "may have over-discounted a delay."
        )
    if contains_any(text, ("nand", "hbm", "dram", "memory", "sk hynix", "tokyo electron")):
        return (
            "Relevant for MU, SK Hynix, Tokyo Electron, LRCX, and AMAT because "
            "capacity or process timing changes memory supply and equipment demand."
        )
    if contains_any(text, ("cowos", "asic", "gpu", "gb200", "nvl72", "blackwell", "inference")):
        return (
            "Relevant for NVDA, AMD, AVGO, TSM, ANET, and SMH because architecture "
            "or inference shifts change accelerator, networking, and packaging demand."
        )
    if tickers:
        return f"Relevant to {ticker_text} because the post names tradable exposures from {source_type}."
    return f"Market impact is not yet pinned down because {source_type} did not name a clean ticker."


def action_for_post(
    post: Mapping[str, object],
    tickers: Sequence[str],
    *,
    source_type: str,
) -> str:
    text = post_text(post).lower()
    ticker_text = ", ".join(tickers[:5]) if tickers else "the affected names"
    thematic_action = _thematic_action(text, ticker_text, source_type)
    if thematic_action:
        return thematic_action
    if tickers:
        return (
            f"Prioritize quote, filing, and source follow-up for {ticker_text} because "
            "a named ticker plus configured watchlist keywords creates a concrete "
            "candidate, not just a macro theme."
        )
    return (
        "Identify the affected tickers and primary source before acting because the "
        f"item ranked in {source_type} collection but does not yet name a tradable "
        "instrument cleanly."
    )


def _thematic_action(text: str, ticker_text: str, source_type: str) -> str:
    if contains_any(text, ("cpo", "800v", "800vdc", "lpo", "npo", "optical")):
        return (
            f"Map {ticker_text} to optical/interconnect exposure and verify with primary "
            f"company or channel checks before sizing because {source_type} tape is "
            "thesis-relevant but not final confirmation."
        )
    if contains_any(
        text,
        ("cowos", "asic", "gpu", "gb200", "nvl72", "blackwell", "deepseek", "inference"),
    ):
        return (
            f"Map {ticker_text} to NVDA, AMD, AVGO, TSM, ANET, and SMH exposure "
            "because AI-infra architecture or inference claims matter through "
            "accelerator, networking, foundry, and packaging demand."
        )
    if contains_any(text, ("nand", "hbm", "dram", "memory", "sk hynix", "tokyo electron")):
        return (
            f"Map {ticker_text} to MU, SK Hynix, Tokyo Electron, LRCX, and AMAT "
            "readthroughs and verify the primary industry source because memory "
            "capacity/process claims can change equipment and supply-chain estimates."
        )
    if contains_any(text, ("iran", "venezuela", "nuclear", "tariff", "cpi", "inflation", "oil", "fed")):
        return (
            f"Map {ticker_text} to oil, rates, USD, defense, and high-beta semis "
            "because macro/geopolitical tape matters through risk premium, energy "
            "inflation, and discount-rate pressure."
        )
    if contains_any(text, ("bernstein", "sanford")):
        return (
            f"Treat {ticker_text} as an alert for entitled research follow-up because "
            "the default run captures public echoes, not primary Bernstein reports."
        )
    if contains_any(text, ("btc", "bitcoin", "eth", "ethereum", "liquidation", "etf")):
        return (
            f"Use {ticker_text} as a risk-appetite monitor because crypto/liquidity "
            "stress only matters for equities after price or flow confirmation."
        )
    return ""


# ---------------------------------------------------------------------------
# Story clustering and card building
# ---------------------------------------------------------------------------


def story_theme_for_post(post: Mapping[str, object]) -> str:
    text = post_text(post)
    for name, keywords in STORY_THEMES:
        if contains_any(text, keywords):
            return name
    return ""


def build_story_cards(
    posts: Sequence[Mapping[str, object]],
    *,
    generated_at: str,
    limit: int = 5,
) -> list[dict[str, object]]:
    """Cluster fresh, quality-gated posts into ranked claim-level story cards."""
    reference = parse_datetime(generated_at)
    clusters: dict[str, list[tuple[str, Mapping[str, object], dict[str, object]]]] = {}
    for post in posts:
        grade = grade_source(post)
        if int(grade["score"]) <= 0:
            continue
        if freshness_bucket(post, reference) < 2:
            continue
        theme = story_theme_for_post(post)
        tickers = tickers_for_post(post)
        if not theme and not tickers and grade["origin"] != "followed":
            continue
        key = theme or (tickers[0] if tickers else f"lane:{post.get('lane') or 'unmapped'}")
        clusters.setdefault(key, []).append((theme, post, grade))

    cards = [_build_card(key, members, reference) for key, members in clusters.items()]
    cards.sort(key=lambda card: card["_sort"], reverse=True)
    return [
        {key: value for key, value in card.items() if key != "_sort"}
        for card in cards[: max(0, limit)]
    ]


def _build_card(
    story_key: str,
    members: Sequence[tuple[str, Mapping[str, object], dict[str, object]]],
    reference: datetime | None,
) -> dict[str, object]:
    ranked = sorted(
        members,
        key=lambda member: (
            int(member[2]["score"]),
            source_reliability_score(member[1]),
            freshness_bucket(member[1], reference),
            signal_score(member[1]),
            post_timestamp(member[1]),
        ),
        reverse=True,
    )
    _lead_theme, lead_post, lead_grade = ranked[0]
    theme = next((member[0] for member in ranked if member[0]), "")
    if not theme:
        if story_key.startswith("lane:"):
            theme = f"Followed account tape ({story_key[len('lane:'):]})"
        else:
            theme = f"Ticker focus: {story_key}"

    detected_tickers = sorted({ticker for _, post, _ in ranked for ticker in tickers_for_post(post)})
    if detected_tickers:
        affected_tickers, ticker_basis = detected_tickers, "detected cashtags"
    else:
        affected_tickers, ticker_basis = list(THEME_BASKETS.get(theme, ())), "theme basket"

    source_type = "followed account" if lead_grade["origin"] == "followed" else "search/news"
    followed_handles = {
        str(post.get("handle"))
        for _, post, grade in ranked
        if grade["origin"] == "followed"
    }
    identities = {source_identity(post) for _, post, _ in ranked}
    claim = what_happened_for_post(lead_post)

    return {
        "theme": theme,
        "headline": truncate(claim, 140),
        "claim": claim,
        "expectation_delta": expectation_delta_for_post(lead_post),
        "impact": impact_for_post(lead_post, detected_tickers, source_type=source_type),
        "confidence": _confidence(ranked, followed_handles),
        "affected_tickers": affected_tickers,
        "ticker_basis": ticker_basis if affected_tickers else "",
        "next_check": action_for_post(lead_post, detected_tickers, source_type=source_type),
        "corroboration": len(identities),
        "newest_post_date": max((str(post.get("date") or "") for _, post, _ in ranked), default=""),
        "sources": [
            {
                "source": source_identity(post),
                "grade": str(grade["label"]),
                "date": str(post.get("date") or ""),
                "url": str(post.get("url") or ""),
            }
            for _, post, grade in ranked[:6]
        ],
        "_sort": (
            int(lead_grade["score"]),
            len(identities),
            max(freshness_bucket(post, reference) for _, post, _ in ranked),
            sum(signal_score(post) for _, post, _ in ranked),
            story_key,
        ),
    }


def _confidence(
    ranked: Sequence[tuple[str, Mapping[str, object], dict[str, object]]],
    followed_handles: set[str],
) -> str:
    has_wire = any(grade["origin"] == "news_wire" for _, _, grade in ranked)
    if any(bool(grade["cites_primary"]) for _, _, grade in ranked):
        return "medium-high - cites a primary/official source; verify the underlying document directly"
    if has_wire and followed_handles:
        return "medium-high - wire headline corroborated by followed account(s); verify the primary source before sizing"
    if len(followed_handles) >= 2:
        return "medium - corroborated by multiple followed accounts, not yet officially confirmed"
    if len(followed_handles) == 1:
        return "low-medium - single followed-account claim, unconfirmed"
    if has_wire:
        return "low-medium - wire headline only, no followed-account read yet"
    return "low - public search echoes only, treat as unconfirmed watch"
