"""
TickerPulse AI v3.0 - API Blueprints Package
Import all blueprint objects for convenient registration with the Flask app.
"""

from backend.api.stocks import stocks_bp
from backend.api.news import news_bp
from backend.api.analysis import analysis_bp
from backend.api.chat import chat_bp
from backend.api.settings import settings_bp
from backend.api.market_sweep import market_sweep_bp
from backend.api.agents import agents_bp
from backend.api.scheduler_routes import scheduler_bp

__all__ = [
    'stocks_bp',
    'news_bp',
    'analysis_bp',
    'chat_bp',
    'settings_bp',
    'market_sweep_bp',
    'agents_bp',
    'scheduler_bp',
]
