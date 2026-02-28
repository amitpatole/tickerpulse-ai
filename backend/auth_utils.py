"""
TickerPulse AI v3.0 - Auth Utilities
LoginManager setup, User model (raw SQL), and login_required decorator.
"""

import logging
from functools import wraps

from flask import jsonify
from flask_login import LoginManager, UserMixin, current_user

from backend.database import pooled_session

logger = logging.getLogger(__name__)

login_manager = LoginManager()


class User(UserMixin):
    """Minimal user model backed by the ``users`` SQLite table.

    No ORM — raw SQL, consistent with the rest of the codebase.
    """

    def __init__(self, id: int, email: str, name: str | None) -> None:
        self.id = id
        self.email = email
        self.name = name

    @staticmethod
    def get_by_id(user_id: int) -> 'User | None':
        """Load a user from the database by primary key."""
        with pooled_session() as conn:
            row = conn.execute(
                'SELECT id, email, name FROM users WHERE id = ?',
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return User(row['id'], row['email'], row['name'])

    @staticmethod
    def upsert(google_id: str, email: str, name: str | None) -> 'User':
        """Insert or update a user by Google ID; return the User instance."""
        with pooled_session() as conn:
            conn.execute(
                """INSERT INTO users (google_id, email, name)
                   VALUES (?, ?, ?)
                   ON CONFLICT(google_id) DO UPDATE SET
                       email = excluded.email,
                       name  = excluded.name""",
                (google_id, email, name),
            )
            row = conn.execute(
                'SELECT id, email, name FROM users WHERE google_id = ?',
                (google_id,),
            ).fetchone()
        return User(row['id'], row['email'], row['name'])


@login_manager.user_loader
def load_user(user_id: str) -> 'User | None':
    """Flask-Login callback to reload the user object from the session."""
    try:
        return User.get_by_id(int(user_id))
    except (ValueError, Exception):
        return None


def login_required(f):
    """Decorator that returns a JSON 401 for unauthenticated API requests.

    Unlike ``flask_login.login_required`` (which redirects to a login page),
    this returns a machine-readable error response in the standard VO-474
    envelope: { success, error, error_code, retryable }.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({
                'success': False,
                'error': 'Authentication required',
                'error_code': 'UNAUTHORIZED',
                'retryable': False,
            }), 401
        return f(*args, **kwargs)
    return decorated