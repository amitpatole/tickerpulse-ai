#!/usr/bin/env python3
"""
AI-Powered Stock Analytics
Analyzes technical indicators, news sentiment, and social media to provide stock ratings
"""

import math
import sqlite3
import requests
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple, Optional
import json

from backend.config import Config
from backend.database import db_session, batch_upsert_ai_ratings

logger = logging.getLogger(__name__)


class StockAnalytics:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = Config.DB_PATH
        self.db_path = db_path
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def close(self):
        """Close the underlying HTTP session."""
        self.session.close()

    def __del__(self):
        self.close()

    def get_stock_price_data(self, ticker: str, period='1mo') -> Dict:
        """Fetch stock price data from Yahoo Finance with yfinance library fallback."""
        # Attempt 1: Direct Yahoo v8 API
        try:
            url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}"
            params = {
                'range': period,
                'interval': '1d',
                'indicators': 'quote',
                'includeTimestamps': 'true'
            }

            response = self.session.get(url, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()
                result = data.get('chart', {}).get('result', [{}])[0]

                quote = result.get('indicators', {}).get('quote', [{}])[0]
                timestamps = result.get('timestamp', [])

                if timestamps and quote.get('close'):
                    return {
                        'open': quote.get('open', []),
                        'high': quote.get('high', []),
                        'low': quote.get('low', []),
                        'close': quote.get('close', []),
                        'volume': quote.get('volume', []),
                        'timestamps': timestamps
                    }

        except Exception as e:
            logger.warning(f"Yahoo v8 API failed for {ticker}: {e}")

        # Attempt 2: yfinance library fallback
        try:
            import yfinance as yf
            tk = yf.Ticker(ticker)
            hist = tk.history(period=period, interval='1d')
            if not hist.empty:
                return {
                    'open': hist['Open'].tolist(),
                    'high': hist['High'].tolist(),
                    'low': hist['Low'].tolist(),
                    'close': hist['Close'].tolist(),
                    'volume': hist['Volume'].tolist(),
                    'timestamps': [int(ts.timestamp()) for ts in hist.index]
                }
        except Exception as e:
            logger.error(f"yfinance fallback also failed for {ticker}: {e}")

        return {}

    def calculate_rsi(self, prices: List[float], period: int = 14) -> float:
        """Calculate Relative Strength Index (RSI)"""
        if len(prices) < period + 1:
            return 50.0  # Neutral if not enough data

        # Calculate price changes
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]

        # Separate gains and losses
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [-d if d < 0 else 0 for d in deltas]

        # Calculate average gains and losses
        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        return rsi

    def calculate_macd(self, prices: List[float]) -> Tuple[float, float, str]:
        """Calculate MACD (Moving Average Convergence Divergence)"""
        if len(prices) < 26:
            return 0.0, 0.0, 'neutral'

        # Calculate EMAs
        ema_12 = self.calculate_ema(prices, 12)
        ema_26 = self.calculate_ema(prices, 26)

        macd = ema_12 - ema_26
        signal = self.calculate_ema([macd], 9)

        if macd > signal:
            trend = 'bullish'
        elif macd < signal:
            trend = 'bearish'
        else:
            trend = 'neutral'

        return macd, signal, trend

    def calculate_ema(self, prices: List[float], period: int) -> float:
        """Calculate Exponential Moving Average"""
        if len(prices) < period:
            return sum(prices) / len(prices) if prices else 0

        multiplier = 2 / (period + 1)
        ema = sum(prices[:period]) / period

        for price in prices[period:]:
            ema = (price * multiplier) + (ema * (1 - multiplier))

        return ema

    def calculate_moving_averages(self, prices: List[float]) -> Dict:
        """Calculate various moving averages"""
        if not prices:
            return {}

        current_price = prices[-1]

        mas = {}
        for period in [20, 50, 200]:
            if len(prices) >= period:
                ma = sum(prices[-period:]) / period
                mas[f'ma_{period}'] = {
                    'value': ma,
                    'signal': 'bullish' if current_price > ma else 'bearish'
                }

        return mas

    def get_sentiment_analysis(self, ticker: str, days: int = 7) -> Dict:
        """Analyze news and social media sentiment from database"""
        since_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        with db_session(self.db_path) as conn:
            articles = conn.execute('''
                SELECT sentiment_score, sentiment_label, source, engagement_score, created_at
                FROM news
                WHERE ticker = ? AND created_at > ?
                ORDER BY created_at DESC
            ''', (ticker, since_date)).fetchall()

        if not articles:
            return {
                'avg_sentiment': 0.0,
                'total_articles': 0,
                'positive_count': 0,
                'negative_count': 0,
                'neutral_count': 0,
                'sentiment_trend': 'neutral',
                'sources': {},
                'weighted_sentiment': 0.0
            }

        # Calculate sentiment metrics
        sentiments = [a['sentiment_score'] for a in articles]
        labels = [a['sentiment_label'] for a in articles]

        # Weight by engagement score (handle missing column gracefully)
        weighted_sentiments = []
        total_weight = 0
        for article in articles:
            try:
                engagement = article['engagement_score'] or 0
            except (IndexError, KeyError):
                engagement = 0
            weight = 1 + (engagement / 100)
            weighted_sentiments.append(article['sentiment_score'] * weight)
            total_weight += weight

        avg_sentiment = sum(sentiments) / len(sentiments)
        weighted_sentiment = sum(weighted_sentiments) / total_weight if total_weight > 0 else avg_sentiment

        positive_count = labels.count('positive')
        negative_count = labels.count('negative')
        neutral_count = labels.count('neutral')

        # Determine sentiment trend (last 3 days vs previous days)
        recent_cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        recent = [a['sentiment_score'] for a in articles if a['created_at'] > recent_cutoff]
        older = [a['sentiment_score'] for a in articles if a['created_at'] <= recent_cutoff]

        if recent and older:
            recent_avg = sum(recent) / len(recent)
            older_avg = sum(older) / len(older)
            if recent_avg > older_avg + 0.1:
                trend = 'improving'
            elif recent_avg < older_avg - 0.1:
                trend = 'declining'
            else:
                trend = 'stable'
        else:
            trend = 'stable'

        # Count by source
        sources = {}
        for article in articles:
            source = article['source']
            if source not in sources:
                sources[source] = {'count': 0, 'avg_sentiment': 0}
            sources[source]['count'] += 1

        return {
            'avg_sentiment': avg_sentiment,
            'weighted_sentiment': weighted_sentiment,
            'total_articles': len(articles),
            'positive_count': positive_count,
            'negative_count': negative_count,
            'neutral_count': neutral_count,
            'sentiment_trend': trend,
            'sources': sources
        }

    def calculate_ai_rating(self, ticker: str) -> Dict:
        """
        AI-powered stock rating combining technical analysis and sentiment
        Returns comprehensive rating and analysis
        """
        logger.info(f"Calculating AI rating for {ticker}...")

        # Get price data
        price_data = self.get_stock_price_data(ticker)

        if not price_data or not price_data.get('close'):
            is_indian = '.NS' in ticker.upper() or '.BO' in ticker.upper()
            return {
                'ticker': ticker,
                'rating': 'INSUFFICIENT_DATA',
                'score': 0,
                'confidence': 0,
                'currency': 'INR' if is_indian else 'USD',
                'currency_symbol': '₹' if is_indian else '$',
                'message': 'Not enough data to analyze'
            }

        # Filter out None values
        closes = [p for p in price_data['close'] if p is not None]

        if len(closes) < 14:
            is_indian = '.NS' in ticker.upper() or '.BO' in ticker.upper()
            return {
                'ticker': ticker,
                'rating': 'INSUFFICIENT_DATA',
                'score': 0,
                'confidence': 0,
                'currency': 'INR' if is_indian else 'USD',
                'currency_symbol': '₹' if is_indian else '$',
                'message': 'Not enough price data to analyze'
            }

        # Technical Analysis
        current_price = closes[-1]
        prev_close = closes[-2] if len(closes) >= 2 else current_price
        price_change = current_price - prev_close
        price_change_pct = (price_change / prev_close * 100) if prev_close else 0.0
        rsi = self.calculate_rsi(closes)
        moving_averages = self.calculate_moving_averages(closes)

        # Sentiment Analysis
        sentiment = self.get_sentiment_analysis(ticker)

        # Calculate technical score (0-100)
        technical_score = 0
        technical_signals = []

        # RSI Analysis
        if rsi < 30:
            technical_score += 25
            technical_signals.append(f"RSI: {rsi:.1f} (Oversold - Bullish signal)")
        elif rsi > 70:
            technical_score -= 15
            technical_signals.append(f"RSI: {rsi:.1f} (Overbought - Caution)")
        elif 40 <= rsi <= 60:
            technical_score += 10
            technical_signals.append(f"RSI: {rsi:.1f} (Neutral)")
        else:
            technical_signals.append(f"RSI: {rsi:.1f}")

        # Determine currency based on ticker suffix
        is_indian = '.NS' in ticker.upper() or '.BO' in ticker.upper()
        currency_symbol = '₹' if is_indian else '$'

        # Moving Average Analysis
        ma_bullish = 0
        for ma_name, ma_data in moving_averages.items():
            if ma_data['signal'] == 'bullish':
                ma_bullish += 1
                technical_score += 10
                technical_signals.append(f"Price above {ma_name.upper()}: {currency_symbol}{ma_data['value']:.2f} (Bullish)")
            else:
                technical_signals.append(f"Price below {ma_name.upper()}: {currency_symbol}{ma_data['value']:.2f} (Bearish)")

        # Sentiment Score (0-100)
        sentiment_score = 50  # Neutral baseline
        sentiment_signals = []

        if sentiment['total_articles'] > 0:
            # Weighted sentiment is more important
            sentiment_multiplier = (sentiment['weighted_sentiment'] + 1) / 2 * 100  # Convert -1 to 1 range to 0 to 100
            sentiment_score = sentiment_multiplier

            # Adjust based on article count (more articles = higher confidence)
            if sentiment['total_articles'] >= 10:
                confidence_boost = min(10, sentiment['total_articles'] / 5)
                sentiment_score += confidence_boost

            # Sentiment trend adjustment
            if sentiment['sentiment_trend'] == 'improving':
                sentiment_score += 10
                sentiment_signals.append("📈 Sentiment improving in recent days")
            elif sentiment['sentiment_trend'] == 'declining':
                sentiment_score -= 10
                sentiment_signals.append("📉 Sentiment declining in recent days")

            sentiment_signals.append(f"📰 {sentiment['total_articles']} articles analyzed")
            sentiment_signals.append(f"✅ {sentiment['positive_count']} positive, ❌ {sentiment['negative_count']} negative, ➡️ {sentiment['neutral_count']} neutral")
            sentiment_signals.append(f"Weighted sentiment: {sentiment['weighted_sentiment']:.2f}")
        else:
            sentiment_signals.append("No recent news data")

        # Combine scores (60% sentiment, 40% technical)
        final_score = (sentiment_score * 0.6) + (technical_score * 0.4)
        final_score = max(0, min(100, final_score))  # Clamp to 0-100

        # Determine rating
        if final_score >= 80:
            rating = "STRONG_BUY"
            emoji = "🚀"
            color = "#10b981"
        elif final_score >= 65:
            rating = "BUY"
            emoji = "📈"
            color = "#22c55e"
        elif final_score >= 50:
            rating = "HOLD"
            emoji = "➡️"
            color = "#f59e0b"
        elif final_score >= 35:
            rating = "SELL"
            emoji = "📉"
            color = "#ef4444"
        else:
            rating = "STRONG_SELL"
            emoji = "⚠️"
            color = "#dc2626"

        # Calculate confidence (based on data availability)
        confidence = min(100, (
            (min(sentiment['total_articles'], 20) * 2.5) +  # Up to 50 points for articles
            (len(closes) / 30 * 30) +  # Up to 30 points for price data
            (len(moving_averages) * 6.67)  # Up to 20 points for MAs
        ))

        # Currency already determined earlier
        currency = 'INR' if is_indian else 'USD'

        # Generate AI summary
        summary_text, ai_powered = self._generate_summary(rating, final_score, technical_signals, sentiment_signals)

        result = {
            'ticker': ticker,
            'rating': rating,
            'emoji': emoji,
            'color': color,
            'score': round(final_score / 10, 1),          # 0-10 for frontend
            'confidence': round(confidence / 100, 2),      # 0-1 for frontend
            'technical_score': round(technical_score, 1),
            'sentiment_score': round(sentiment.get('avg_sentiment', 0), 2),  # -1 to 1
            'current_price': round(current_price, 2),
            'price_change': round(price_change, 2),
            'price_change_pct': round(price_change_pct, 2),
            'currency': currency,
            'currency_symbol': currency_symbol,
            'rsi': round(rsi, 2),
            'moving_averages': moving_averages,
            'sentiment': sentiment,
            'sentiment_label': sentiment.get('sentiment_trend', 'neutral'),
            'technical_signals': technical_signals,
            'sentiment_signals': sentiment_signals,
            'analysis_summary': summary_text,
            'ai_powered': ai_powered,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }

        # Cache rating to database
        self._save_rating_to_db(result)

        return result

    def _save_rating_to_db(self, rating_data: Dict) -> None:
        """Cache computed rating to ai_ratings table for fast subsequent reads."""
        try:
            with db_session(self.db_path) as conn:
                batch_upsert_ai_ratings(conn, [rating_data])
        except Exception as e:
            logger.debug(f"Could not cache rating for {rating_data['ticker']}: {e}")

    def _generate_summary(self, rating: str, score: float, technical_signals: List[str],
                         sentiment_signals: List[str]) -> tuple:
        """Generate AI summary of the analysis. Returns (summary_text, is_ai_powered)"""
        # Try to use real AI if configured
        try:
            from settings_manager import get_active_ai_provider
            from ai_providers import AIProviderFactory

            provider_config = get_active_ai_provider()

            if provider_config:
                logger.info(f"Using AI provider: {provider_config['provider_name']} - {provider_config['model']}")

                # Create AI provider
                provider = AIProviderFactory.create_provider(
                    provider_config['provider_name'],
                    provider_config['api_key'],
                    provider_config['model']
                )

                if provider:
                    # Create detailed prompt for AI
                    prompt = self._create_ai_prompt(rating, score, technical_signals, sentiment_signals)

                    # Get AI analysis (with timeout protection)
                    ai_summary = provider.generate_analysis(prompt, max_tokens=300)

                    # Return AI summary if successful
                    if ai_summary and not ai_summary.startswith('Error:'):
                        logger.info("AI analysis generated successfully")
                        return (ai_summary, True)
        except Exception as e:
            logger.error(f"Error generating AI summary: {e}")

        # Fallback to basic summary if AI is not available
        summaries = {
            'STRONG_BUY': f"Strong bullish signals detected (Score: {score:.1f}/100). Technical indicators and news sentiment are highly positive. Consider buying.",
            'BUY': f"Bullish indicators present (Score: {score:.1f}/100). Both technical analysis and sentiment lean positive. Good buying opportunity.",
            'HOLD': f"Mixed signals (Score: {score:.1f}/100). Consider holding current position. Monitor for clearer directional signals.",
            'SELL': f"Bearish indicators detected (Score: {score:.1f}/100). Technical and/or sentiment analysis suggest caution. Consider reducing position.",
            'STRONG_SELL': f"Strong bearish signals (Score: {score:.1f}/100). Multiple negative indicators present. Consider exiting position."
        }

        return (summaries.get(rating, f"Score: {score:.1f}/100"), False)

    def _create_ai_prompt(self, rating: str, score: float, technical_signals: List[str],
                         sentiment_signals: List[str]) -> str:
        """Create a detailed prompt for AI analysis"""
        prompt = f"""Analyze this stock based on the following data:

RATING: {rating} (Score: {score:.1f}/100)

TECHNICAL SIGNALS:
{chr(10).join('- ' + signal for signal in technical_signals[:5])}

SENTIMENT SIGNALS:
{chr(10).join('- ' + signal for signal in sentiment_signals[:5])}

Provide a concise 2-3 sentence analysis focusing on:
1. Key insights from the data
2. Main risk factors or opportunities
3. Clear recommendation

Be direct and actionable. Avoid disclaimers."""

        return prompt

    def get_technical_indicators(self, ticker: str) -> Dict:
        """Return current RSI, MACD signal, and Bollinger Band position for ticker.

        Returns a dict with:
            rsi (float | None): 0–100 RSI value, or None if insufficient data.
            macd_signal (str): 'bullish', 'bearish', or 'neutral'.
            bb_position (str): 'upper', 'lower', or 'mid' relative to 20-period Bollinger Bands.
        """
        price_data = self.get_stock_price_data(ticker)
        if not price_data or not price_data.get('close'):
            return {'rsi': None, 'macd_signal': 'neutral', 'bb_position': 'mid'}

        closes = [p for p in price_data['close'] if p is not None]
        if not closes:
            return {'rsi': None, 'macd_signal': 'neutral', 'bb_position': 'mid'}

        rsi = self.calculate_rsi(closes)
        _, _, macd_signal = self.calculate_macd(closes)

        # Bollinger Bands (20-period, 2 standard deviations)
        bb_position = 'mid'
        if len(closes) >= 20:
            sma_20 = sum(closes[-20:]) / 20
            variance = sum((p - sma_20) ** 2 for p in closes[-20:]) / 20
            std_20 = variance ** 0.5
            upper = sma_20 + 2 * std_20
            lower = sma_20 - 2 * std_20
            price = closes[-1]
            if price >= upper:
                bb_position = 'upper'
            elif price <= lower:
                bb_position = 'lower'

        return {
            'rsi': round(rsi, 2),
            'macd_signal': macd_signal,
            'bb_position': bb_position,
        }

    @staticmethod
    def calculate_volume_profile(
        candles: List[Dict[str, Any]],
        buckets: int = 36,
    ) -> Dict[str, Any]:
        """Calculate a volume profile from OHLCV candle data.

        Each candle's volume is distributed proportionally across the price
        buckets its [low, high] range spans.  For flat candles (high == low)
        all volume is assigned to the bucket containing the midpoint.

        Args:
            candles: List of dicts with at minimum the keys
                     ``high``, ``low``, and ``volume``.
            buckets: Number of equal-width price buckets (must be >= 2).

        Returns:
            Dict with keys:
                ``buckets`` — list of ``{price_low, price_high, volume, pct}``
                              sorted from lowest to highest price.
                ``value_area`` — ``{poc, poc_volume, vah, val}`` where
                                 ``poc`` is the midpoint of the highest-volume
                                 bucket and ``vah``/``val`` are the high/low
                                 price edges of the 70 % value area.
                                 ``None`` when data is insufficient.
        """
        _empty: Dict[str, Any] = {'buckets': [], 'value_area': None}

        if not candles or buckets < 2:
            return _empty

        # Collect valid (high, low, volume) triples
        valid: List[Tuple[float, float, float]] = []
        for c in candles:
            try:
                hi = float(c['high'])
                lo = float(c['low'])
                vol = float(c.get('volume') or 0)
            except (TypeError, ValueError, KeyError):
                continue
            if math.isnan(hi) or math.isnan(lo) or hi < lo:
                continue
            valid.append((hi, lo, vol))

        if not valid:
            return _empty

        price_max = max(row[0] for row in valid)
        price_min = min(row[1] for row in valid)

        if price_max <= price_min:
            return _empty

        bucket_size = (price_max - price_min) / buckets
        volume_dist: List[float] = [0.0] * buckets

        for hi, lo, vol in valid:
            candle_range = hi - lo
            if candle_range <= 0.0:
                # Flat candle — assign all volume to the midpoint bucket
                mid = (hi + lo) / 2.0
                bi = min(int((mid - price_min) / bucket_size), buckets - 1)
                volume_dist[bi] += vol
            else:
                for i in range(buckets):
                    blo = price_min + i * bucket_size
                    bhi = blo + bucket_size
                    overlap = min(hi, bhi) - max(lo, blo)
                    if overlap > 0.0:
                        volume_dist[i] += vol * overlap / candle_range

        total_volume = sum(volume_dist)

        # Build bucket list
        pct_denom = total_volume if total_volume > 0.0 else 1.0
        bucket_list: List[Dict[str, Any]] = []
        for i in range(buckets):
            blo = round(price_min + i * bucket_size, 6)
            bhi = round(blo + bucket_size, 6)
            vol_i = int(round(volume_dist[i]))
            bucket_list.append({
                'price_low': blo,
                'price_high': bhi,
                'volume': vol_i,
                'pct': round(volume_dist[i] / pct_denom * 100.0, 2),
            })

        if total_volume == 0.0:
            return {'buckets': bucket_list, 'value_area': None}

        # Point of Control (POC) — highest-volume bucket
        poc_idx = max(range(buckets), key=lambda i: volume_dist[i])

        # Value area expansion: grow outward from POC until 70 % threshold
        va_threshold = 0.70 * total_volume
        accumulated = volume_dist[poc_idx]
        lo_idx = poc_idx
        hi_idx = poc_idx

        while accumulated < va_threshold:
            can_lo = lo_idx > 0
            can_hi = hi_idx < buckets - 1
            if not can_lo and not can_hi:
                break
            next_lo = volume_dist[lo_idx - 1] if can_lo else -1.0
            next_hi = volume_dist[hi_idx + 1] if can_hi else -1.0
            if next_hi >= next_lo:
                hi_idx += 1
                accumulated += volume_dist[hi_idx]
            else:
                lo_idx -= 1
                accumulated += volume_dist[lo_idx]

        poc_mid = round(
            price_min + (poc_idx + 0.5) * bucket_size, 6
        )
        value_area: Dict[str, Any] = {
            'poc': poc_mid,
            'poc_volume': int(round(volume_dist[poc_idx])),
            'vah': bucket_list[hi_idx]['price_high'],
            'val': bucket_list[lo_idx]['price_low'],
        }

        return {'buckets': bucket_list, 'value_area': value_area}

    def get_all_ratings(self) -> List[Dict]:
        """Get AI ratings for all active stocks"""
        try:
            with db_session(self.db_path) as conn:
                stocks = [
                    row['ticker'] for row in
                    conn.execute('SELECT ticker FROM stocks WHERE active = 1 ORDER BY ticker').fetchall()
                ]
        except sqlite3.OperationalError:
            stocks = []

        ratings = []
        for ticker in stocks:
            try:
                rating = self.calculate_ai_rating(ticker)
                ratings.append(rating)
            except Exception as e:
                logger.error(f"Error calculating rating for {ticker}: {e}")
                ratings.append({
                    'ticker': ticker,
                    'rating': 'ERROR',
                    'score': 0,
                    'confidence': 0,
                    'message': str(e)
                })

        return ratings


if __name__ == '__main__':
    # Test the analytics
    analytics = StockAnalytics()

    # Test with a stock
    rating = analytics.calculate_ai_rating('INTC')
    print(json.dumps(rating, indent=2))
