import json
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch


class DailyIdeaSweepTest(unittest.TestCase):
    def test_idea_feed_writes_latest_and_timestamped_snapshot(self) -> None:
        from backend.services.idea_feed import build_idea_feed, write_idea_feed

        sweep = {
            "generated_at": "2026-06-05T12:00:00+00:00",
            "source_status": "ok",
            "inputs": {"tickers": ["NVDA", "AVGO"]},
            "insights": [
                {
                    "source": "x",
                    "score": 95,
                    "title": "@zephyr_z9: HBM shortage matters",
                    "url": "https://x.com/zephyr_z9/status/1",
                    "metadata": {"matched_keywords": ["HBM", "shortage"], "lane": "ai_semis"},
                },
                {
                    "source": "scanner",
                    "score": 82,
                    "title": "NVDA technical score 82.0",
                    "metadata": {"ticker": "NVDA", "overall_signal": "bullish"},
                },
            ],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            feed = build_idea_feed(sweep)
            paths = write_idea_feed(feed, Path(tmpdir))
            latest = json.loads(paths["latest"].read_text(encoding="utf-8"))

        self.assertEqual(latest["generated_at"], "2026-06-05T12:00:00+00:00")
        self.assertEqual(latest["source_status"], "ok")
        self.assertEqual(latest["ideas"][0]["status"], "needs_review")
        self.assertEqual(latest["ideas"][0]["source"], "x")
        self.assertEqual(latest["ideas"][1]["tickers"], ["NVDA"])
        self.assertTrue(paths["snapshot"].name.startswith("idea-feed-20260605-120000"))

    def test_watchlist_events_are_added_to_idea_feed(self) -> None:
        from backend.services.idea_feed import build_idea_feed

        sweep = {
            "generated_at": "2026-06-07T12:00:00+00:00",
            "source_status": "ok",
            "inputs": {"tickers": ["GENB"]},
            "insights": [],
            "watchlist_events": [
                {
                    "source": "watchlist_event",
                    "score": 65,
                    "title": "GENB: Generate Biomedicines IPO lock-up overhang",
                    "metadata": {
                        "ticker": "GENB",
                        "event_date": "2026-08-26",
                        "days_until_event": 80,
                    },
                }
            ],
        }

        feed = build_idea_feed(sweep)

        self.assertEqual(feed["ideas"][0]["source"], "watchlist_event")
        self.assertEqual(feed["ideas"][0]["tickers"], ["GENB"])
        self.assertEqual(feed["ideas"][0]["raw_metadata"]["event_date"], "2026-08-26")
        self.assertIn("calendar", " ".join(feed["ideas"][0]["next_actions"]).lower())

    def test_reddit_insights_get_reddit_specific_next_actions(self) -> None:
        from backend.services.idea_feed import build_idea_feed

        sweep = {
            "generated_at": "2026-06-07T12:00:00+00:00",
            "source_status": "ok",
            "inputs": {"tickers": ["NVDA"]},
            "insights": [
                {
                    "source": "reddit",
                    "score": 67,
                    "title": "r/stocks: NVDA - HBM shortage DD",
                    "url": "https://www.reddit.com/r/stocks/comments/1/nvda",
                    "metadata": {
                        "ticker": "NVDA",
                        "subreddit": "stocks",
                        "score": 240,
                        "num_comments": 80,
                    },
                }
            ],
        }

        feed = build_idea_feed(sweep)

        self.assertEqual(feed["ideas"][0]["source"], "reddit")
        self.assertEqual(feed["ideas"][0]["tickers"], ["NVDA"])
        self.assertIn("reddit", " ".join(feed["ideas"][0]["next_actions"]).lower())

    def test_ai_infra_update_insights_keep_related_tickers_and_next_actions(self) -> None:
        from backend.services.idea_feed import build_idea_feed

        sweep = {
            "generated_at": "2026-06-07T12:00:00+00:00",
            "source_status": "ok",
            "inputs": {"tickers": ["NVDA"]},
            "insights": [
                {
                    "source": "ai_infra_update",
                    "score": 91.9,
                    "title": "AI infra update: H100 SXM rental median $2.40, 7D -41.9%",
                    "url": None,
                    "metadata": {
                        "gpu": "H100 SXM",
                        "related_tickers": ["NVDA", "AMD"],
                    },
                }
            ],
        }

        feed = build_idea_feed(sweep)

        self.assertEqual(feed["ideas"][0]["source"], "ai_infra_update")
        self.assertEqual(feed["ideas"][0]["tickers"], ["NVDA", "AMD"])
        self.assertIn("ai infrastructure", " ".join(feed["ideas"][0]["next_actions"]).lower())

    def test_idea_feed_preserves_news_intelligence_metadata(self) -> None:
        from backend.services.idea_feed import build_idea_feed

        feed = build_idea_feed(
            {
                "generated_at": "2026-06-08T02:00:00+00:00",
                "source_status": "ok",
                "insights": [
                    {
                        "source": "news_intelligence",
                        "score": 85,
                        "title": "Memory chip supply tightens as HBM demand rises",
                        "url": "https://example.com/memory-hbm",
                        "metadata": {
                            "insight_id": "news-intel-abc",
                            "related_tickers": ["MU", "NVDA"],
                            "themes": ["hbm_supply_chain"],
                            "source_claim": "Memory chip supply tightens as HBM demand rises",
                        },
                    }
                ],
            }
        )

        idea = feed["ideas"][0]
        assert idea["source"] == "news_intelligence"
        assert idea["tickers"] == ["MU", "NVDA"]
        assert idea["raw_metadata"]["insight_id"] == "news-intel-abc"
        assert "x expert reaction" in " ".join(idea["next_actions"]).lower()

    def test_idea_feed_includes_news_intelligence_cards_even_when_insights_are_capped(self) -> None:
        from backend.services.idea_feed import build_idea_feed

        feed = build_idea_feed(
            {
                "generated_at": "2026-06-08T02:00:00+00:00",
                "source_status": "ok",
                "insights": [
                    {
                        "source": "scanner",
                        "score": 99,
                        "title": "NVDA technical score 99.0, signal bullish, RSI 42",
                        "url": None,
                        "metadata": {"ticker": "NVDA", "overall_signal": "bullish"},
                    }
                ],
                "news_intelligence": [
                    {
                        "insight_id": "news-intel-capped",
                        "source_type": "news_intelligence",
                        "source_claim": "Memory chip supply tightens as HBM demand rises",
                        "source_name": "Example Wire",
                        "source_url": "https://example.com/memory-hbm",
                        "source_published_at": "2026-06-08T00:30:00+00:00",
                        "related_tickers": ["MU", "NVDA"],
                        "themes": ["hbm_supply_chain"],
                        "cross_reference_status": "expert_reaction_found",
                        "evidence": [{"handle": "mindmoon_108"}],
                        "score": 85,
                        "human_review": {"default_decision": "needs_more_source"},
                    }
                ],
            }
        )

        news_ideas = [idea for idea in feed["ideas"] if idea["source"] == "news_intelligence"]
        assert any(idea["source"] == "scanner" for idea in feed["ideas"])
        assert news_ideas[0]["tickers"] == ["MU", "NVDA"]
        assert news_ideas[0]["raw_metadata"]["insight_id"] == "news-intel-capped"

    def test_daily_idea_sweep_job_is_registered(self) -> None:
        from backend.jobs import register_all_jobs
        from backend.scheduler import SchedulerManager

        manager = SchedulerManager()
        register_all_jobs(manager)

        job = manager.get_job("daily_idea_sweep")
        self.assertIsNotNone(job)
        self.assertEqual(job["name"], "Daily Idea Sweep")
        self.assertIn("idea", job["description"].lower())

    def test_daily_idea_sweep_job_writes_feed_and_records_summary(self) -> None:
        from backend.jobs.daily_idea_sweep import run_daily_idea_sweep

        sweep = {
            "generated_at": "2026-06-05T12:00:00+00:00",
            "source_status": "ok",
            "inputs": {"tickers": ["NVDA"]},
            "insights": [
                {
                    "source": "x",
                    "score": 90,
                    "title": "HBM shortage",
                    "url": "https://x.com/example/status/1",
                    "metadata": {"matched_keywords": ["HBM"]},
                }
            ],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            job_contexts = []
            with (
                patch("backend.jobs.daily_idea_sweep.MarketSweepService") as service_class,
                patch("backend.jobs.daily_idea_sweep.Config.IDEA_SWEEP_OUTPUT_DIR", tmpdir),
                patch("backend.jobs.daily_idea_sweep.job_timer", new=_fake_job_timer(job_contexts)),
            ):
                service_class.return_value.run.return_value = sweep
                run_daily_idea_sweep()

            latest = Path(tmpdir) / "latest.json"
            saved = json.loads(latest.read_text(encoding="utf-8"))

        self.assertEqual(saved["ideas"][0]["title"], "HBM shortage")
        self.assertEqual(job_contexts[0]["job_id"], "daily_idea_sweep")
        self.assertIn("1 ideas", job_contexts[0]["ctx"]["result_summary"])
        service_class.return_value.run.assert_called_once_with(
            include_x=True,
            include_reddit=False,
            top_n=10,
            x_max_accounts=16,
            x_posts_per_account=3,
            news_max_articles=3,
        )


def _fake_job_timer(contexts: list[dict]):
    @contextmanager
    def _timer(job_id: str, job_name: str):
        ctx = {"result_summary": "", "agent_name": None, "cost": 0.0, "status": "success"}
        contexts.append({"job_id": job_id, "job_name": job_name, "ctx": ctx})
        yield ctx

    return _timer


if __name__ == "__main__":
    unittest.main()
