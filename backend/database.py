*(Only the `_migrate_price_alerts` function needs to change — add the `sound_type` migration block. The rest of the 1 300-line file is unchanged.)*

The full replacement for that function:

```python
def _migrate_price_alerts(cursor) -> None:
    """Add missing columns to price_alerts table."""
    cols = {row[1] for row in cursor.execute("PRAGMA table_info(price_alerts)").fetchall()}
    if not cols:
        return
    if 'notification_sent' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN notification_sent INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("Migration applied: added notification_sent to price_alerts table")
    if 'fired_at' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN fired_at TEXT DEFAULT NULL"
        )
        logger.info("Migration applied: added fired_at to price_alerts table")
    if 'fire_count' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN fire_count INTEGER NOT NULL DEFAULT 0"
        )
        logger.info("Migration applied: added fire_count to price_alerts table")
    if 'sound_type' not in cols:
        cursor.execute(
            "ALTER TABLE price_alerts ADD COLUMN sound_type TEXT NOT NULL DEFAULT 'default'"
        )
        logger.info("Migration applied: added sound_type to price_alerts table")
```