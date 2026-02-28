```python
"""
TickerPulse AI v3.0 - API Blueprints Package
"""
from backend.api.stocks import stocks_bp
... (existing imports)
from backend.api.activity import activity_bp  # NEW

__all__ = [..., 'activity_bp']
```