```python
"""
TickerPulse AI v3.0 - Shared Swagger/OpenAPI Schema Definitions

Centralised $ref-able schema definitions consumed by Flasgger via
``_SWAGGER_TEMPLATE['definitions']`` in ``backend/app.py``.

Usage in app.py::

    from backend.api.swagger_schemas import SWAGGER_DEFINITIONS
    _SWAGGER_TEMPLATE['definitions'] = SWAGGER_DEFINITIONS

Usage in YAML docstrings::

    responses:
      400:
        schema:
          $ref: '#/definitions/Error'
"""

SWAGGER_DEFINITIONS: dict = {
    # ------------------------------------------------------------------
    # Generic
    # ------------------------------------------------------------------
    'Error': {
        'type': 'object',
        'properties': {
            'error': {'type': 'string', 'example': 'Descriptive error message'},
        },
    },
    'SuccessResponse': {
        'type': 'object',
        'properties': {
            'success': {'type': 'boolean', 'example': True},
        },
    },
    'Pagination': {
        'type': 'object',
        'properties': {
            'page': {'type': 'integer', 'example': 1},
            'page_size': {'type': 'integer', 'example': 25},
            'total': {'type': 'integer', 'example': 100},
            'has_next': {'type': 'boolean', 'example': False},
        },
    },

    # ------------------------------------------------------------------
    # Stocks
    # ------------------------------------------------------------------
    'StockItem': {
        'type': 'object',
        'properties': {
            'ticker': {'type': 'string', 'example': 'AAPL'},
            'name': {'type': 'string', 'example': 'Apple Inc.'},
            'market': {'type': 'string', 'example': 'US'},
            'added_at': {'type': 'string', 'format': 'date-time'},
            'active': {'type': 'integer', 'example': 1},
        },
    },
    'NewsArticle': {
        'type': 'object',
        'properties': {
            'title': {'type': 'string', 'example': 'Apple reports record earnings'},
            'source': {'type': 'string', 'example': 'Reuters'},
            'published_date': {'type': 'string', 'format': 'date-time'},
            'url': {'type': 'string', 'format': 'uri'},
            'sentiment_label': {
                'type': 'string',
                'enum': ['positive', 'negative', 'neutral'],
            },
            'sentiment_score': {
                'type': 'number',
                'format': 'float',
                'example': 0.72,
            },
        },
    },

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------
    'PriceAlert': {
        'type': 'object',
        'properties': {
            'id': {'type': 'integer', 'example': 1},
            'ticker': {'type': 'string', 'example': 'AAPL'},
            'condition_type': {
                'type': 'string',
                'enum': ['price_above', 'price_below', 'pct_change'],
            },
            'threshold': {'type': 'number', 'example': 200.0},
            'enabled': {
                'type': 'integer',
                'example': 1,
                'description': '1 = enabled, 0 = disabled',
            },
            'sound_type': {
                'type': 'string',
                'enum': ['default', 'chime', 'alarm', 'silent'],
            },
            'created_at': {'type': 'string', 'format': 'date-time'},
        },
    },

    # ------------------------------------------------------------------
    # Agents
    # ------------------------------------------------------------------
    'AgentRun': {
        'type': 'object',
        'properties': {
            'id': {'type': 'integer', 'example': 42},
            'agent_name': {'type': 'string', 'example': 'researcher'},
            'status': {
                'type': 'string',
                'enum': ['running', 'success', 'error'],
            },
            'output': {'type': 'string'},
            'duration_ms': {'type': 'integer', 'example': 3200},
            'tokens_used': {'type': 'integer', 'example': 1280},
            'estimated_cost': {'type': 'number', 'format': 'float', 'example': 0.0024},
            'started_at': {'type': 'string', 'format': 'date-time'},
            'completed_at': {'type': 'string', 'format': 'date-time'},
            'framework': {'type': 'string', 'example': 'crewai'},
        },
    },

    # ------------------------------------------------------------------
    # Research
    # ------------------------------------------------------------------
    'ResearchBrief': {
        'type': 'object',
        'properties': {
            'id': {'type': 'integer', 'example': 1},
            'ticker': {'type': 'string', 'example': 'AAPL'},
            'title': {
                'type': 'string',
                'example': 'AAPL Deep Dive: Technical & Fundamental Analysis',
            },
            'content': {'type': 'string'},
            'agent_name': {'type': 'string', 'example': 'researcher'},
            'model_used': {'type': 'string', 'example': 'claude-sonnet-4-5'},
            'created_at': {'type': 'string', 'format': 'date-time'},
        },
    },

    # ------------------------------------------------------------------
    # Scheduler
    # ------------------------------------------------------------------
    'SchedulerJob': {
        'type': 'object',
        'properties': {
            'id': {'type': 'string', 'example': 'news_monitor'},
            'name': {'type': 'string', 'example': 'News Monitor'},
            'status': {
                'type': 'string',
                'enum': ['running', 'paused', 'stopped', 'unknown'],
            },
            'next_run': {'type': 'string', 'format': 'date-time'},
            'last_run': {'type': 'string', 'format': 'date-time'},
            'timezone': {'type': 'string', 'example': 'US/Eastern'},
        },
    },

    # ------------------------------------------------------------------
    # Data Providers
    # ------------------------------------------------------------------
    'ProviderStatus': {
        'type': 'object',
        'properties': {
            'id': {'type': 'string', 'example': 'yahoo_finance'},
            'display_name': {'type': 'string', 'example': 'Yahoo Finance'},
            'is_active': {'type': 'boolean', 'example': True},
            'rate_limit_used': {'type': 'integer', 'example': 42},
            'rate_limit_max': {'type': 'integer', 'example': 120},
            'reset_at': {'type': 'string', 'format': 'date-time'},
        },
    },

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    'AuthUser': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'string',
                'description': 'Google subject identifier.',
                'example': '108234567890123456789',
            },
            'email': {
                'type': 'string',
                'format': 'email',
                'example': 'user@example.com',
            },
            'name': {
                'type': 'string',
                'example': 'Jane Smith',
            },
        },
    },

    # ------------------------------------------------------------------
    # Sentiment
    # ------------------------------------------------------------------
    'SentimentData': {
        'type': 'object',
        'properties': {
            'ticker': {'type': 'string', 'example': 'AAPL'},
            'label': {
                'type': 'string',
                'enum': ['bullish', 'bearish', 'neutral'],
                'example': 'bullish',
            },
            'score': {
                'type': 'number',
                'format': 'float',
                'description': 'Composite sentiment score (0–1), or null when no signals.',
                'example': 0.72,
            },
            'signal_count': {'type': 'integer', 'example': 43},
            'sources': {
                'type': 'object',
                'properties': {
                    'news': {'type': 'integer', 'example': 38},
                    'reddit': {'type': 'integer', 'example': 5},
                },
            },
            'updated_at': {'type': 'string', 'format': 'date-time'},
            'stale': {'type': 'boolean', 'example': False},
        },
    },

    # ------------------------------------------------------------------
    # Earnings
    # ------------------------------------------------------------------
    'EarningsEvent': {
        'type': 'object',
        'properties': {
            'id': {'type': 'integer', 'example': 1},
            'ticker': {'type': 'string', 'example': 'AAPL'},
            'company': {'type': 'string', 'example': 'Apple Inc.'},
            'earnings_date': {'type': 'string', 'format': 'date', 'example': '2026-02-28'},
            'time_of_day': {
                'type': 'string',
                'enum': ['before_market', 'after_market', 'during_market', 'unknown'],
            },
            'eps_estimate': {'type': 'number', 'example': 2.35},
            'fiscal_quarter': {'type': 'string', 'example': 'Q1 2026'},
            'fetched_at': {'type': 'string', 'format': 'date-time'},
            'on_watchlist': {'type': 'boolean'},
        },
    },

    # ------------------------------------------------------------------
    # Compare / Performance
    # ------------------------------------------------------------------
    'CompareResult': {
        'type': 'object',
        'description': 'Normalised % return series for a single symbol.',
        'properties': {
            'points': {
                'type': 'array',
                'description': 'Normalised return series. Present on success.',
                'items': {
                    'type': 'object',
                    'properties': {
                        'time': {
                            'type': 'integer',
                            'description': 'Unix timestamp.',
                        },
                        'value': {
                            'type': 'number',
                            'description': 'Percentage return from period start.',
                            'example': 3.45,
                        },
                    },
                },
            },
            'current_pct': {
                'type': 'number',
                'description': 'Last value in points (current % return). Present on success.',
                'example': 3.45,
            },
            'error': {
                'type': 'string',
                'description': 'Human-readable error. Present when data is unavailable.',
            },
        },
    },

    # ------------------------------------------------------------------
    # Downloads
    # ------------------------------------------------------------------
    'DownloadStats': {
        'type': 'object',
        'properties': {
            'id': {'type': 'integer', 'example': 1},
            'repo_owner': {'type': 'string', 'example': 'amitpatole'},
            'repo_name': {'type': 'string', 'example': 'stockpulse-ai'},
            'total_clones': {'type': 'integer', 'example': 482},
            'unique_clones': {'type': 'integer', 'example': 210},
            'period_start': {'type': 'string', 'format': 'date'},
            'period_end': {'type': 'string', 'format': 'date'},
            'recorded_at': {'type': 'string', 'format': 'date-time'},
        },
    },
}
```