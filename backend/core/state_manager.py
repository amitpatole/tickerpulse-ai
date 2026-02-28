"""
TickerPulse AI v3.0 - State Manager
Thread-safe UI state persistence service backed by the ui_state SQLite table.
Mirrors the patterns established in settings_manager.py.
"""

import json
import logging
import threading
from typing import Any, Dict, Optional

from backend.config import Config
from backend.database import db_session

logger = logging.getLogger(__name__)

# Serialises all write operations — mirrors the _lock pattern in settings_manager.py.
_lock = threading.RLock()


class StateManager:
    """Persists arbitrary UI state values to the ui_state SQLite table.

    Each logical state namespace (e.g. 'dashboard', 'sidebar') is stored as a
    separate row so individual keys can be retrieved without deserialising the
    entire state blob.

    Usage::

        manager = StateManager()
        manager.set_state('dashboard', {'watchlist_id': 1, 'ticker': 'AAPL'})
        state = manager.get_state('dashboard')  # {'watchlist_id': 1, 'ticker': 'AAPL'}
    """

    def __init__(self, db_path: str | None = None) -> None:
        self._db_path = db_path or Config.DB_PATH

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def get_state(self, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve a state dict by key. Returns None when key is absent.

        Raises RuntimeError on deserialization failure so callers can decide
        whether to treat corrupt state as absent.
        """
        with _lock:
            try:
                with db_session(self._db_path) as conn:
                    row = conn.execute(
                        "SELECT value FROM ui_state WHERE key = ?",
                        (key,),
                    ).fetchone()
                if not row:
                    return None
                parsed = json.loads(row["value"])
                return parsed if isinstance(parsed, dict) else None
            except (json.JSONDecodeError, KeyError) as exc:
                raise RuntimeError(
                    f"Failed to get state for key '{key}': {exc}"
                ) from exc
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to get state for key '{key}': {exc}"
                ) from exc

    def get_all_state(self) -> Dict[str, Any]:
        """Retrieve all stored state as a flat ``{key: value}`` dict."""
        with _lock:
            try:
                with db_session(self._db_path) as conn:
                    rows = conn.execute(
                        "SELECT key, value FROM ui_state ORDER BY updated_at DESC"
                    ).fetchall()
                return {row["key"]: json.loads(row["value"]) for row in rows}
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to retrieve all state: {exc}"
                ) from exc

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def set_state(self, key: str, value: Dict[str, Any]) -> None:
        """Persist *value* under *key*, overwriting any existing entry.

        Raises RuntimeError if *value* is not JSON-serializable or the DB
        write fails.
        """
        with _lock:
            try:
                json_value = json.dumps(value)
            except (TypeError, ValueError) as exc:
                raise RuntimeError(
                    f"Failed to set state for key '{key}': {exc}"
                ) from exc
            try:
                with db_session(self._db_path) as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO ui_state (key, value, updated_at) "
                        "VALUES (?, ?, datetime('now'))",
                        (key, json_value),
                    )
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to set state for key '{key}': {exc}"
                ) from exc

    def delete_state(self, key: str) -> bool:
        """Remove *key* from the store. Returns True if a row was deleted."""
        with _lock:
            try:
                with db_session(self._db_path) as conn:
                    cursor = conn.execute(
                        "DELETE FROM ui_state WHERE key = ?",
                        (key,),
                    )
                return cursor.rowcount > 0
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to delete state for key '{key}': {exc}"
                ) from exc


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_state_manager: Optional[StateManager] = None
_manager_lock = threading.Lock()


def get_state_manager() -> StateManager:
    """Return the process-wide :class:`StateManager` singleton (lazy init)."""
    global _state_manager
    if _state_manager is None:
        with _manager_lock:
            if _state_manager is None:
                _state_manager = StateManager()
    return _state_manager
