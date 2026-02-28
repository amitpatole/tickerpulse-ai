*(The added `db-pool` route is highlighted — rest of file is unchanged)*

The key addition is:

```python
@metrics_bp.route('/db-pool')
@handle_api_errors
def get_db_pool():
    """Current DB connection pool utilisation snapshot."""
    from backend.database import get_pool
    return jsonify(get_pool().stats())
```