import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.services.news_intelligence import build_news_intelligence_cards


def test_builds_memory_news_card_with_expert_reaction() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                    "sentiment_label": "positive",
                }
            ]
        }
    }
    x_posts = [
        {
            "handle": "mindmoon_108",
            "lane": "user_requested_memory",
            "reason": "Korean memory-chip engineer with supply/demand context",
            "url": "https://x.com/mindmoon_108/status/2",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM demand is still stronger than supply and DRAM allocation is tight.",
            "matched_keywords": ["HBM", "DRAM"],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )
    cards_later = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T03:00:00+00:00",
        max_cards=5,
    )

    assert len(cards) == 1
    card = cards[0]
    assert cards_later[0]["insight_id"] == card["insight_id"]
    assert card["source_type"] == "news_intelligence"
    assert card["source_claim"] == "Memory chip supply tightens as HBM demand rises"
    assert card["related_tickers"] == ["AVGO", "MRVL", "MU", "NVDA"]
    assert card["themes"] == ["hbm_supply_chain"]
    assert card["cross_reference_status"] == "expert_reaction_found"
    assert card["evidence"][0]["handle"] == "mindmoon_108"
    assert "Korean memory-chip engineer" in card["evidence"][0]["why_source_matters"]
    assert card["human_review"]["default_decision"] == "needs_more_source"


def test_skips_news_card_without_source_url() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": " ",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=[],
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards == []


def test_generalist_two_domain_terms_do_not_count_as_expert_reaction() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "HBM DRAM supply tightens",
                    "url": "https://example.com/hbm-dram-supply",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    x_posts = [
        {
            "handle": "generalist",
            "lane": "tech_general",
            "reason": "General tech commentator",
            "url": "https://x.com/generalist/status/6",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM and DRAM are trending.",
            "matched_keywords": ["HBM", "DRAM"],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []


def test_curated_search_reaction_counts_as_expert_evidence() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    search_posts = [
        {
            "source_query": "memory",
            "query": "(HBM OR DRAM) lang:en",
            "priority": "high",
            "source_trust": "curated_search",
            "url": "https://x.com/search/status/7",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM demand remains tight and DRAM allocation is constrained.",
            "matched_keywords": ["HBM", "DRAM"],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=[],
        search_posts=search_posts,
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "expert_reaction_found"
    assert cards[0]["evidence"][0]["handle"] == "memory"
    assert cards[0]["evidence"][0]["lane"] == "memory"


def test_low_priority_generic_search_does_not_count_as_expert_evidence() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    search_posts = [
        {
            "source_query": "generic",
            "query": "stocks lang:en",
            "priority": "low",
            "source_trust": "curated_search",
            "url": "https://x.com/search/status/8",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM demand and DRAM allocation are being discussed.",
            "matched_keywords": ["HBM", "DRAM"],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=[],
        search_posts=search_posts,
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []


def test_curated_search_trust_requires_exact_domain_token() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    search_posts = [
        {
            "source_query": "notmemory",
            "query": "stocks lang:en",
            "lane": "x_search:notmemory",
            "reason": "Configured X search query: notmemory",
            "priority": "high",
            "source_trust": "curated_search",
            "url": "https://x.com/search/status/9",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM demand remains tight and DRAM allocation is constrained.",
            "matched_keywords": ["HBM", "DRAM"],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=[],
        search_posts=search_posts,
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []


def test_generic_overlap_does_not_count_as_expert_reaction() -> None:
    news = {
        "MSFT": {
            "articles": [
                {
                    "title": "AI demand lifts market",
                    "url": "https://example.com/generic-ai-demand",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    x_posts = [
        {
            "handle": "generalist",
            "lane": "tech_general",
            "reason": "General tech commentator",
            "url": "https://x.com/generalist/status/1",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "Demand remains strong for software.",
            "matched_keywords": [],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []


def test_ticker_only_overlap_does_not_count_as_expert_reaction() -> None:
    news = {
        "NVDA": {
            "articles": [
                {
                    "title": "NVDA HBM supply concerns rise",
                    "url": "https://example.com/nvda-hbm-supply",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    x_posts = [
        {
            "handle": "generalist",
            "lane": "tech_general",
            "reason": "General tech commentator",
            "url": "https://x.com/generalist/status/2",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "NVDA chart looks extended here.",
            "matched_keywords": [],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []


def test_generic_two_word_overlap_does_not_count_as_expert_reaction() -> None:
    news = {
        "MSFT": {
            "articles": [
                {
                    "title": "Market demand concerns rise",
                    "url": "https://example.com/market-demand",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    x_posts = [
        {
            "handle": "generalist",
            "lane": "tech_general",
            "reason": "General tech commentator",
            "url": "https://x.com/generalist/status/3",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "Market demand concerns rise across software.",
            "matched_keywords": [],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []


def test_insight_id_ignores_source_name_when_url_is_present() -> None:
    news_wire = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    news_wire_service = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Wire Service",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }

    wire_cards = build_news_intelligence_cards(
        news=news_wire,
        account_posts=[],
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )
    wire_service_cards = build_news_intelligence_cards(
        news=news_wire_service,
        account_posts=[],
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert wire_service_cards[0]["insight_id"] == wire_cards[0]["insight_id"]


def test_builder_skips_malformed_posts_and_bad_scores() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    x_posts = [
        object(),
        {
            "handle": "mindmoon_108",
            "lane": "user_requested_memory",
            "reason": "Korean memory-chip engineer with supply/demand context",
            "url": "https://x.com/mindmoon_108/status/4",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM demand is still stronger than supply and DRAM allocation is tight.",
            "matched_keywords": ["HBM", "DRAM"],
            "signal_score": "high",
            "engagement": 10,
        },
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "expert_reaction_found"
    assert cards[0]["evidence"][0]["handle"] == "mindmoon_108"
    assert cards[0]["evidence"][0]["signal_score"] == 0


def test_single_domain_token_generalist_post_does_not_count_as_expert_reaction() -> None:
    news = {
        "MU": {
            "articles": [
                {
                    "title": "Memory chip supply tightens as HBM demand rises",
                    "url": "https://example.com/memory-hbm",
                    "source": "Example Wire",
                    "published_at": "2026-06-08T00:30:00+00:00",
                }
            ]
        }
    }
    x_posts = [
        {
            "handle": "generalist",
            "lane": "tech_general",
            "reason": "General tech commentator",
            "url": "https://x.com/generalist/status/5",
            "date": "2026-06-08T01:00:00+00:00",
            "text": "HBM is trending again.",
            "matched_keywords": [],
            "signal_score": 30,
            "engagement": 10,
        }
    ]

    cards = build_news_intelligence_cards(
        news=news,
        account_posts=x_posts,
        search_posts=[],
        generated_at="2026-06-08T02:00:00+00:00",
        max_cards=5,
    )

    assert cards[0]["cross_reference_status"] == "no_expert_reaction"
    assert cards[0]["evidence"] == []
