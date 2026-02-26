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
    ---
    tags:
      - Watchlist
    summary: List all watchlist groups
    responses:
      200:
        description: All watchlist groups ordered by sort_order.
        schema:
          type: array
          items:
            $ref: '#/definitions/WatchlistGroup'
    """
    groups = get_all_watchlists()
    return jsonify(groups), 200


@watchlist_bp.route('/', methods=['POST'])
def create_watchlist_route():
    """Create a new named watchlist group.
    ---
    tags:
      - Watchlist
    summary: Create a watchlist group
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
          properties:
            name:
              type: string
              example: Tech Stocks
    responses:
      201:
        description: Watchlist group created.
        schema:
          $ref: '#/definitions/WatchlistGroup'
      400:
        description: Missing or empty name, name too long, or duplicate name.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Watchlist
    summary: Get a watchlist with its tickers
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
    responses:
      200:
        description: Watchlist with ordered ticker list.
        schema:
          $ref: '#/definitions/WatchlistDetail'
      404:
        description: Watchlist not found.
        schema:
          $ref: '#/definitions/Error'
    """
    wl = get_watchlist(watchlist_id)
    if wl is None:
        return jsonify({'error': f'Watchlist {watchlist_id} not found'}), 404
    return jsonify(wl), 200


@watchlist_bp.route('/<int:watchlist_id>', methods=['PUT'])
def rename_watchlist_route(watchlist_id: int):
    """Rename a watchlist group.
    ---
    tags:
      - Watchlist
    summary: Rename a watchlist group
    consumes:
      - application/json
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
          properties:
            name:
              type: string
              example: New Name
    responses:
      200:
        description: Watchlist renamed.
        schema:
          $ref: '#/definitions/WatchlistGroup'
      400:
        description: Missing or empty name, name too long, or duplicate name.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Watchlist not found.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Watchlist
    summary: Delete a watchlist group
    description: >
      Deletes the watchlist and all stock membership records for it.
      The last remaining watchlist cannot be deleted.
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
    responses:
      200:
        description: Watchlist deleted.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Cannot delete the last watchlist.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Watchlist not found.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Watchlist
    summary: Reorder watchlist groups
    description: >
      Assigns each group a new sort_order equal to its index in the
      supplied ids list.  Used to persist drag-and-drop reordering.
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - ids
          properties:
            ids:
              type: array
              items:
                type: integer
              example: [3, 1, 2]
    responses:
      200:
        description: Groups reordered successfully.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Missing or invalid ids field.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Watchlist
    summary: Add a ticker to a watchlist
    consumes:
      - application/json
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - ticker
          properties:
            ticker:
              type: string
              example: AAPL
            name:
              type: string
              description: >
                Company name. Optional — looked up from Yahoo Finance when omitted.
              example: Apple Inc.
    responses:
      200:
        description: Ticker added to watchlist.
        schema:
          type: object
          properties:
            ok:
              type: boolean
              example: true
            ticker:
              type: string
              example: AAPL
      400:
        description: Missing ticker field.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Watchlist not found or ticker unresolvable.
        schema:
          $ref: '#/definitions/Error'
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
    """Remove a ticker from a specific watchlist group.
    ---
    tags:
      - Watchlist
    summary: Remove a ticker from a watchlist
    description: >
      Removes the stock membership record only. The stock record in the
      stocks table is not deleted.
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
      - name: ticker
        in: path
        type: string
        required: true
        description: Ticker symbol to remove.
        example: AAPL
    responses:
      200:
        description: Ticker removed from watchlist.
        schema:
          $ref: '#/definitions/SuccessResponse'
      404:
        description: Watchlist or stock membership not found.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Watchlist
    summary: Reorder stocks within a watchlist
    description: >
      Assigns each ticker a new sort_order equal to its index in the
      supplied tickers list.
    consumes:
      - application/json
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - tickers
          properties:
            tickers:
              type: array
              items:
                type: string
              example: [AAPL, MSFT, GOOG]
    responses:
      200:
        description: Stocks reordered successfully.
        schema:
          $ref: '#/definitions/SuccessResponse'
      400:
        description: Missing or invalid tickers field.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Watchlist not found.
        schema:
          $ref: '#/definitions/Error'
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
    ---
    tags:
      - Watchlist
    summary: Import tickers from CSV
    description: >
      Accepts a multipart/form-data upload with a CSV file (field name: file,
      max 1 MB). The CSV must contain a column whose header is 'symbol'
      (case-insensitive). Each value is stripped and uppercased before lookup.
      Only symbols already present in the stocks table are accepted.
    consumes:
      - multipart/form-data
    parameters:
      - name: watchlist_id
        in: path
        type: integer
        required: true
        description: Watchlist identifier.
        example: 1
      - in: formData
        name: file
        type: file
        required: true
        description: CSV file with a 'symbol' column (max 1 MB, max 500 rows).
    responses:
      200:
        description: Import summary with counts of added and skipped symbols.
        schema:
          type: object
          properties:
            added:
              type: integer
              example: 10
            skipped_duplicates:
              type: integer
              example: 2
            skipped_invalid:
              type: integer
              example: 1
            invalid_symbols:
              type: array
              items:
                type: string
              example: [FAKE]
      400:
        description: Bad file type, empty file, missing symbol column, or too many rows.
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Watchlist not found.
        schema:
          $ref: '#/definitions/Error'
      413:
        description: File exceeds the 1 MB size limit.
        schema:
          $ref: '#/definitions/Error'
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