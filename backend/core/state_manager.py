"""
TickerPulse AI v3.0 - State Manager
Persistent UI state backed by the ui_state SQLite table.
"""

import json
import logging
from typing import Any, Dict, Optional

from backend.database import pooled_session

logger = logging.getLogger(__name__)


class StateManager:
    """Manages UI state persistence to the ui_state SQLite table.

    All values are stored as JSON strings.  Keys are arbitrary strings;
    namespaced keys (e.g. ``'sidebar'``, ``'chart'``) are recommended.
    """

    def get_state(self, key: str) -> Optional[Any]:
        """Return the stored value for *key*, or ``None`` if not found."""
        try:
            with pooled_session() as conn:
                row = conn.execute(
                    "SELECT value FROM ui_state WHERE key = ?", (key,)
                ).fetchone()
                if row is None:
                    return None
                return json.loads(row["value"])
        except Exception as exc:
            raise RuntimeError(f"Failed to get state for key '{key}': {exc}") from exc

    def set_state(self, key: str, value: Any) -> None:
        """Persist *value* under *key* (full overwrite semantics)."""
        try:
            serialized = json.dumps(value)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(f"Failed to set state for key '{key}': {exc}") from exc
        try:
            with pooled_session() as conn:
                conn.execute(
                    """
                    INSERT INTO ui_state (key, value, updated_at)
                    VALUES (?, ?, datetime('now'))
                    ON CONFLICT(key) DO UPDATE SET
                        value      = excluded.value,
                        updated_at = excluded.updated_at
                    """,
                    (key, serialized),
                )
        except Exception as exc:
            raise RuntimeError(f"Failed to set state for key '{key}': {exc}") from exc

    def delete_state(self, key: str) -> bool:
        """Remove the entry for *key*.  Returns ``True`` if a row was deleted."""
        try:
            with pooled_session() as conn:
                cursor = conn.execute(
                    "DELETE FROM ui_state WHERE key = ?", (key,)
                )
                return cursor.rowcount > 0
        except Exception as exc:
            raise RuntimeError(
                f"Failed to delete state for key '{key}': {exc}"
            ) from exc

    def get_all_state(self) -> Dict[str, Any]:
        """Return all stored state as a flat ``{key: value}`` dict."""
        try:
            with pooled_session() as conn:
                rows = conn.execute(
                    "SELECT key, value FROM ui_state ORDER BY updated_at DESC"
                ).fetchall()
                return {row["key"]: json.loads(row["value"]) for row in rows}
        except Exception as exc:
            raise RuntimeError(f"Failed to retrieve all state: {exc}") from exc

    def merge_state(self, key: str, patch: Dict[str, Any]) -> None:
        """Partially update an entry by shallow-merging *patch* into the stored value.

        Creates the entry from *patch* if the key does not yet exist.  This
        avoids race conditions when two components update different fields of
        the same namespace key.
        """
        try:
            existing = self.get_state(key)
            if isinstance(existing, dict):
                merged = {**existing, **patch}
            else:
                merged = dict(patch)
            self.set_state(key, merged)
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(
                f"Failed to merge state for key '{key}': {exc}"
            ) from exc
