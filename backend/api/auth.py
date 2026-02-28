```python
"""
TickerPulse AI v3.0 - Google OAuth Authentication Routes
OAuth 2.0 login flow: initiate, callback, logout, and current-user info.
"""

import logging

from flask import Blueprint, redirect, url_for, jsonify
from flask_login import login_user, logout_user, current_user

from backend.config import Config
from backend.auth_utils import User
from backend.core.error_handlers import UnauthorizedError, handle_api_errors

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

_google = None


def init_oauth(app) -> None:
    global _google
    from authlib.integrations.flask_client import OAuth
    oauth = OAuth(app)
    _google = oauth.register(
        name='google',
        client_id=Config.GOOGLE_CLIENT_ID,
        client_secret=Config.GOOGLE_CLIENT_SECRET,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'},
    )


@auth_bp.route('/google')
def google_login():
    redirect_uri = url_for('auth.google_callback', _external=True)
    return _google.authorize_redirect(redirect_uri)


@auth_bp.route('/google/callback')
@handle_api_errors
def google_callback():
    try:
        token = _google.authorize_access_token()
    except Exception as exc:
        exc_name = type(exc).__name__
        exc_msg = str(exc).lower()
        if 'mismatch' in exc_name.lower() or 'state' in exc_msg:
            raise UnauthorizedError('OAuth state mismatch — possible CSRF attempt')
        logger.exception("OAuth callback failed")
        return redirect(f"{Config.FRONTEND_URL}/login?error=auth_failed")

    try:
        userinfo = token.get('userinfo')
        if userinfo is None:
            userinfo = _google.userinfo()
        user = User.upsert(userinfo['sub'], userinfo['email'], userinfo.get('name'))
        login_user(user, remember=True)
        logger.info("User authenticated: %s", userinfo['email'])
        return redirect(f"{Config.FRONTEND_URL}/")
    except Exception:
        logger.exception("OAuth callback failed after token exchange")
        return redirect(f"{Config.FRONTEND_URL}/login?error=auth_failed")


@auth_bp.route('/logout')
@handle_api_errors
def logout():
    logout_user()
    return redirect(f"{Config.FRONTEND_URL}/login")


@auth_bp.route('/me')
@handle_api_errors
def me():
    if not current_user.is_authenticated:
        raise UnauthorizedError('Not authenticated')
    return jsonify({'id': current_user.id, 'email': current_user.email, 'name': current_user.name})
```