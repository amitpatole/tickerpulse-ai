"""
TickerPulse AI v3.0 - Alert Validators
Validation helpers for price alert request payloads.
"""

_VALID_SOUND_TYPES: frozenset[str] = frozenset({'default', 'chime', 'alarm', 'silent'})


def validate_sound_type(sound_type: object) -> tuple[bool, str]:
    """Validate a sound_type value.

    Parameters
    ----------
    sound_type : object
        The candidate value to validate.

    Returns
    -------
    tuple[bool, str]
        ``(True, '')`` on success.
        ``(False, error_message)`` when the value is not a valid sound type.
    """
    if not isinstance(sound_type, str):
        return False, 'sound_type must be a string'
    if sound_type not in _VALID_SOUND_TYPES:
        return False, (
            f"Invalid sound_type '{sound_type}'. "
            f"Must be one of: {', '.join(sorted(_VALID_SOUND_TYPES))}"
        )
    return True, ''
