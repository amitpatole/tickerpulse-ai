```python
"""
TickerPulse AI v3.0 - Watchlist API
Blueprint exposing watchlist group management endpoints, including CSV import
and drag-and-drop reorder support.
"""

import csv
import io
import logging

from flask import Blueprint, jsonify, request

from backend.core.watchlist_manager import (
    add_stock_to_watchlist,
    create_watchlist,
    delete_watchlist,
    get_all_watchlists,
    get_watchlist,
    remove_stock_from_watchlist,
    rename_watchlist,
    reorder_watchlist,
    reorder_watchlist_groups,
)
from backend.database import db_session

logger = logging.getLogger(__name__)

watchlist_bp = Blueprint('watchlist', __name__, url_prefix='/api/watchlist')

_MAX_FILE_BYTES = 1 * 1024 * 1024  # 1 MB
_MAX_ROWS = 500
_MAX_NAME_LEN = 100


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------

@watchlist_bp.route('/', methods=['GET'])
def list_watchlists():
    """Return all watchlist groups ordered by sort_order with their stock counts.

    Returns:
        200  [{id, name, sort_order, created_at, stock_count}, ...]
    """
    groups = get_all_watchlists()
    return jsonify(groups), 200


@watchlist_bp.route('/', methods=['POST'])
def create_watchlist_route():
    """Create a new named watchlist group.

    Request body: {"name": "Tech Stocks"}

    Returns:
        201  {id, name, sort_order, stock_count}
        400  Missing or empty name, name too long, or duplicate name
    """
    body = request.get_json(silent=True) or {}
    name: str = (body.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    if len(name) > _MAX_NAME_LEN:
        return jsonify({'error': f'name must be {_MAX_NAME_LEN} characters or fewer'}), 400
    try:
        group = create_watchlist(name)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    return jsonify(group), 201


@watchlist_bp.route('/<int:watchlist_id>', methods=['GET'])
def get_watchlist_route(watchlist_id: int):
    """Return a watchlist with its ordered ticker list.

    Returns:
        200  {id, name, sort_order, created_at, tickers}
        404  Watchlist not found
    """
    wl = get_watchlist(watchlist_id)
    if wl is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404
    return jsonify(wl), 200


@watchlist_bp.route('/<int:watchlist_id>', methods=['PUT'])
def rename_watchlist_route(watchlist_id: int):
    """Rename a watchlist group.

    Request body: {"name": "New Name"}

    Returns:
        200  {id, name, sort_order, created_at}
        400  Missing or empty name, name too long, or duplicate name
        404  Watchlist not found
    """
    body = request.get_json(silent=True) or {}
    name: str = (body.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    if len(name) > _MAX_NAME_LEN:
        return jsonify({'error': f'name must be {_MAX_NAME_LEN} characters or fewer'}), 400
    try:
        updated = rename_watchlist(watchlist_id, name)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    if updated is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404
    return jsonify(updated), 200


@watchlist_bp.route('/<int:watchlist_id>', methods=['DELETE'])
def delete_watchlist_route(watchlist_id: int):
    """Delete a watchlist group and all its stock associations.

    The last watchlist cannot be deleted.

    Returns:
        200  {"ok": true}
        400  Cannot delete the last watchlist
        404  Watchlist not found
    """
    try:
        deleted = delete_watchlist(watchlist_id)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    if not deleted:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404
    return jsonify({'ok': True}), 200


# ---------------------------------------------------------------------------
# Group-level reorder
# ---------------------------------------------------------------------------

@watchlist_bp.route('/reorder', methods=['PUT'])
def reorder_groups():
    """Persist a new drag-and-drop sort order for watchlist groups.

    Request body: {"ids": [3, 1, 2]}
    Each ID is assigned sort_order equal to its index in the list.

    Returns:
        200  {"ok": true}
        400  Missing or invalid ids field
    """
    body = request.get_json(silent=True) or {}
    ids = body.get('ids')
    if not isinstance(ids, list):
        return jsonify({'error': 'ids must be a list'}), 400
    if not all(isinstance(i, int) for i in ids):
        return jsonify({'error': 'All ids must be integers'}), 400
    if len(ids) > 100:
        return jsonify({'error': 'Too many group ids'}), 400

    if not reorder_watchlist_groups(ids):
        return jsonify({'error': 'No watchlists found to reorder'}), 400

    return jsonify({'ok': True}), 200


# ---------------------------------------------------------------------------
# Stock membership within a group
# ---------------------------------------------------------------------------

@watchlist_bp.route('/<int:watchlist_id>/stocks', methods=['POST'])
def add_stock_to_group(watchlist_id: int):
    """Add a ticker to a specific watchlist group.

    Request body: {"ticker": "AAPL", "name": "Apple Inc."}
    ``name`` is optional — it will be looked up from Yahoo Finance when omitted.

    Returns:
        200  {"ok": true, "ticker": "AAPL"}
        400  Missing ticker
        404  Watchlist not found or ticker unresolvable
    """
    body = request.get_json(silent=True) or {}
    ticker: str = (body.get('ticker') or '').strip().upper()
    if not ticker:
        return jsonify({'error': 'ticker is required'}), 400

    wl = get_watchlist(watchlist_id)
    if wl is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404

    name: str | None = (body.get('name') or '').strip() or None
    success = add_stock_to_watchlist(watchlist_id, ticker, name)
    if not success:
        return jsonify({'error': f'Failed to add {ticker} to watchlist'}), 404
    return jsonify({'ok': True, 'ticker': ticker}), 200


@watchlist_bp.route('/<int:watchlist_id>/stocks/<string:ticker>', methods=['DELETE'])
def remove_stock_from_group(watchlist_id: int, ticker: str):
    """Remove a ticker from a specific watchlist group (junction row only).

    The stock record in the ``stocks`` table is not deleted.

    Returns:
        200  {"ok": true}
        404  Watchlist or stock membership not found
    """
    ticker = ticker.strip().upper()
    wl = get_watchlist(watchlist_id)
    if wl is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404

    removed = remove_stock_from_watchlist(watchlist_id, ticker)
    if not removed:
        return jsonify({'error': f'{ticker} is not in watchlist {watchlist_id}'}), 404
    return jsonify({'ok': True}), 200


# ---------------------------------------------------------------------------
# Reorder stocks within a group
# ---------------------------------------------------------------------------

@watchlist_bp.route('/<int:watchlist_id>/reorder', methods=['PUT'])
def reorder_stocks(watchlist_id: int):
    """Persist a new drag-and-drop sort order for stocks in a watchlist.

    Request body: {"tickers": ["AAPL", "MSFT", ...]}
    Each ticker is assigned sort_order equal to its index in the list.

    Returns:
        200  {"ok": true}
        400  Missing or invalid tickers field
        404  Watchlist not found
    """
    body = request.get_json(silent=True) or {}
    tickers = body.get('tickers')
    if not isinstance(tickers, list):
        return jsonify({'error': 'tickers must be a list'}), 400
    if not all(isinstance(t, str) for t in tickers):
        return jsonify({'error': 'All tickers must be strings'}), 400
    if len(tickers) > 500:
        return jsonify({'error': 'Too many tickers'}), 400

    wl = get_watchlist(watchlist_id)
    if wl is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404

    if not reorder_watchlist(watchlist_id, tickers):
        return jsonify({'error': 'Failed to reorder watchlist'}), 500

    return jsonify({'ok': True}), 200


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------

@watchlist_bp.route('/<int:watchlist_id>/import', methods=['POST'])
def import_csv(watchlist_id: int):
    """Import tickers from a CSV file into a watchlist.

    Request: multipart/form-data with field ``file`` (.csv, ≤ 1 MB).
    The CSV must contain a column whose header is ``symbol`` (case-insensitive).
    Each value is stripped of whitespace and uppercased before lookup.

    Returns:
        200  {added, skipped_duplicates, skipped_invalid, invalid_symbols}
        400  Bad file type / empty file / no symbol column / too many rows
        404  Watchlist not found
        413  File too large
    """
    # Verify watchlist exists
    wl = get_watchlist(watchlist_id)
    if wl is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404

    # Validate file presence
    if 'file' not in request.files:
        return jsonify({'error': 'No file field in request'}), 400

    upload = request.files['file']
    filename = upload.filename or ''

    if not filename.lower().endswith('.csv'):
        return jsonify({'error': 'Unsupported file type. Please upload a .csv file'}), 400

    raw = upload.read()
    if not raw:
        return jsonify({'error': 'Uploaded file is empty'}), 400

    if len(raw) > _MAX_FILE_BYTES:
        return jsonify({'error': 'File too large. Maximum size is 1 MB'}), 413

    # Decode — handle BOM gracefully
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('latin-1')

    reader = csv.DictReader(io.StringIO(text))

    # Find the symbol column (case-insensitive)
    if reader.fieldnames is None:
        return jsonify({'error': 'CSV file has no headers'}), 400

    symbol_col = next(
        (f for f in reader.fieldnames if f.strip().lower() == 'symbol'),
        None,
    )
    if symbol_col is None:
        return jsonify({'error': "CSV must contain a 'symbol' column"}), 400

    # Collect tickers, enforcing row limit
    tickers: list[str] = []
    for i, row in enumerate(reader):
        if i >= _MAX_ROWS:
            return jsonify({'error': f'CSV exceeds maximum of {_MAX_ROWS} rows'}), 400
        val = (row.get(symbol_col) or '').strip().upper()
        if val:
            tickers.append(val)

    if not tickers:
        return jsonify({'error': 'No ticker symbols found in CSV'}), 400

    # Look up which symbols exist in the stocks table
    with db_session() as conn:
        rows = conn.execute('SELECT ticker FROM stocks').fetchall()
    known_tickers = {r['ticker'].upper() for r in rows}

    added = 0
    skipped_duplicates = 0
    skipped_invalid = 0
    invalid_symbols: list[str] = []

    # Fetch tickers already in this watchlist to detect duplicates cheaply
    already_in_watchlist = set(wl.get('tickers', []))

    for ticker in tickers:
        if ticker not in known_tickers:
            skipped_invalid += 1
            invalid_symbols.append(ticker)
            continue

        if ticker in already_in_watchlist:
            skipped_duplicates += 1
            continue

        success = add_stock_to_watchlist(watchlist_id, ticker)
        if success:
            added += 1
            already_in_watchlist.add(ticker)
        else:
            # watchlist disappeared mid-import (extremely unlikely)
            skipped_invalid += 1
            invalid_symbols.append(ticker)

    return jsonify({
        'added': added,
        'skipped_duplicates': skipped_duplicates,
        'skipped_invalid': skipped_invalid,
        'invalid_symbols': invalid_symbols,
    }), 200
```