"""
TickerPulse AI v3.0 - Shared Swagger/OpenAPI Schema Definitions
Reusable $ref schemas centralised here and imported into the Flasgger
template in app.py.  Endpoints reference these via:

    $ref: '#/definitions/SchemaName'

Add new definitions here when an endpoint introduces a new top-level
response or parameter type that is used in more than one place.
"""

SWAGGER_DEFINITIONS: dict = {
    # -------------------------------------------------------------------------
    # Base error envelope — used across every blueprint
    # -------------------------------------------------------------------------
    'Error': {
        'type': 'object',
        'properties': {
            'error': {
                'type': 'string',
                'example': 'A descriptive error message',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Generic success envelope — used in scheduler, settings, alerts blueprints
    # -------------------------------------------------------------------------
    'SuccessResponse': {
        'type': 'object',
        'required': ['success'],
        'properties': {
            'success': {
                'type': 'boolean',
                'example': True,
            },
            'message': {
                'type': 'string',
                'example': 'Operation completed successfully.',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Stock price record — used in stocks.py and price_refresh SSE events
    # -------------------------------------------------------------------------
    'StockPrice': {
        'type': 'object',
        'properties': {
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
            'name': {
                'type': 'string',
                'example': 'Apple Inc.',
            },
            'price': {
                'type': 'number',
                'format': 'float',
                'example': 192.35,
            },
            'change': {
                'type': 'number',
                'format': 'float',
                'description': 'Absolute price change.',
                'example': 1.25,
            },
            'change_pct': {
                'type': 'number',
                'format': 'float',
                'description': 'Percentage price change.',
                'example': 0.65,
            },
            'market': {
                'type': 'string',
                'enum': ['US', 'India'],
                'example': 'US',
            },
            'last_updated': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Price snapshot — lightweight real-time price record returned by
    # GET /api/stocks/prices and emitted in SSE price_update events.
    # Unlike StockPrice it omits company metadata (name, market) and
    # carries a UTC fetch timestamp.
    # -------------------------------------------------------------------------
    'PriceSnapshot': {
        'type': 'object',
        'properties': {
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
            'price': {
                'type': 'number',
                'format': 'float',
                'description': 'Latest traded price.',
                'example': 189.50,
            },
            'change': {
                'type': 'number',
                'format': 'float',
                'description': 'Absolute price change from previous close.',
                'example': 1.23,
            },
            'change_pct': {
                'type': 'number',
                'format': 'float',
                'description': 'Percentage price change from previous close.',
                'example': 0.65,
            },
            'volume': {
                'type': 'integer',
                'description': 'Trading volume. 0 when the data provider does not supply it.',
                'example': 42000000,
            },
            'timestamp': {
                'type': 'string',
                'format': 'date-time',
                'description': 'UTC ISO-8601 timestamp when the price was fetched.',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Price alert — used in alerts.py CRUD responses
    # -------------------------------------------------------------------------
    'Alert': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
            'condition_type': {
                'type': 'string',
                'enum': ['price_above', 'price_below', 'pct_change'],
                'example': 'price_above',
            },
            'threshold': {
                'type': 'number',
                'format': 'float',
                'example': 200.0,
            },
            'enabled': {
                'type': 'boolean',
                'example': True,
            },
            'sound_type': {
                'type': 'string',
                'enum': ['default', 'chime', 'alarm', 'silent'],
                'example': 'chime',
            },
            'created_at': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Watchlist group summary — used in watchlist.py list/create responses
    # -------------------------------------------------------------------------
    'WatchlistGroup': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'name': {
                'type': 'string',
                'example': 'Tech Stocks',
            },
            'sort_order': {
                'type': 'integer',
                'example': 0,
            },
            'stock_count': {
                'type': 'integer',
                'example': 5,
            },
            'created_at': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Watchlist detail — used in watchlist.py GET /<id> response
    # -------------------------------------------------------------------------
    'WatchlistDetail': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'name': {
                'type': 'string',
                'example': 'Tech Stocks',
            },
            'sort_order': {
                'type': 'integer',
                'example': 0,
            },
            'created_at': {
                'type': 'string',
                'format': 'date-time',
            },
            'tickers': {
                'type': 'array',
                'description': 'Ordered list of ticker symbols in this watchlist.',
                'items': {
                    'type': 'string',
                    'example': 'AAPL',
                },
            },
        },
    },

    # -------------------------------------------------------------------------
    # Scheduled job — used in scheduler_routes.py list/detail responses
    # -------------------------------------------------------------------------
    'SchedulerJob': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'string',
                'example': 'news_monitor',
            },
            'name': {
                'type': 'string',
                'example': 'News Monitor',
            },
            'status': {
                'type': 'string',
                'enum': ['running', 'paused', 'scheduled', 'disabled'],
                'example': 'scheduled',
            },
            'trigger': {
                'type': 'string',
                'example': 'interval',
            },
            'next_run': {
                'type': 'string',
                'format': 'date-time',
            },
            'last_run': {
                'type': 'string',
                'format': 'date-time',
            },
            'timezone': {
                'type': 'string',
                'example': 'US/Eastern',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Data provider status — used in providers.py
    # -------------------------------------------------------------------------
    'ProviderStatus': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'string',
                'example': 'yahoo_finance',
            },
            'display_name': {
                'type': 'string',
                'example': 'Yahoo Finance',
            },
            'is_active': {
                'type': 'boolean',
                'example': True,
            },
            'rate_limit_used': {
                'type': 'integer',
                'example': 3,
            },
            'rate_limit_max': {
                'type': 'integer',
                'example': 5,
            },
            'reset_at': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Research brief — used in research.py list/generate responses
    # -------------------------------------------------------------------------
    'ResearchBrief': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
            'title': {
                'type': 'string',
                'example': 'AAPL Deep Dive: Technical & Fundamental Analysis',
            },
            'content': {
                'type': 'string',
                'description': 'Full Markdown research brief content.',
            },
            'agent_name': {
                'type': 'string',
                'example': 'researcher',
            },
            'model_used': {
                'type': 'string',
                'example': 'claude-sonnet-4-6',
            },
            'created_at': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Authenticated user — used in auth.py /auth/me response
    # -------------------------------------------------------------------------
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

    # -------------------------------------------------------------------------
    # Sentiment data — used in sentiment.py GET response
    # -------------------------------------------------------------------------
    'SentimentData': {
        'type': 'object',
        'properties': {
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
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
            'signal_count': {
                'type': 'integer',
                'example': 43,
            },
            'sources': {
                'type': 'object',
                'properties': {
                    'news': {
                        'type': 'integer',
                        'example': 38,
                    },
                    'reddit': {
                        'type': 'integer',
                        'example': 5,
                    },
                },
            },
            'updated_at': {
                'type': 'string',
                'format': 'date-time',
            },
            'stale': {
                'type': 'boolean',
                'example': False,
            },
        },
    },

    # -------------------------------------------------------------------------
    # Earnings event — used in earnings.py events array
    # -------------------------------------------------------------------------
    'EarningsEvent': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
            'company': {
                'type': 'string',
                'example': 'Apple Inc.',
            },
            'earnings_date': {
                'type': 'string',
                'format': 'date',
                'example': '2026-02-28',
            },
            'time_of_day': {
                'type': 'string',
                'enum': ['before_market', 'after_market', 'during_market', 'unknown'],
            },
            'eps_estimate': {
                'type': 'number',
                'example': 2.35,
            },
            'fiscal_quarter': {
                'type': 'string',
                'example': 'Q1 2026',
            },
            'fetched_at': {
                'type': 'string',
                'format': 'date-time',
            },
            'on_watchlist': {
                'type': 'boolean',
                'example': True,
            },
        },
    },

    # -------------------------------------------------------------------------
    # Compare result — used in compare.py per-symbol response value
    # -------------------------------------------------------------------------
    'CompareResult': {
        'type': 'object',
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
                'example': 'No data for selected range',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Download stats record — used in downloads.py aggregate response
    # -------------------------------------------------------------------------
    'DownloadStats': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'repo_owner': {
                'type': 'string',
                'example': 'amitpatole',
            },
            'repo_name': {
                'type': 'string',
                'example': 'stockpulse-ai',
            },
            'total_clones': {
                'type': 'integer',
                'example': 482,
            },
            'unique_clones': {
                'type': 'integer',
                'example': 210,
            },
            'period_start': {
                'type': 'string',
                'format': 'date',
            },
            'period_end': {
                'type': 'string',
                'format': 'date',
            },
            'recorded_at': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # News article — used in news.py GET /api/news response
    # -------------------------------------------------------------------------
    'NewsArticle': {
        'type': 'object',
        'properties': {
            'id': {
                'type': 'integer',
                'example': 1,
            },
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
            'title': {
                'type': 'string',
                'example': 'Apple Reports Strong Q1 Earnings',
            },
            'description': {
                'type': 'string',
            },
            'url': {
                'type': 'string',
                'format': 'uri',
            },
            'source': {
                'type': 'string',
                'example': 'Bloomberg',
            },
            'published_date': {
                'type': 'string',
                'format': 'date-time',
            },
            'sentiment_score': {
                'type': 'number',
                'format': 'float',
                'example': 0.75,
            },
            'sentiment_label': {
                'type': 'string',
                'enum': ['positive', 'negative', 'neutral'],
                'example': 'positive',
            },
            'created_at': {
                'type': 'string',
                'format': 'date-time',
            },
        },
    },

    # -------------------------------------------------------------------------
    # Chat response — used in chat.py POST /api/chat/ask response
    # -------------------------------------------------------------------------
    'ChatResponse': {
        'type': 'object',
        'properties': {
            'success': {
                'type': 'boolean',
                'example': True,
            },
            'answer': {
                'type': 'string',
                'description': 'AI-generated response to the question.',
            },
            'ai_powered': {
                'type': 'boolean',
                'description': 'True if response was generated by AI provider.',
                'example': True,
            },
            'ticker': {
                'type': 'string',
                'example': 'AAPL',
            },
        },
    },
}