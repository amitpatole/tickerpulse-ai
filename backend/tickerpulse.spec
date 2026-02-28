# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for TickerPulse AI backend
# Run from the tickerpulse-ai/ root directory:
#   pyinstaller backend/tickerpulse.spec --distpath build/backend --workpath build/temp -y

import os

block_cipher = None
root_dir = os.path.abspath('.')

# Locate crewai package directory for bundling data files
import crewai as _crewai
_crewai_dir = os.path.dirname(_crewai.__file__)

a = Analysis(
    [os.path.join(root_dir, 'backend', 'desktop_entry.py')],
    pathex=[root_dir],
    binaries=[],
    datas=[
        (os.path.join(root_dir, 'templates'), 'templates'),
        (os.path.join(root_dir, '.env.example'), '.'),
        # CrewAI translations (required at runtime)
        (os.path.join(_crewai_dir, 'translations'), os.path.join('crewai', 'translations')),
    ],
    hiddenimports=[
        # Flask and extensions
        'flask',
        'flask_cors',
        'flask_apscheduler',
        # Backend modules
        'backend.config',
        'backend.database',
        'backend.scheduler',
        'backend.api',
        'backend.api.stocks',
        'backend.api.news',
        'backend.api.analysis',
        'backend.api.agents',
        'backend.api.research',
        'backend.api.chat',
        'backend.api.settings',
        'backend.api.scheduler_routes',
        'backend.api.watchlist',
        'backend.api.dashboard',
        'backend.api.alerts',
        'backend.api.compare',
        'backend.api.auth',
        'backend.api.downloads',
        'backend.api.providers',
        'backend.api.sentiment',
        'backend.api.earnings',
        'backend.api.portfolio',
        'backend.api.errors',
        'backend.api.error_codes',
        'backend.api.error_stats',
        'backend.core',
        'backend.core.error_codes',
        'backend.core.settings_manager',
        'backend.core.ai_providers',
        'backend.core.ai_analytics',
        'backend.core.stock_manager',
        'backend.core.stock_monitor',
        'backend.agents',
        'backend.agents.base',
        'backend.agents.crewai_engine',
        'backend.agents.openclaw_engine',
        'backend.agents.scanner_agent',
        'backend.agents.researcher_agent',
        'backend.agents.regime_agent',
        'backend.agents.investigator_agent',
        'backend.data_providers',
        'backend.data_providers.base',
        'backend.data_providers.yfinance_provider',
        'backend.data_providers.polygon_provider',
        'backend.data_providers.alpha_vantage_provider',
        'backend.data_providers.finnhub_provider',
        'backend.data_providers.custom_provider',
        'backend.jobs',
        'backend.jobs._helpers',
        'backend.jobs.morning_briefing',
        'backend.jobs.daily_summary',
        'backend.jobs.reddit_scanner',
        'backend.jobs.regime_check',
        'backend.jobs.technical_monitor',
        'backend.jobs.weekly_review',
        # CrewAI
        'crewai',
        # Data libraries
        'yfinance',
        'feedparser',
        'bs4',
        'lxml',
        'praw',
        'websocket',
        # APScheduler
        'apscheduler.jobstores.memory',
        'apscheduler.executors.pool',
        # Standard lib
        'sqlite3',
        'queue',
        'logging.handlers',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'PIL',
        'IPython',
        'jupyter',
        'notebook',
        'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='tickerpulse-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='tickerpulse-backend',
)
