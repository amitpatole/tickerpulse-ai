"""
TickerPulse AI v3.0 - Portfolio Tracking API
CRUD endpoints for managing portfolio positions with live P&L and allocation data.
"""

import logging
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from backend.database import db_session
from backend.core.error_handlers import handle_api_errors, ValidationError, NotFoundError

logger = logging.getLogger(__name__)

portfolio_bp = Blueprint('portfolio', __name__, url_prefix='/api')


@portfolio_bp.route('/portfolio', methods=['GET'])
@handle_api_errors
def get_portfolio():
    """Return all active positions with live prices and P&L calculations.

    Joins portfolio_positions with ai_ratings for current_price data.
    Computes per-position cost_basis, market_value, pnl, pnl_pct, allocation_pct
    and aggregate summary totals.
    """
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT
                p.id,
                p.ticker,
                p.quantity,
                p.avg_cost,
                p.currency,
                p.notes,
                p.opened_at,
                r.current_price,
                r.price_change,
                r.price_change_pct
            FROM portfolio_positions p
            LEFT JOIN ai_ratings r ON r.ticker = p.ticker
            WHERE p.is_active = 1
            ORDER BY p.opened_at DESC
            """
        ).fetchall()

    positions = []
    total_cost = 0.0
    total_value = 0.0

    for row in rows:
        pos = dict(row)
        cost_basis = pos['quantity'] * pos['avg_cost']
        current_price = pos.get('current_price')

        if current_price is not None:
            market_value = pos['quantity'] * current_price
            pnl = market_value - cost_basis
            pnl_pct = (pnl / cost_basis * 100) if cost_basis else 0.0
        else:
            market_value = None
            pnl = None
            pnl_pct = None

        pos['cost_basis'] = round(cost_basis, 4)
        pos['market_value'] = round(market_value, 4) if market_value is not None else None
        pos['pnl'] = round(pnl, 4) if pnl is not None else None
        pos['pnl_pct'] = round(pnl_pct, 4) if pnl_pct is not None else None

        total_cost += cost_basis
        if market_value is not None:
            total_value += market_value

        positions.append(pos)

    # Compute allocation percentages against total market value (or cost if no prices)
    alloc_base = total_value if total_value > 0 else total_cost
    for pos in positions:
        val = pos['market_value'] if pos['market_value'] is not None else pos['cost_basis']
        pos['allocation_pct'] = round(val / alloc_base * 100, 2) if alloc_base > 0 else None

    total_pnl = (total_value - total_cost) if total_value > 0 else None
    total_pnl_pct = (
        round((total_pnl / total_cost) * 100, 4)
        if total_pnl is not None and total_cost > 0
        else None
    )

    return jsonify({
        'positions': positions,
        'summary': {
            'total_value': round(total_value, 4),
            'total_cost': round(total_cost, 4),
            'total_pnl': round(total_pnl, 4) if total_pnl is not None else None,
            'total_pnl_pct': total_pnl_pct,
            'position_count': len(positions),
        },
    })


@portfolio_bp.route('/portfolio', methods=['POST'])
@handle_api_errors
def add_position():
    """Add a new portfolio position.

    Required body fields: ticker (str), quantity (float > 0), avg_cost (float > 0).
    Optional: currency (str, default 'USD'), notes (str).
    Returns 201 with the new position id.
    """
    data = request.get_json(silent=True) or {}

    ticker = str(data.get('ticker', '')).strip().upper()
    if not ticker:
        raise ValidationError('ticker is required', error_code='MISSING_FIELD')

    try:
        quantity = float(data['quantity'])
        if quantity <= 0:
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise ValidationError('quantity must be a positive number', error_code='INVALID_INPUT')

    try:
        avg_cost = float(data['avg_cost'])
        if avg_cost <= 0:
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise ValidationError('avg_cost must be a positive number', error_code='INVALID_INPUT')

    currency = str(data.get('currency', 'USD') or 'USD').strip().upper()
    notes = data.get('notes') or None

    with db_session() as conn:
        cursor = conn.execute(
            """
            INSERT INTO portfolio_positions (ticker, quantity, avg_cost, currency, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ticker, quantity, avg_cost, currency, notes),
        )
        position_id = cursor.lastrowid

    logger.info("Portfolio position added: %s x%s @ %s", ticker, quantity, avg_cost)
    return jsonify({'id': position_id, 'ticker': ticker, 'message': 'Position added'}), 201


@portfolio_bp.route('/portfolio/<int:position_id>', methods=['PUT'])
@handle_api_errors
def update_position(position_id: int):
    """Update an existing portfolio position.

    Accepts any combination of: quantity, avg_cost, currency, notes.
    Returns 404 if position not found or already removed.
    """
    data = request.get_json(silent=True) or {}
    if not data:
        raise ValidationError('Request body is required', error_code='MISSING_FIELD')

    updates: dict = {}

    if 'quantity' in data:
        try:
            q = float(data['quantity'])
            if q <= 0:
                raise ValueError
            updates['quantity'] = q
        except (TypeError, ValueError):
            raise ValidationError('quantity must be a positive number', error_code='INVALID_INPUT')

    if 'avg_cost' in data:
        try:
            c = float(data['avg_cost'])
            if c <= 0:
                raise ValueError
            updates['avg_cost'] = c
        except (TypeError, ValueError):
            raise ValidationError('avg_cost must be a positive number', error_code='INVALID_INPUT')

    if 'currency' in data:
        updates['currency'] = str(data['currency'] or 'USD').strip().upper()

    if 'notes' in data:
        updates['notes'] = data['notes'] or None

    if not updates:
        raise ValidationError('No valid fields provided for update', error_code='INVALID_INPUT')

    set_clause = ', '.join(f'{k} = ?' for k in updates)
    values = list(updates.values()) + [position_id]

    with db_session() as conn:
        result = conn.execute(
            f'UPDATE portfolio_positions SET {set_clause} WHERE id = ? AND is_active = 1',
            values,
        )
        if result.rowcount == 0:
            raise NotFoundError(f'Position {position_id} not found')

    logger.info("Portfolio position %d updated: %s", position_id, updates)
    return jsonify({'id': position_id, 'message': 'Position updated'})


@portfolio_bp.route('/portfolio/<int:position_id>', methods=['DELETE'])
@handle_api_errors
def delete_position(position_id: int):
    """Soft-delete a portfolio position (sets is_active = 0).

    Returns 404 if position not found or already removed.
    """
    with db_session() as conn:
        result = conn.execute(
            'UPDATE portfolio_positions SET is_active = 0 WHERE id = ? AND is_active = 1',
            (position_id,),
        )
        if result.rowcount == 0:
            raise NotFoundError(f'Position {position_id} not found')

    logger.info("Portfolio position %d removed", position_id)
    return jsonify({'id': position_id, 'message': 'Position removed'})


@portfolio_bp.route('/portfolio/snapshots', methods=['GET'])
@handle_api_errors
def get_portfolio_snapshots():
    """Return daily portfolio snapshots for historical P&L charts.

    Query parameters:
        days (int): Number of calendar days of history to return.
                    Default 90, capped at 365.

    Returns a list of snapshot objects sorted ascending by date, each
    containing snapshot_date, total_value, total_cost, pnl, and pnl_pct.
    """
    try:
        days = int(request.args.get('days', 90))
        if days <= 0:
            days = 90
        days = min(days, 365)
    except (TypeError, ValueError):
        days = 90

    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime('%Y-%m-%d')

    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT snapshot_date, total_value, total_cost
            FROM portfolio_snapshots
            WHERE snapshot_date >= ?
            ORDER BY snapshot_date ASC
            """,
            (cutoff,),
        ).fetchall()

    snapshots = []
    for row in rows:
        d = dict(row)
        pnl = d['total_value'] - d['total_cost']
        d['pnl'] = round(pnl, 4)
        d['pnl_pct'] = (
            round(pnl / d['total_cost'] * 100, 4)
            if d['total_cost'] > 0
            else None
        )
        snapshots.append(d)

    return jsonify({'snapshots': snapshots, 'count': len(snapshots)})
