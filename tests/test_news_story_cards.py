import unittest


class NewsWireFusionTest(unittest.TestCase):
    @staticmethod
    def _x_post():
        return {
            "handle": "semisource",
            "lane": "ai_semis",
            "date": "2026-06-11T12:00:00+00:00",
            "text": "CPO mass adoption pushed to 2028, later than the 2027 ramp investors expected $NVDA",
            "url": "https://x.com/semisource/status/9",
            "signal_score": 40,
        }

    @staticmethod
    def _news_post():
        return {
            "handle": "news:Benzinga",
            "lane": "news_wire",
            "source_type": "news_wire",
            "title": "Optical CPO rollout delayed",
            "date": "2026-06-11T13:00:00+00:00",
            "text": "Optical CPO rollout delayed. Vendors flag slower 800VDC and CPO timing.",
            "url": "https://example.com/cpo",
            "ticker_seeds": ["NVDA"],
            "sentiment_score": -0.2,
            "sentiment_label": "negative",
        }

    def test_news_post_never_grades_as_followed_account(self):
        from backend.services.news_story_cards import grade_source

        grade = grade_source(self._news_post())
        self.assertEqual(grade["origin"], "news_wire")
        self.assertEqual(grade["label"], "news wire headline")
        self.assertEqual(grade["score"], 5)

    def test_followed_grades_renumbered_above_wire(self):
        from backend.services.news_story_cards import grade_source

        followed = grade_source(self._x_post())
        self.assertEqual(followed["label"], "followed account original post")
        self.assertEqual(followed["score"], 6)

    def test_tickers_for_post_unions_ticker_seeds(self):
        from backend.services.news_story_cards import tickers_for_post

        self.assertEqual(tickers_for_post(self._news_post()), ["NVDA"])

    def test_wire_and_followed_posts_cluster_into_one_story(self):
        from backend.services.news_story_cards import build_story_cards

        cards = build_story_cards(
            [self._x_post(), self._news_post()],
            generated_at="2026-06-12T00:00:00+00:00",
        )
        self.assertEqual(len(cards), 1)
        grades = {source["grade"] for source in cards[0]["sources"]}
        self.assertIn("news wire headline", grades)
        self.assertIn("followed account original post", grades)
        self.assertIn("wire headline corroborated by followed account", cards[0]["confidence"])

    def test_wire_only_story_gets_wire_only_confidence(self):
        from backend.services.news_story_cards import build_story_cards

        cards = build_story_cards(
            [self._news_post()],
            generated_at="2026-06-12T00:00:00+00:00",
        )
        self.assertEqual(len(cards), 1)
        self.assertIn("wire headline only", cards[0]["confidence"])
