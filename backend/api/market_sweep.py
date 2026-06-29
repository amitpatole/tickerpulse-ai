"""On-demand market sweep API."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.services.ai_infra_update import build_ai_infra_update
from backend.services.market_sweep import MarketSweepService

market_sweep_bp = Blueprint("market_sweep", __name__, url_prefix="/api")


@market_sweep_bp.route("/ai-infra-update", methods=["GET"])
def get_ai_infra_update():
    return jsonify(build_ai_infra_update())


@market_sweep_bp.route("/market-sweep", methods=["GET", "POST"])
def run_market_sweep():
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        tickers = payload.get("tickers")
        include_x = bool(payload.get("include_x", True))
        include_reddit = bool(payload.get("include_reddit", False))
        include_ai_infra = bool(payload.get("include_ai_infra", True))
        top_n = int(payload.get("top_n", 10))
        period = str(payload.get("period", "3mo"))
        x_max_accounts = int(payload.get("x_max_accounts", 12))
        x_posts_per_account = int(payload.get("x_posts_per_account", 5))
        news_max_articles = int(payload.get("news_max_articles", 3))
        reddit_max_tickers = int(payload.get("reddit_max_tickers", 5))
        reddit_posts_per_ticker = int(payload.get("reddit_posts_per_ticker", 5))
    else:
        ticker_arg = request.args.get("tickers", "")
        tickers = [t.strip() for t in ticker_arg.split(",") if t.strip()] or None
        include_x = request.args.get("include_x", "true").lower() != "false"
        include_reddit = request.args.get("include_reddit", "false").lower() == "true"
        include_ai_infra = request.args.get("include_ai_infra", "true").lower() != "false"
        top_n = int(request.args.get("top_n", 10))
        period = request.args.get("period", "3mo")
        x_max_accounts = int(request.args.get("x_max_accounts", 12))
        x_posts_per_account = int(request.args.get("x_posts_per_account", 5))
        news_max_articles = int(request.args.get("news_max_articles", 3))
        reddit_max_tickers = int(request.args.get("reddit_max_tickers", 5))
        reddit_posts_per_ticker = int(request.args.get("reddit_posts_per_ticker", 5))

    if tickers is not None and not isinstance(tickers, list):
        return jsonify({"error": "tickers must be a list of symbols"}), 400

    result = MarketSweepService().run(
        tickers=tickers,
        include_x=include_x,
        include_reddit=include_reddit,
        include_ai_infra=include_ai_infra,
        top_n=max(1, min(top_n, 25)),
        period=period,
        x_max_accounts=max(0, min(x_max_accounts, 32)),
        x_posts_per_account=max(1, min(x_posts_per_account, 10)),
        news_max_articles=max(0, min(news_max_articles, 10)),
        reddit_max_tickers=max(0, min(reddit_max_tickers, 10)),
        reddit_posts_per_ticker=max(1, min(reddit_posts_per_ticker, 25)),
    )
    return jsonify(result)
