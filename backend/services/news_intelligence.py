from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping, Sequence


_THEME_KEYWORDS: dict[str, tuple[str, ...]] = {
    "hbm_supply_chain": ("HBM", "DRAM", "memory", "NAND", "wafer", "CoWoS"),
    "ai_infrastructure": ("GPU", "B200", "H100", "datacenter", "AI infrastructure"),
    "policy_geopolitics": ("tariff", "export control", "BIS", "China chips"),
}

_THEME_TICKERS: dict[str, tuple[str, ...]] = {
    "hbm_supply_chain": ("AVGO", "MRVL", "MU", "NVDA"),
    "ai_infrastructure": ("AMD", "AVGO", "NVDA", "TSM", "VRT"),
    "policy_geopolitics": (),
}


def build_news_intelligence_cards(
    *,
    news: Mapping[str, object],
    account_posts: Sequence[Mapping[str, object]],
    search_posts: Sequence[Mapping[str, object]],
    generated_at: str,
    max_cards: int,
) -> list[dict[str, object]]:
    cards: list[dict[str, object]] = []
    all_posts = [*account_posts, *search_posts]
    for ticker, payload in news.items():
        if not isinstance(payload, Mapping):
            continue
        articles = payload.get("articles")
        if not isinstance(articles, Sequence) or isinstance(articles, str):
            continue
        for article in articles:
            if not isinstance(article, Mapping):
                continue
            title = str(article.get("title") or "").strip()
            if not title:
                continue
            source_url = str(article.get("url") or "").strip()
            if not source_url:
                continue
            themes = _themes_for_text(title)
            related_tickers = _related_tickers(str(ticker).upper(), themes)
            evidence = _matched_evidence(title, all_posts, themes=themes)
            status = "expert_reaction_found" if evidence else "no_expert_reaction"
            cards.append(
                {
                    "insight_id": _insight_id(
                        title=title,
                        source_name=str(article.get("source") or "news"),
                        source_url=source_url,
                        seed_ticker=str(ticker).upper(),
                    ),
                    "source_type": "news_intelligence",
                    "source_claim": title,
                    "source_name": str(article.get("source") or "news"),
                    "source_url": source_url,
                    "source_published_at": str(article.get("published_at") or ""),
                    "related_tickers": related_tickers,
                    "themes": themes,
                    "cross_reference_status": status,
                    "evidence": evidence,
                    "score": _score_card(themes, evidence),
                    "human_review": {
                        "default_decision": "needs_more_source",
                        "prompt": "Promote, watch, reject, or request more source verification before technical filtering.",
                    },
                }
            )
    cards.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return cards[:max_cards]


def _themes_for_text(text: str) -> list[str]:
    matched: list[str] = []
    lowered = text.lower()
    for theme, keywords in _THEME_KEYWORDS.items():
        if any(keyword.lower() in lowered for keyword in keywords):
            matched.append(theme)
    return matched


def _related_tickers(seed_ticker: str, themes: Sequence[str]) -> list[str]:
    tickers = {seed_ticker} if seed_ticker else set()
    for theme in themes:
        tickers.update(_THEME_TICKERS.get(theme, ()))
    return sorted(ticker for ticker in tickers if ticker)


def _matched_evidence(
    title: str,
    posts: Sequence[object],
    *,
    themes: Sequence[str],
) -> list[dict[str, object]]:
    title_terms = _terms(title)
    domain_terms = _domain_terms(themes)
    evidence: list[dict[str, object]] = []
    for post in posts:
        if not isinstance(post, Mapping):
            continue
        text = str(post.get("text") or "")
        overlap = sorted(title_terms.intersection(_terms(text)))
        if not _is_material_overlap(overlap, domain_terms, post):
            continue
        handle = str(post.get("handle") or post.get("source_query") or "x_search")
        evidence.append(
            {
                "handle": handle,
                "lane": str(post.get("lane") or post.get("source_query") or ""),
                "why_source_matters": str(post.get("reason") or "Matched X reaction to the news terms."),
                "reaction_excerpt": text[:280],
                "url": str(post.get("url") or ""),
                "matched_terms": overlap,
                "signal_score": _safe_int(post.get("signal_score")),
            }
        )
    evidence.sort(key=lambda item: _safe_int(item.get("signal_score")), reverse=True)
    return evidence[:3]


def _terms(text: str) -> set[str]:
    raw_terms = {term.upper() for term in re.findall(r"[A-Za-z0-9$]{3,}", text)}
    generic = {"THE", "AND", "FOR", "WITH", "FROM", "LANG"}
    return raw_terms.difference(generic)


_DOMAIN_TERMS_BY_THEME = {
    "hbm_supply_chain": {"HBM", "DRAM", "NAND", "COWOS", "WAFER", "MEMORY"},
    "ai_infrastructure": {"GPU", "B200", "H100", "DATACENTER", "ACCELERATOR"},
    "policy_geopolitics": {"BIS", "TARIFF", "EXPORT", "CHINA"},
}
_TRUSTED_SEARCH_PRIORITIES = {"high", "highest"}
_TRUSTED_SEARCH_TERMS = ("memory", "hbm", "dram")


def _domain_terms(themes: Sequence[str]) -> set[str]:
    terms: set[str] = set()
    for theme in themes:
        terms.update(_DOMAIN_TERMS_BY_THEME.get(theme, set()))
    return terms


def _is_material_overlap(
    overlap: Sequence[str],
    domain_terms: set[str],
    post: Mapping[str, object],
) -> bool:
    overlap_terms = {term.upper() for term in overlap}
    domain_overlap = overlap_terms.intersection(domain_terms)
    if not _has_trusted_expert_signal(post):
        return False
    return bool(domain_overlap)


def _has_trusted_expert_signal(post: Mapping[str, object]) -> bool:
    lane = str(post.get("lane") or "").lower()
    reason = str(post.get("reason") or "").lower()
    if lane.startswith("x_search:") or str(post.get("source_trust") or "").lower() == "curated_search":
        return _is_trusted_curated_search(post)
    return lane.startswith("user_requested") or "memory" in lane or "memory" in reason


def _is_trusted_curated_search(post: Mapping[str, object]) -> bool:
    if str(post.get("source_trust") or "").lower() != "curated_search":
        return False
    if str(post.get("priority") or "").lower() not in _TRUSTED_SEARCH_PRIORITIES:
        return False

    source_text = " ".join(
        str(post.get(key) or "")
        for key in ("lane", "source_query", "query", "reason")
    )
    source_terms = {term.lower() for term in _terms(source_text)}
    return any(term in source_terms for term in _TRUSTED_SEARCH_TERMS)


def _safe_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _score_card(themes: Sequence[str], evidence: Sequence[Mapping[str, object]]) -> float:
    return min(100.0, 55.0 + len(themes) * 10.0 + len(evidence) * 12.5)


def _insight_id(*, title: str, source_name: str, source_url: str, seed_ticker: str) -> str:
    normalized_title = " ".join(title.lower().split())
    normalized_url = source_url.strip().lower()
    normalized_source = source_name.strip().lower()
    normalized_ticker = seed_ticker.strip().upper()
    source_key = normalized_url or normalized_source
    digest = hashlib.sha256(
        f"{source_key}|{normalized_ticker}|{normalized_title}".encode("utf-8")
    ).hexdigest()
    return f"news-intel-{digest[:12]}"
