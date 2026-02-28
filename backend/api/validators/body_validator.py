"""
TickerPulse AI v3.0 - Generic JSON Schema Body Validator Decorator

Provides a reusable @validate_body decorator for enforcing request body structure.
Raises ValidationError (400) on schema violations, preventing bad input from
reaching business logic.

Usage:
    @route('/api/path')
    @validate_body({'ticker': str, 'quantity': int})
    def endpoint():
        data = request.json
        # data is guaranteed to have 'ticker' (str) and 'quantity' (int)
"""

from functools import wraps
from flask import request
from backend.core.error_handlers import ValidationError


def validate_body(schema: dict):
    """Decorator: validate request JSON body against a type schema.

    Parameters
    ----------
    schema : dict
        Mapping of field_name → type. All fields are required.
        Supported types: str, int, float, bool, dict, list, type(None).

    Raises
    ------
    ValidationError
        - If body is missing or not valid JSON
        - If required field is missing
        - If field has wrong type

    Returns
    -------
    function
        Decorated route handler. Caller can safely access request.json[field].

    Example
    -------
    >>> @app.route('/stocks', methods=['POST'])
    ... @validate_body({'ticker': str, 'name': str})
    ... def add_stock():
    ...     data = request.json
    ...     # Both 'ticker' and 'name' are guaranteed to be strings
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Validate body exists and is JSON
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                raise ValidationError(
                    'Request body must be valid JSON object',
                    error_code='INVALID_INPUT'
                )

            # Validate all required fields and types
            missing = []
            type_errors = []

            for field, expected_type in schema.items():
                if field not in data:
                    missing.append(field)
                    continue

                value = data[field]
                # Handle None explicitly if type is type(None)
                if expected_type is type(None):
                    if value is not None:
                        type_errors.append(
                            f"Field '{field}' must be null, got {type(value).__name__}"
                        )
                # Check type match
                elif not isinstance(value, expected_type):
                    type_errors.append(
                        f"Field '{field}' must be {expected_type.__name__}, "
                        f"got {type(value).__name__}"
                    )

            if missing:
                raise ValidationError(
                    f"Missing required fields: {', '.join(missing)}",
                    error_code='MISSING_FIELD'
                )

            if type_errors:
                raise ValidationError(
                    f"Type validation failed: {'; '.join(type_errors)}",
                    error_code='INVALID_TYPE'
                )

            # Validation passed; call original handler
            return fn(*args, **kwargs)

        return wrapper
    return decorator
