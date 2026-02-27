```python
#!/usr/bin/env python3
"""
Settings Manager
Handles application settings including AI provider API keys
"""

import sqlite3
import logging
import threading
from typing import Any, Dict, Optional

from backend.config import Config
from backend.database import db_session

logger = logging.getLogger(__name__)

# Serialises all write operations in this module — including get_setting and
# set_setting — to prevent concurrent callers from racing at the SQLite
# file-lock level.  WAL mode allows in-process readers to proceed while a
# writer holds the file lock, so Python-level serialisation is required for
# both reads and writes.  The multi-step ai_providers operations
# (deactivate-all → check-exists → upsert and deactivate-all → activate-one)
# are also covered so those sequences cannot interleave.
_lock = threading.RLock()


def init_settings_table():
    """Initialize settings table in database"""
    conn = sqlite3.connect(Config.DB_PATH)
    cursor = conn.cursor()

    # Create settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create AI providers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ai_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_name TEXT NOT NULL,
            api_key TEXT NOT NULL,
            model TEXT,
            is_active INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()
    logger.info("Settings tables initialized")


def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Get a setting value.

    Acquires ``_lock`` so that a concurrent ``set_setting`` caller in the same
    process cannot cause this read to observe a partially-written value (WAL
    mode allows in-process readers to proceed while a writer holds the file
    lock, so Python-level serialisation is required).
    """
    with _lock:
        conn: Optional[sqlite3.Connection] = None
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            cursor = conn.cursor()
            cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
            result = cursor.fetchone()
            return result[0] if result else default
        except Exception as e:
            logger.error("Error getting setting %s: %s", key, e)
            return default
        finally:
            if conn is not None:
                conn.close()


def set_setting(key: str, value: str) -> None:
    """Set a setting value.

    Acquires ``_lock`` to serialise concurrent writes.  Two callers racing to
    update the same key would otherwise exhibit non-deterministic
    "last-writer-wins" behaviour at the SQLite file-lock level.
    """
    with _lock:
        conn: Optional[sqlite3.Connection] = None
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                '''
                INSERT OR REPLACE INTO settings (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ''',
                (key, value),
            )
            conn.commit()
            logger.info("Setting %s updated", key)
        except Exception as e:
            logger.error("Error setting %s: %s", key, e)
        finally:
            if conn is not None:
                conn.close()


def get_active_ai_provider() -> Optional[Dict]:
    """Get the currently active AI provider.

    Acquires ``_lock`` to prevent dirty reads during the deactivate-all →
    upsert → commit write sequence in ``add_ai_provider`` and
    ``set_active_provider``.  Without the lock a reader landing between the
    ``UPDATE SET is_active=0`` and the final ``COMMIT`` would see zero active
    providers even though one is about to be activated.
    """
    with _lock:
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute('''
                SELECT * FROM ai_providers
                WHERE is_active = 1
                ORDER BY updated_at DESC
                LIMIT 1
            ''')

            result = cursor.fetchone()
            conn.close()

            if result:
                return {
                    'id': result['id'],
                    'provider_name': result['provider_name'],
                    'api_key': result['api_key'],
                    'model': result['model']
                }
            return None
        except Exception as e:
            logger.error(f"Error getting active AI provider: {e}")
            return None


def get_all_ai_providers() -> list:
    """Get all configured AI providers.

    Acquires ``_lock`` for the same dirty-read reason as
    ``get_active_ai_provider``: a concurrent write could leave the table in a
    transitional state where ``is_active`` counts are inconsistent.
    """
    with _lock:
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute('''
                SELECT id, provider_name, model, is_active, created_at, updated_at
                FROM ai_providers
                ORDER BY updated_at DESC
            ''')

            results = cursor.fetchall()
            conn.close()

            return [{
                'id': row['id'],
                'provider_name': row['provider_name'],
                'model': row['model'],
                'is_active': row['is_active'],
                'created_at': row['created_at'],
                'updated_at': row['updated_at']
            } for row in results]
        except Exception as e:
            logger.error(f"Error getting AI providers: {e}")
            return []


def add_ai_provider(provider_name: str, api_key: str, model: Optional[str] = None, set_active: bool = True) -> bool:
    """Add or update an AI provider"""
    with _lock:
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            cursor = conn.cursor()

            # If setting as active, deactivate all others
            if set_active:
                cursor.execute('UPDATE ai_providers SET is_active = 0')

            # Check if provider already exists
            cursor.execute('''
                SELECT id FROM ai_providers
                WHERE provider_name = ?
            ''', (provider_name,))

            existing = cursor.fetchone()

            if existing:
                # Update existing
                cursor.execute('''
                    UPDATE ai_providers
                    SET api_key = ?, model = ?, is_active = ?, updated_at = datetime('now')
                    WHERE provider_name = ?
                ''', (api_key, model, 1 if set_active else 0, provider_name))
            else:
                # Insert new
                cursor.execute('''
                    INSERT INTO ai_providers (provider_name, api_key, model, is_active)
                    VALUES (?, ?, ?, ?)
                ''', (provider_name, api_key, model, 1 if set_active else 0))

            conn.commit()
            conn.close()
            logger.info(f"AI provider {provider_name} added/updated")
            return True
        except Exception as e:
            logger.error(f"Error adding AI provider: {e}")
            return False


def set_active_provider(provider_id: int) -> bool:
    """Set a provider as active"""
    with _lock:
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            cursor = conn.cursor()

            # Verify the target provider exists before modifying any state
            cursor.execute('SELECT id FROM ai_providers WHERE id = ?', (provider_id,))
            if cursor.fetchone() is None:
                conn.close()
                logger.warning(f"Provider {provider_id} not found — no state changed")
                return False

            # Deactivate all
            cursor.execute('UPDATE ai_providers SET is_active = 0')

            # Activate selected
            cursor.execute('''
                UPDATE ai_providers
                SET is_active = 1, updated_at = datetime('now')
                WHERE id = ?
            ''', (provider_id,))

            conn.commit()
            conn.close()
            logger.info(f"Provider {provider_id} set as active")
            return True
        except Exception as e:
            logger.error(f"Error setting active provider: {e}")
            return False


def delete_ai_provider(provider_id: int) -> bool:
    """Delete an AI provider"""
    with _lock:
        try:
            conn = sqlite3.connect(Config.DB_PATH)
            cursor = conn.cursor()

            cursor.execute('DELETE FROM ai_providers WHERE id = ?', (provider_id,))

            conn.commit()
            conn.close()
            logger.info(f"Provider {provider_id} deleted")
            return True
        except Exception as e:
            logger.error(f"Error deleting provider: {e}")
            return False


def get_all_configured_providers() -> list[dict[str, Any]]:
    """Return all configured AI providers including API keys.

    Used by the multi-model comparison engine to fan-out a prompt to every
    configured provider.  Deliberately omits ``is_active`` since comparison
    runs *all* providers regardless of which one is currently selected.

    Acquires ``_lock`` so that a concurrent ``add_ai_provider`` or
    ``delete_ai_provider`` call cannot cause this function to read a
    transitional snapshot of the table.

    Returns:
        List of dicts with keys: provider_name, api_key, model.
        Empty list on error or when no providers are configured.
    """
    with _lock:
        try:
            with db_session() as conn:
                rows = conn.execute(
                    "SELECT provider_name, api_key, model FROM ai_providers ORDER BY id ASC"
                ).fetchall()
            return [
                {
                    'provider_name': r['provider_name'],
                    'api_key': r['api_key'],
                    'model': r['model'] or '',
                }
                for r in rows
            ]
        except Exception as exc:
            logger.error("get_all_configured_providers failed: %s", exc)
            return []


def is_ai_enabled() -> bool:
    """Check if AI is enabled (has active provider)"""
    provider = get_active_ai_provider()
    return provider is not None


if __name__ == '__main__':
    # Initialize tables
    init_settings_table()
    print("Settings tables initialized")
```