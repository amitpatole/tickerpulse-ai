import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from io import StringIO
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from backend.services.x_watchlist import XAccount, XSearchQuery, XWatchlistConfig


class _FakeNewsLayerCollector:
    def __init__(self) -> None:
        self.config = XWatchlistConfig(
            accounts=(
                XAccount(handle="semisource", lane="ai_semis", priority="highest", reason="Semi source"),
                XAccount(handle="macro", lane="macro", priority="high", reason="Macro source"),
            ),
            search_queries=(
                XSearchQuery(
                    name="bernstein_ai_semis",
                    query="(Bernstein OR 伯恩斯坦) (AI OR semiconductor OR CPO OR 800V)",
                    priority="high",
                ),
                XSearchQuery(name="cpo_800v", query="(CPO OR 800VDC)", priority="high"),
            ),
            promote_keywords=("Bernstein", "CPO", "800V", "HBM"),
        )
        self.account_call: dict[str, int] | None = None
        self.search_call: dict[str, int] | None = None

    def collect_accounts(
        self, max_accounts: int, posts_per_account: int, topup_max_accounts: int = 12
    ) -> dict[str, object]:
        self.account_call = {
            "max_accounts": max_accounts,
            "posts_per_account": posts_per_account,
        }
        return {
            "source_status": "ok",
            "accounts_checked": max_accounts,
            "posts": [
                {
                    "handle": "semisource",
                    "lane": "ai_semis",
                    "date": "2026-06-09T12:00:00+00:00",
                    "text": "Bernstein says CPO timing matters for AI data centers and $NVDA supply chain",
                    "url": "https://x.com/semisource/status/1",
                    "matched_keywords": ["Bernstein", "CPO"],
                    "signal_score": 42,
                    "engagement": 100,
                },
                {
                    "handle": "macro",
                    "lane": "macro",
                    "date": "2025-01-01T12:00:00+00:00",
                    "text": "Old high scoring macro post about $OLD should not lead a morning briefing",
                    "url": "https://x.com/macro/status/old",
                    "matched_keywords": ["AI"],
                    "signal_score": 99,
                    "engagement": 1000,
                },
                {
                    "handle": "qinbafrank",
                    "lane": "china_ai_semis_interconnect",
                    "date": "2026-06-09T11:00:00+00:00",
                    "text": "SemiAnalysis says NVIDIA 800VDC and CPO mass adoption is pushed to 2028-2029, later than the 2027 ramp investors expected.",
                    "url": "https://x.com/qinbafrank/status/3",
                    "matched_keywords": ["AI", "CPO", "800VDC"],
                    "signal_score": 35,
                    "engagement": 80,
                }
            ],
            "errors": [],
        }

    def collect_searches(self, max_queries: int, posts_per_query: int) -> dict[str, object]:
        self.search_call = {
            "max_queries": max_queries,
            "posts_per_query": posts_per_query,
        }
        return {
            "source_status": "ok",
            "queries_checked": max_queries,
            "posts": [
                {
                    "source_query": "bernstein_ai_semis",
                    "lane": "x_search:bernstein_ai_semis",
                    "date": "2026-06-09T13:00:00+00:00",
                    "text": "Public summary says Bernstein AI semis report discusses 800VDC pushout for $NVDA",
                    "url": "https://x.com/example/status/2",
                    "matched_keywords": ["Bernstein", "800V"],
                    "signal_score": 39,
                    "engagement": 50,
                }
            ],
            "errors": [],
        }


class NewsLayerReviewTest(unittest.TestCase):
    def test_news_layer_review_collects_x_sources_and_omits_paywalled_bernstein_web(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        collector = _FakeNewsLayerCollector()

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmpdir),
                posts_per_account=2,
                posts_per_query=3,
            )

            raw = json.loads(Path(result["paths"]["raw_json"]).read_text(encoding="utf-8"))
            summary = json.loads(Path(result["paths"]["summary_json"]).read_text(encoding="utf-8"))
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertEqual(collector.account_call, {"max_accounts": 2, "posts_per_account": 2})
        self.assertEqual(collector.search_call, {"max_queries": 2, "posts_per_query": 3})
        self.assertEqual(result["source_status"], "ok")
        self.assertEqual(result["bernstein_monitor"]["public_echo_posts"], 1)
        self.assertNotIn("official_web_checks", result)
        self.assertNotIn("official_web_checks", raw)
        self.assertNotIn("official_web_checks", summary)
        self.assertNotIn("bernsteinresearch.com", report)
        self.assertNotIn("bernstein.com/our-insights", report)
        self.assertIn("Executive Summary", report)
        self.assertIn("Bernstein Monitor", report)
        self.assertEqual(raw["searches"]["queries_checked"], 2)

    def test_news_layer_report_includes_vol_structure_monitor_section(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        collector = _FakeNewsLayerCollector()
        fake_monitor = {
            "status": "ok",
            "generated_at": "2026-06-11T00:00:00+00:00",
            "indices": {
                "COR1M": {"close": 6.33, "close_date": "2026-06-11", "change_1d": -0.4,
                          "pctile_1y": 1.0, "pctile_full": 0.4, "live": 6.4, "live_time": ""},
                "VIXEQ": {"close": 28.5, "close_date": "2026-06-11", "change_1d": 0.3,
                          "pctile_1y": 88.0, "pctile_full": 80.0, "live": None, "live_time": ""},
                "VIX": {"close": 12.1, "close_date": "2026-06-11", "change_1d": 0.1,
                        "pctile_1y": 30.0, "pctile_full": 25.0, "live": None, "live_time": ""},
            },
            "derived": {"vixeq_vix_spread": 16.4, "vixeq_vix_ratio": 2.36, "ratio_pctile_1y": 99.0,
                        "cor1m_change_1d_pts": -0.4, "cor1m_change_1d_pct": -5.9,
                        "cor1m_change_5d_pts": -1.2},
            "signals": [
                {"name": "dispersion_crowding", "level": "alert",
                 "detail": "COR1M 6.33 at/near historic floor: leverage stacked on independent single-stock bets."},
            ],
            "overall_level": "alert",
            "headline": "ALERT: COR1M 6.33; VIXEQ 28.5; VIX 12.1 - dispersion_crowding=alert",
            "interpretation": ["COR1M 6.33 at/near historic floor: leverage stacked on independent single-stock bets."],
            "thresholds": {},
            "errors": [],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmpdir),
                vol_monitor=lambda: fake_monitor,
            )

            summary = json.loads(Path(result["paths"]["summary_json"]).read_text(encoding="utf-8"))
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertIn("## Leverage & Correlation Monitor", report)
        self.assertIn("COR1M 6.33", report)
        self.assertIn("dispersion_crowding", report)
        self.assertIn("[alert]", report)
        self.assertLess(
            report.index("## Top News And Tickers"),
            report.index("## Leverage & Correlation Monitor"),
        )
        self.assertLess(
            report.index("## Leverage & Correlation Monitor"),
            report.index("## Executive Summary"),
        )
        self.assertEqual(summary["vol_structure_monitor"]["overall_level"], "alert")
        self.assertEqual(result["vol_structure_monitor"]["status"], "ok")

    def test_injected_collector_skips_vol_monitor_but_reports_it(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=_FakeNewsLayerCollector(),
                output_dir=Path(tmpdir),
            )
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertEqual(result["vol_structure_monitor"]["status"], "skipped_injected_collector")
        self.assertIn("## Leverage & Correlation Monitor", report)
        self.assertIn("skipped_injected_collector", report)

    def test_news_layer_report_includes_dealer_gamma_monitor_section(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        collector = _FakeNewsLayerCollector()
        fake_gamma = {
            "status": "ok",
            "generated_at": "2026-06-11T00:00:00+00:00",
            "underlyings": {
                "SPX": {"spot": 7394.3, "flip_level": 7495.0, "distance_to_flip_pct": -1.34,
                        "regime": "negative", "net_gex_usd_per_pct": -1.2e9,
                        "net_gex_bn_per_pct": -1.2, "contracts_used": 14000,
                        "contracts_skipped": 17000},
                "SMH": {"spot": 613.1, "flip_level": 600.0, "distance_to_flip_pct": 2.18,
                        "regime": "positive", "net_gex_usd_per_pct": 3.1e8,
                        "net_gex_bn_per_pct": 0.31, "contracts_used": 3000,
                        "contracts_skipped": 3300},
            },
            "signals": [
                {"name": "negative_gamma", "level": "alert",
                 "detail": "SPX spot 7394.3 below zero-gamma flip 7495.0: dealers short gamma."},
            ],
            "overall_level": "alert",
            "headline": "ALERT: SPX 7394.3 vs flip 7495.0 (negative gamma) - negative_gamma=alert",
            "interpretation": ["SPX below flip."],
            "thresholds": {"flip_proximity_watch_pct": 1.0},
            "method": "naive dealer GEX",
            "errors": [],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmpdir),
                gamma_monitor=lambda: fake_gamma,
            )

            summary = json.loads(Path(result["paths"]["summary_json"]).read_text(encoding="utf-8"))
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertIn("## Dealer Gamma Monitor", report)
        self.assertIn("flip 7495.0", report)
        self.assertIn("negative_gamma", report)
        self.assertLess(
            report.index("## Leverage & Correlation Monitor"),
            report.index("## Dealer Gamma Monitor"),
        )
        self.assertLess(
            report.index("## Dealer Gamma Monitor"),
            report.index("## Executive Summary"),
        )
        self.assertEqual(summary["gamma_exposure_monitor"]["overall_level"], "alert")
        self.assertEqual(result["gamma_exposure_monitor"]["status"], "ok")

    def test_injected_collector_skips_gamma_monitor_but_reports_it(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=_FakeNewsLayerCollector(),
                output_dir=Path(tmpdir),
            )
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertEqual(result["gamma_exposure_monitor"]["status"], "skipped_injected_collector")
        self.assertIn("## Dealer Gamma Monitor", report)

    def test_news_layer_report_ranks_followed_accounts_and_separates_news_and_tickers(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        collector = _FakeNewsLayerCollector()

        with tempfile.TemporaryDirectory() as tmpdir:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmpdir),
                posts_per_account=2,
                posts_per_query=3,
            )

            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertLess(
            report.index("## Ranked Twitter Following"),
            report.index("## Top News And Tickers"),
        )
        self.assertLess(
            report.index("## Ranked Twitter Following"),
            report.index("## Executive Summary"),
        )
        self.assertLess(
            report.index("## Ranked Twitter Following"),
            report.index("### Top Topics"),
        )
        ranked_section = report[
            report.index("## Ranked Twitter Following"):report.index("## Top News And Tickers")
        ]
        news_section = report[
            report.index("## Top News And Tickers"):report.index("## Executive Summary")
        ]
        self.assertIn("1. semisource [ai_semis]", report)
        self.assertNotIn("Old high scoring macro", ranked_section)
        self.assertNotIn("$OLD", news_section)
        self.assertIn("What happened:", report)
        self.assertIn("Expectation delta:", report)
        self.assertIn("Impact:", report)
        self.assertIn("Slower/later than expected", report)
        self.assertIn("2027 ramp investors expected", report)
        self.assertRegex(report, r"What to do: .+ because .+")
        self.assertNotIn("exposed basket", report)
        self.assertIn("Top tickers: $NVDA", report)

    def test_news_layer_review_includes_top_level_watchlist_events(self) -> None:
        from backend.services.news_layer_review import run_news_layer_review

        collector = _FakeNewsLayerCollector()
        event = {
            "source": "watchlist_event",
            "score": 65,
            "title": "CBRS: Cerebras lock-up no-new-low check (2026-09-02)",
            "url": "https://www.sec.gov/Archives/edgar/data/2021728/000162828026035214/cerebras-424b4.htm",
            "metadata": {
                "ticker": "CBRS",
                "event_date": "2026-09-02",
                "days_until_event": 85,
                "process": ["Watch whether the unlock fails to create a new low."],
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch(
                "backend.services.watchlist_notes.build_watchlist_event_insights",
                return_value=[event],
            ) as event_loader:
                result = run_news_layer_review(
                    x_collector=collector,
                    output_dir=Path(tmpdir),
                    posts_per_account=1,
                    posts_per_query=1,
                )

            raw = json.loads(Path(result["paths"]["raw_json"]).read_text(encoding="utf-8"))
            summary = json.loads(Path(result["paths"]["summary_json"]).read_text(encoding="utf-8"))
            report = Path(result["paths"]["report_markdown"]).read_text(encoding="utf-8")

        self.assertEqual(result.get("watchlist_events"), [event])
        event_loader.assert_called_once_with(lookahead_days=180)
        self.assertEqual(raw["watchlist_events"], [event])
        self.assertEqual(summary["watchlist_events"], [event])
        self.assertIn("Watchlist Catalyst Events", report)
        self.assertIn("CBRS: Cerebras lock-up no-new-low check", report)

    def test_news_layer_cli_prints_markdown_report(self) -> None:
        import backend.scripts.run_news_layer_review as cli

        with tempfile.TemporaryDirectory() as tmpdir:
            buf = StringIO()
            with (
                patch(
                    "backend.scripts.run_news_layer_review.run_news_layer_review",
                    return_value={
                        "report_markdown": "# TickerPulse News Layer Review\n\n## Executive Summary\n- ok\n",
                        "paths": {"report_markdown": str(Path(tmpdir) / "daily_news_layer_report.md")},
                    },
                ),
                redirect_stdout(buf),
            ):
                exit_code = cli.main(["--output-dir", tmpdir, "--posts-per-account", "1", "--posts-per-query", "1"])

        self.assertEqual(exit_code, 0)
        self.assertIn("Executive Summary", buf.getvalue())
        self.assertIn("Report saved:", buf.getvalue())

    def test_news_layer_cli_handles_unicode_posts_on_narrow_windows_stdout(self) -> None:
        import backend.scripts.run_news_layer_review as cli

        class NarrowStdout:
            def __init__(self) -> None:
                self.buffer = BytesIO()

            def write(self, text: str) -> int:
                text.encode("gbk")
                return len(text)

            def flush(self) -> None:
                return None

        with tempfile.TemporaryDirectory() as tmpdir:
            fake_stdout = NarrowStdout()
            with (
                patch(
                    "backend.scripts.run_news_layer_review.run_news_layer_review",
                    return_value={
                        "report_markdown": "# TickerPulse News Layer Review\n\n## Executive Summary\n- 💥 unicode post\n",
                        "paths": {"report_markdown": str(Path(tmpdir) / "daily_news_layer_report.md")},
                    },
                ),
                patch("backend.scripts.run_news_layer_review.sys.stdout", fake_stdout),
            ):
                exit_code = cli.main(["--output-dir", tmpdir])

        self.assertEqual(exit_code, 0)
        self.assertIn("Executive Summary".encode("utf-8"), fake_stdout.buffer.getvalue())

    def test_news_layer_report_summarizes_source_errors_without_traceback_body(self) -> None:
        from backend.services.news_layer_review import format_news_layer_report

        report = format_news_layer_report(
            {
                "generated_at": "2026-06-09T00:00:00+00:00",
                "source_status": "degraded",
                "executive_summary": {"bullets": ["reviewed"], "top_topics": []},
                "bernstein_monitor": {"public_echo_posts": 0},
                "accounts": {
                    "source_status": "degraded",
                    "accounts_checked": 1,
                    "posts": [],
                    "errors": [
                        {
                            "handle": "IanCutress",
                            "message": "Traceback line 1\nTraceback line 2\nNoAccountError: No account available",
                        }
                    ],
                },
                "searches": {"source_status": "ok", "queries_checked": 0, "posts": [], "errors": []},
            }
        )

        self.assertIn("IanCutress: NoAccountError: No account available", report)
        self.assertNotIn("Traceback line 1", report)

    def test_news_layer_top_tickers_prefers_configured_watchlist_symbols(self) -> None:
        from backend.services.news_layer_review import format_news_layer_report

        report = format_news_layer_report(
            {
                "generated_at": "2026-06-10T12:00:00+00:00",
                "source_status": "ok",
                "executive_summary": {"bullets": ["reviewed"], "top_topics": []},
                "bernstein_monitor": {"public_echo_posts": 0},
                "accounts": {"source_status": "ok", "accounts_checked": 0, "posts": [], "errors": []},
                "searches": {
                    "source_status": "ok",
                    "queries_checked": 1,
                    "posts": [
                        {
                            "source_query": "ticker_cashtags_core",
                            "lane": "x_search:ticker_cashtags_core",
                            "date": "2026-06-10T11:00:00+00:00",
                            "text": "$FARTCO spam $NVDA semis note",
                            "url": "https://x.com/example/status/1",
                            "matched_keywords": [],
                            "signal_score": 20,
                        },
                        {
                            "source_query": "ticker_cashtags_core",
                            "lane": "x_search:ticker_cashtags_core",
                            "date": "2026-06-10T11:05:00+00:00",
                            "text": "$FARTCO spam repeat",
                            "url": "https://x.com/example/status/2",
                            "matched_keywords": [],
                            "signal_score": 19,
                        },
                    ],
                    "errors": [],
                },
            }
        )

        news_section = report[
            report.index("## Top News And Tickers"):report.index("## Executive Summary")
        ]
        self.assertIn("Top tickers: $NVDA", news_section)
        self.assertNotIn("$FARTCO", news_section.splitlines()[1])

    def test_news_layer_report_uses_source_reliability_when_ranking_followed_accounts(self) -> None:
        from backend.services.news_layer_review import format_news_layer_report

        report = format_news_layer_report(
            {
                "generated_at": "2026-06-10T12:00:00+00:00",
                "source_status": "ok",
                "executive_summary": {"bullets": ["reviewed"], "top_topics": []},
                "bernstein_monitor": {"public_echo_posts": 0},
                "accounts": {
                    "source_status": "ok",
                    "accounts_checked": 2,
                    "posts": [
                        {
                            "handle": "headline",
                            "lane": "fast_headlines",
                            "date": "2026-06-10T11:00:00+00:00",
                            "text": "Fresh high-score generic post about $CRDO earnings",
                            "url": "https://x.com/headline/status/1",
                            "matched_keywords": ["earnings"],
                            "signal_score": 60,
                            "source_reliability_score": 1.0,
                            "source_reliability_started_at": "2026-06-10",
                            "source_reliability_basis": "Generic headline source.",
                        },
                        {
                            "handle": "citrini",
                            "lane": "ai_infrastructure_research",
                            "date": "2026-06-10T10:00:00+00:00",
                            "text": "Fresh lower-score CRDO post from a proven AI-infra source",
                            "url": "https://x.com/citrini/status/1",
                            "matched_keywords": [],
                            "signal_score": 20,
                            "source_reliability_score": 9.0,
                            "source_reliability_started_at": "2026-06-10",
                            "source_reliability_basis": "CRDO follow-list study top source.",
                        },
                    ],
                    "errors": [],
                },
                "searches": {"source_status": "ok", "queries_checked": 0, "posts": [], "errors": []},
            }
        )

        ranked_section = report[
            report.index("## Ranked Twitter Following"):report.index("## Top News And Tickers")
        ]
        self.assertIn("1. citrini", ranked_section)
        self.assertIn("2. headline", ranked_section)
        self.assertLess(ranked_section.index("1. citrini"), ranked_section.index("2. headline"))
        self.assertIn("Reliability: 9.0 since 2026-06-10", ranked_section)
        self.assertIn("CRDO follow-list study top source", ranked_section)


class _JuneTenthShapedCollector:
    """Fake collector shaped like the 2026-06-10 live run that produced the bland report.

    Contains: duplicate CPO/800VDC delay posts across two followed accounts and a
    Bernstein search echo, a stale high-engagement Bernstein crypto echo, a
    promotional search hit, an uncited bearish search hit, and a single-source
    crypto-liquidity post from a followed account.
    """

    def __init__(self) -> None:
        self.config = XWatchlistConfig(
            accounts=(
                XAccount(
                    handle="qinbafrank",
                    lane="china_ai_semis_interconnect",
                    priority="high",
                    reason="China AI/semi interconnect relay",
                ),
                XAccount(handle="jukan05", lane="ai_hardware_semis", priority="highest", reason="Hardware semis"),
                XAccount(handle="ShanghaoJin", lane="asia_macro_crypto_ai", priority="highest", reason="Asia macro"),
            ),
            search_queries=(
                XSearchQuery(name="bernstein_ai_semis", query="(Bernstein)", priority="high"),
                XSearchQuery(name="cpo_sic_pullback", query="(CPO)", priority="high"),
            ),
            promote_keywords=("CPO", "800V", "HBM"),
        )

    def collect_accounts(
        self, max_accounts: int, posts_per_account: int, topup_max_accounts: int = 12
    ) -> dict[str, object]:
        return {
            "source_status": "ok",
            "accounts_checked": max_accounts,
            "posts": [
                {
                    "handle": "qinbafrank",
                    "lane": "china_ai_semis_interconnect",
                    "date": "2026-06-10T02:00:00+00:00",
                    "text": (
                        "SemiAnalysis note says NVIDIA 800VDC and CPO mass adoption is "
                        "pushed to 2028-2029, later than the 2027 ramp."
                    ),
                    "url": "https://x.com/qinbafrank/status/11",
                    "matched_keywords": ["CPO", "800V"],
                    "signal_score": 40,
                    "engagement": 200,
                    "source_reliability_score": 7.0,
                    "source_reliability_started_at": "2026-06-10",
                    "source_reliability_basis": "Surfaced Bernstein CPO/LPO timing before the SemiAnalysis tape.",
                },
                {
                    "handle": "jukan05",
                    "lane": "ai_hardware_semis",
                    "date": "2026-06-10T01:00:00+00:00",
                    "text": "Hearing the same: 800VDC/CPO ramp slips to 2028, $CRDO $AAOI optics timeline at risk.",
                    "url": "https://x.com/jukan05/status/12",
                    "matched_keywords": ["CPO", "800V"],
                    "signal_score": 38,
                    "engagement": 150,
                },
                {
                    "handle": "ShanghaoJin",
                    "lane": "asia_macro_crypto_ai",
                    "date": "2026-06-10T00:30:00+00:00",
                    "text": "BTC ETF outflows accelerating, liquidity stress building into the weekend.",
                    "url": "https://x.com/ShanghaoJin/status/13",
                    "matched_keywords": [],
                    "signal_score": 20,
                    "engagement": 90,
                },
            ],
            "errors": [],
        }

    def collect_searches(self, max_queries: int, posts_per_query: int) -> dict[str, object]:
        return {
            "source_status": "ok",
            "queries_checked": max_queries,
            "posts": [
                {
                    "source_query": "bernstein_ai_semis",
                    "lane": "x_search:bernstein_ai_semis",
                    "date": "2026-05-01T09:00:00+00:00",
                    "text": "Bernstein crypto note: BTC ETF inflows are the story of the year, buy everything.",
                    "url": "https://x.com/randomcrypto/status/21",
                    "matched_keywords": [],
                    "signal_score": 55,
                    "engagement": 900,
                },
                {
                    "source_query": "bernstein_ai_semis",
                    "lane": "x_search:bernstein_ai_semis",
                    "date": "2026-06-10T03:00:00+00:00",
                    "text": (
                        "Public summary of Bernstein AI semis report: 800VDC and CPO pushout "
                        "to 2028 flagged for data center optics."
                    ),
                    "url": "https://x.com/echoacct/status/22",
                    "matched_keywords": ["CPO", "800V"],
                    "signal_score": 35,
                    "engagement": 60,
                },
                {
                    "source_query": "cpo_sic_pullback",
                    "lane": "x_search:cpo_sic_pullback",
                    "date": "2026-06-10T04:00:00+00:00",
                    "text": "Join my telegram signal group for $NVDA $AAOI pumps, giveaway inside!",
                    "url": "https://x.com/spam/status/23",
                    "matched_keywords": [],
                    "signal_score": 30,
                    "engagement": 500,
                },
                {
                    "source_query": "cpo_sic_pullback",
                    "lane": "x_search:cpo_sic_pullback",
                    "date": "2026-06-10T04:30:00+00:00",
                    "text": "CPO stocks dead. $AAOI cooked.",
                    "url": "https://x.com/doomer/status/24",
                    "matched_keywords": [],
                    "signal_score": 18,
                    "engagement": 40,
                },
            ],
            "errors": [],
        }


class NewsStoryCardReportTest(unittest.TestCase):
    GENERATED_AT = datetime(2026, 6, 10, 6, 0, tzinfo=timezone.utc)

    def _run_review(self) -> dict[str, object]:
        from backend.services.news_layer_review import run_news_layer_review

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch(
                "backend.services.watchlist_notes.build_watchlist_event_insights",
                return_value=[],
            ):
                result = run_news_layer_review(
                    x_collector=_JuneTenthShapedCollector(),
                    output_dir=Path(tmpdir),
                    posts_per_account=5,
                    posts_per_query=10,
                    generated_at=self.GENERATED_AT,
                )
            result["_summary_json"] = json.loads(
                Path(result["paths"]["summary_json"]).read_text(encoding="utf-8")
            )
        return result

    @staticmethod
    def _exec_section(report: str) -> str:
        return report[report.index("## Executive Summary"):report.index("## Bernstein Monitor")]

    def test_executive_summary_leads_with_story_cards_not_counts(self) -> None:
        result = self._run_review()
        report = str(result["report_markdown"])
        exec_section = self._exec_section(report)

        self.assertNotIn("Reviewed ", exec_section)
        self.assertNotRegex(exec_section, r"\d+ public echo posts found")
        self.assertNotIn("watchlist catalyst events:", exec_section)

        content_lines = [line for line in exec_section.splitlines() if line.strip()]
        self.assertTrue(
            content_lines[1].startswith("1. "),
            f"expected first story card after heading, got: {content_lines[1]!r}",
        )
        self.assertTrue("CPO" in content_lines[1] or "800VDC" in content_lines[1])

        for field in (
            "What happened:",
            "Expectation delta:",
            "Impact:",
            "Affected tickers:",
            "Confidence:",
            "Next check:",
        ):
            self.assertIn(field, exec_section)
        self.assertRegex(exec_section, r"Next check: .+ because .+")
        self.assertIn("Slower/later than expected", exec_section)

    def test_duplicate_cpo_posts_cluster_into_single_story(self) -> None:
        result = self._run_review()
        exec_section = self._exec_section(str(result["report_markdown"]))

        cpo_claim_lines = [
            line
            for line in exec_section.splitlines()
            if line.strip().startswith("What happened:") and ("800VDC" in line or "CPO" in line)
        ]
        self.assertEqual(
            len(cpo_claim_lines),
            1,
            f"CPO/800VDC must be one synthesized story, got {len(cpo_claim_lines)} claim lines",
        )

        source_lines = [
            line for line in exec_section.splitlines() if line.strip().startswith("Sources:")
        ]
        cpo_sources = [line for line in source_lines if "qinbafrank" in line]
        self.assertEqual(len(cpo_sources), 1)
        self.assertIn("jukan05", cpo_sources[0])
        self.assertIn("bernstein_ai_semis", cpo_sources[0])

    def test_source_grading_downgrades_promo_and_uncited_search_hits(self) -> None:
        result = self._run_review()
        exec_section = self._exec_section(str(result["report_markdown"]))
        self.assertNotIn("telegram signal group", exec_section)

        summary = result["_summary_json"]
        stories = summary["executive_summary"]["top_stories"]
        self.assertGreaterEqual(len(stories), 2)

        all_source_urls = [
            str(source.get("url"))
            for story in stories
            for source in story["sources"]
        ]
        self.assertNotIn("https://x.com/spam/status/23", all_source_urls)

        top_story = stories[0]
        self.assertEqual(top_story["sources"][0]["source"], "qinbafrank")
        uncited = [
            source
            for story in stories
            for source in story["sources"]
            if str(source.get("url")) == "https://x.com/doomer/status/24"
        ]
        self.assertTrue(uncited, "uncited search hit should stay visible inside the story sources")
        self.assertIn("downgraded", uncited[0]["grade"])

    def test_story_cards_expose_structured_decision_fields(self) -> None:
        result = self._run_review()
        stories = result["_summary_json"]["executive_summary"]["top_stories"]

        top_story = stories[0]
        for key in (
            "theme",
            "claim",
            "expectation_delta",
            "impact",
            "confidence",
            "affected_tickers",
            "next_check",
            "sources",
        ):
            self.assertIn(key, top_story)
        self.assertIn("$CRDO", top_story["affected_tickers"])
        self.assertIn("corroborated", top_story["confidence"])
        self.assertIn("because", top_story["next_check"])

        crypto_stories = [story for story in stories if "Crypto" in str(story["theme"])]
        self.assertTrue(crypto_stories)
        self.assertEqual(
            crypto_stories[0]["affected_tickers"],
            ["$COIN", "$MSTR"],
            "theme basket must backfill tickers when no cashtags are detected",
        )
        self.assertEqual(crypto_stories[0]["ticker_basis"], "theme basket")

    def test_bernstein_monitor_suppresses_stale_crypto_echo_and_labels_echoes(self) -> None:
        result = self._run_review()
        monitor = result["bernstein_monitor"]
        top_echoes = monitor["top_public_echoes"]

        self.assertTrue(top_echoes)
        self.assertIn("800VDC", top_echoes[0]["text"])
        self.assertEqual(top_echoes[0]["source_label"], "public summary of Bernstein")
        for echo in top_echoes:
            self.assertNotIn("BTC ETF inflows", echo["text"])
            self.assertIn(echo["source_label"], {"public summary of Bernstein", "unconfirmed echo"})
        self.assertEqual(monitor["suppressed_from_lead"], 1)
        self.assertEqual(monitor["public_echo_posts"], 2)

        report = str(result["report_markdown"])
        bernstein_section = report[
            report.index("## Bernstein Monitor"):report.index("## Watchlist Catalyst Events")
        ]
        self.assertIn("Echo [public summary of Bernstein]:", bernstein_section)
        self.assertNotIn("buy everything", bernstein_section)

    def test_injected_collector_skips_session_guard_but_reports_it(self) -> None:
        result = self._run_review()
        report = str(result["report_markdown"])

        guard = result["session_guard"]
        self.assertEqual(guard["status"], "skipped_injected_collector")
        health_section = report[report.index("## Source Health"):]
        self.assertIn("X session guard: skipped_injected_collector", health_section)

    def test_raw_tape_stays_visible_below_story_summary(self) -> None:
        result = self._run_review()
        report = str(result["report_markdown"])

        self.assertLess(report.index("## Executive Summary"), report.index("## Fast X Tape"))
        self.assertLess(report.index("## Executive Summary"), report.index("## X Search Tape"))
        search_tape = report[report.index("## X Search Tape"):report.index("## Source Health")]
        self.assertIn("telegram signal group", search_tape)


class _DeadXCollector(_FakeNewsLayerCollector):
    def collect_accounts(
        self, max_accounts: int, posts_per_account: int, topup_max_accounts: int = 12
    ) -> dict[str, object]:
        return {"source_status": "error", "accounts_checked": max_accounts, "posts": [], "errors": [{"handle": "all", "message": "NoAccountError"}]}

    def collect_searches(self, max_queries: int, posts_per_query: int) -> dict[str, object]:
        return {"source_status": "error", "queries_checked": max_queries, "posts": [], "errors": [{"query": "all", "message": "NoAccountError"}]}


def _fake_news_payload():
    return {
        "source_status": "ok",
        "tickers_checked": 1,
        "articles_collected": 1,
        "posts": [
            {
                "handle": "news:Benzinga",
                "lane": "news_wire",
                "source_type": "news_wire",
                "title": "CPO rollout delayed by vendors",
                "date": "2026-06-11T13:00:00+00:00",
                "text": "CPO rollout delayed by vendors. Slower 800VDC and CPO timing flagged.",
                "url": "https://example.com/cpo",
                "ticker_seeds": ["NVDA"],
                "sentiment_score": -0.2,
                "sentiment_label": "negative",
            }
        ],
        "errors": [],
    }


def _fake_tape_payload():
    return {
        "source_status": "ok",
        "generated_at": "2026-06-12T00:00:00+00:00",
        "as_of": "2026-06-11",
        "rows": [
            {"symbol": "SPY", "label": "S&P 500 (SPY)", "last": 725.43, "chg_1d_pct": -1.2, "chg_5d_pct": -3.8, "as_of": "2026-06-11"},
            {"symbol": "^VIX", "label": "VIX", "last": 22.2, "chg_1d_pct": 5.0, "chg_5d_pct": 38.0, "as_of": "2026-06-11"},
        ],
        "errors": [],
    }


def _fake_ai_infra_payload():
    return {
        "source_status": "ok",
        "report_dir": "D:/fake",
        "report_path": "D:/fake/daily-report.md",
        "report_timestamp_utc": "2026-06-09T21:15:17+00:00",
        "summary": [],
        "items": [
            {
                "source": "ai_infra_update",
                "score": 78.5,
                "title": "AI infra update: B200 rental median $4.58, 7D -28.5%, 30D -26.6%, offers 43",
                "url": "file:///D:/fake/daily-report.md",
                "metadata": {
                    "gpu": "B200",
                    "median_usd_per_gpu_hr": 4.58,
                    "offers": 43,
                    "price_change_7d_pct": -28.5,
                    "price_change_30d_pct": -26.6,
                    "price_read_7d": "Looser",
                    "price_read_30d": "Looser",
                },
            }
        ],
        "errors": [],
    }


class MorningDigestLanesTest(unittest.TestCase):
    def _run(self, collector, **kwargs):
        from backend.services.news_layer_review import run_news_layer_review

        with tempfile.TemporaryDirectory() as tmp:
            result = run_news_layer_review(
                x_collector=collector,
                output_dir=Path(tmp),
                generated_at=datetime(2026, 6, 12, 0, 0, tzinfo=timezone.utc),
                **kwargs,
            )
            summary_text = (Path(tmp) / "tickerpulse_news_layer_summary.json").read_text(encoding="utf-8")
        return result, json.loads(summary_text)

    def test_new_lanes_skipped_with_injected_collector_and_no_callables(self):
        result, summary = self._run(_FakeNewsLayerCollector())
        self.assertEqual(result["news_wire"]["source_status"], "skipped_injected_collector")
        self.assertEqual(result["market_tape"]["source_status"], "skipped_injected_collector")
        self.assertEqual(result["ai_infra_update"]["source_status"], "skipped_injected_collector")
        self.assertEqual(summary["schema_version"], 2)

    def test_news_post_fuses_into_story_and_sections_print(self):
        result, summary = self._run(
            _FakeNewsLayerCollector(),
            news_collector=_fake_news_payload,
            tape_snapshot=_fake_tape_payload,
            ai_infra=_fake_ai_infra_payload,
        )
        report = str(result["report_markdown"])
        self.assertIn("## Market Tape", report)
        self.assertIn("S&P 500 (SPY): 725.43 | 1d -1.20% | 5d -3.80%", report)
        self.assertIn("## News Wire Tape", report)
        self.assertIn("STALE", report)  # 2026-06-09 report vs 2026-06-12 now
        self.assertIn("- News wire: ok; tickers 1, articles 1", report)
        cards = summary["executive_summary"]["top_stories"]
        merged = [card for card in cards if any(s["grade"] == "news wire headline" for s in card["sources"])]
        self.assertTrue(merged)
        self.assertTrue(any(str(s["grade"]).startswith("followed account") for s in merged[0]["sources"]))
        self.assertIn("$NVDA", summary["top_news_and_tickers"]["top_tickers"])
        self.assertEqual(summary["market_tape"]["rows"][0]["symbol"], "SPY")
        self.assertTrue(summary["ai_infra_update"]["staleness"]["stale"])
        self.assertEqual(len(summary["news_wire"]["posts"]), 1)

    def test_x_dead_news_alive_is_degraded_with_outage_copy(self):
        result, summary = self._run(
            _DeadXCollector(),
            news_collector=_fake_news_payload,
            tape_snapshot=_fake_tape_payload,
            ai_infra=_fake_ai_infra_payload,
        )
        self.assertEqual(result["source_status"], "degraded")
        bullets = summary["executive_summary"]["bullets"]
        self.assertTrue(any("X lanes returned 0 posts" in bullet for bullet in bullets))
        self.assertFalse(any("survived quality gating" in bullet for bullet in bullets))

    def test_everything_dead_is_error_with_outage_not_gating_copy(self):
        dead_news = lambda: {"source_status": "error", "tickers_checked": 0, "articles_collected": 0, "posts": [], "errors": [{"source": "rss", "message": "down"}]}
        result, summary = self._run(
            _DeadXCollector(),
            news_collector=dead_news,
            tape_snapshot=_fake_tape_payload,
            ai_infra=_fake_ai_infra_payload,
        )
        self.assertEqual(result["source_status"], "error")
        bullets = summary["executive_summary"]["bullets"]
        self.assertTrue(any("collection outage, not quality gating" in bullet for bullet in bullets))


if __name__ == "__main__":
    unittest.main()
