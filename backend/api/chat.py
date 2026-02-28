*(only the new endpoint block — added after `chat_starters_endpoint`)*

```python
@chat_bp.route('/chat/health', methods=['GET'])
def chat_health_endpoint():
    """Health check for the chat subsystem.

    Verifies DB connectivity by querying the chat_sessions table.

    Returns:
        200 JSON {"status": "ok", "sessions_count": <int>} when healthy.
        503 JSON {"status": "error", "error": <str>} on DB failure.
    """
    try:
        with db_session() as conn:
            row = conn.execute("SELECT COUNT(*) AS cnt FROM chat_sessions").fetchone()
        return jsonify({'status': 'ok', 'sessions_count': row['cnt']})
    except Exception as exc:
        logger.warning("chat health check failed: %s", exc)
        return jsonify({'status': 'error', 'error': str(exc)}), 503
```