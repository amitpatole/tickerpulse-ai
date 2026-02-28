"""
TickerPulse AI v3.0 - WebSocket Connection Manager
Thread-safe registry for WebSocket connections with per-client ticker subscriptions.
Selective broadcast sends price updates only to clients that subscribed to that ticker.
"""

import json
import logging
import threading
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# Must match the SSE limit in app.py so both channels enforce the same boundary.
_MAX_PAYLOAD_BYTES = 65_536  # 64 KB


class WsManager:
    """Thread-safe registry for active WebSocket connections and their subscriptions.

    Connections are keyed by a UUID string (client_id).  Each client maintains
    a set of uppercase ticker symbols it has subscribed to.  A reverse index
    (ticker → set of client_ids) supports O(1) subscriber lookup at broadcast
    time without scanning every connection.

    Thread safety: all mutations are serialised through a single ``threading.Lock``.
    ``ws.send()`` calls are made *outside* the lock so a slow or stalled client
    cannot block broadcasts to other subscribers.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # client_id → WebSocket object (flask-sock simple_websocket.Server)
        self._connections: dict[str, Any] = {}
        # client_id → set of subscribed tickers (uppercase)
        self._subscriptions: dict[str, set[str]] = {}
        # ticker → set of subscribed client_ids  (reverse index)
        self._ticker_subscribers: dict[str, set[str]] = {}

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def register(self, ws: Any) -> str:
        """Register a new WebSocket connection and return its UUID client_id."""
        client_id = str(uuid.uuid4())
        with self._lock:
            self._connections[client_id] = ws
            self._subscriptions[client_id] = set()
        logger.debug("WS registered: %s  total=%d", client_id, len(self._connections))
        return client_id

    def unregister(self, client_id: str) -> None:
        """Remove a client and clean up its entries from every index."""
        with self._lock:
            tickers = self._subscriptions.pop(client_id, set())
            self._connections.pop(client_id, None)
            for ticker in tickers:
                subs = self._ticker_subscribers.get(ticker)
                if subs:
                    subs.discard(client_id)
                    if not subs:
                        del self._ticker_subscribers[ticker]
        logger.debug("WS unregistered: %s", client_id)

    # ------------------------------------------------------------------
    # Subscription management
    # ------------------------------------------------------------------

    def subscribe(self, client_id: str, tickers: list[str]) -> None:
        """Add *tickers* to a client's subscription set (normalised to uppercase).

        Silently caps additions so the total per-client count never exceeds
        ``Config.WS_MAX_SUBSCRIPTIONS_PER_CLIENT``.
        """
        from backend.config import Config  # local import avoids circular dependency
        normalised = {
            t.strip().upper()
            for t in tickers
            if isinstance(t, str) and t.strip()
        }
        with self._lock:
            if client_id not in self._subscriptions:
                return  # Client already disconnected before this arrived.
            current = self._subscriptions[client_id]
            new_tickers = normalised - current
            if not new_tickers:
                return
            limit = Config.WS_MAX_SUBSCRIPTIONS_PER_CLIENT
            remaining = limit - len(current)
            if remaining <= 0:
                logger.warning(
                    "WS %s: subscription limit %d reached; ignoring %d new tickers",
                    client_id, limit, len(new_tickers),
                )
                return
            to_add = set(list(new_tickers)[:remaining])
            if len(new_tickers) > remaining:
                logger.warning(
                    "WS %s: capped subscriptions at %d; dropped %d tickers",
                    client_id, limit, len(new_tickers) - remaining,
                )
            self._subscriptions[client_id].update(to_add)
            for ticker in to_add:
                self._ticker_subscribers.setdefault(ticker, set()).add(client_id)
        logger.debug("WS %s subscribed: %s", client_id, to_add)

    def unsubscribe(self, client_id: str, tickers: list[str]) -> None:
        """Remove *tickers* from a client's subscription set."""
        normalised = {
            t.strip().upper()
            for t in tickers
            if isinstance(t, str) and t.strip()
        }
        with self._lock:
            if client_id not in self._subscriptions:
                return
            self._subscriptions[client_id].difference_update(normalised)
            for ticker in normalised:
                subs = self._ticker_subscribers.get(ticker)
                if subs:
                    subs.discard(client_id)
                    if not subs:
                        del self._ticker_subscribers[ticker]
        logger.debug("WS %s unsubscribed: %s", client_id, normalised)

    def get_subscriptions(self, client_id: str) -> set[str]:
        """Return a snapshot copy of the tickers a client is subscribed to."""
        with self._lock:
            return set(self._subscriptions.get(client_id, set()))

    # ------------------------------------------------------------------
    # Broadcasting
    # ------------------------------------------------------------------

    def broadcast_to_subscribers(self, ticker: str, payload: dict) -> int:
        """Serialise *payload* as JSON and send it to every client subscribed to *ticker*.

        Returns the number of clients successfully notified.
        Connections that raise during ``send`` are removed from the registry.
        The lock is released before any ``send`` calls to avoid holding it while
        a client is slow or stalled.
        """
        ticker_upper = ticker.upper()

        try:
            serialised = json.dumps(payload)
        except (TypeError, ValueError) as exc:
            logger.error(
                "WS broadcast blocked: non-serialisable payload for %s: %s",
                ticker, exc,
            )
            return 0

        if len(serialised.encode()) > _MAX_PAYLOAD_BYTES:
            logger.error(
                "WS broadcast blocked: payload for %s exceeds %d bytes",
                ticker, _MAX_PAYLOAD_BYTES,
            )
            return 0

        # Snapshot subscribers and their ws objects while holding the lock, then
        # release before calling ws.send() so we never block other threads.
        with self._lock:
            client_ids = frozenset(self._ticker_subscribers.get(ticker_upper, set()))
            ws_snapshot: dict[str, Any] = {
                cid: self._connections[cid]
                for cid in client_ids
                if cid in self._connections
            }

        sent = 0
        dead: list[str] = []
        for client_id, ws in ws_snapshot.items():
            try:
                ws.send(serialised)
                sent += 1
            except Exception as exc:
                logger.debug("WS send failed for %s: %s", client_id, exc)
                dead.append(client_id)

        for client_id in dead:
            self.unregister(client_id)

        return sent

    def broadcast_prices(self, prices: dict) -> int:
        """Broadcast a price batch to each subscribed client as a single message.

        ``prices`` maps ticker string → price-data dict (already JSON-serialisable).
        Each client receives one ``price_batch`` message containing only the
        tickers it has subscribed to, which reduces per-cycle message count from
        N×C (tickers × clients) to at most C (one per client).

        The lock is released before any ``send()`` calls so a stalled client
        cannot block broadcasts to others.

        Returns the number of clients successfully notified.
        Stalled or broken connections are removed from the registry automatically.
        """
        if not prices:
            return 0

        from backend.config import Config  # local import avoids circular at module load
        if not Config.WS_PRICE_BROADCAST:
            return 0

        normalised = {
            k.strip().upper(): v
            for k, v in prices.items()
            if isinstance(k, str) and k.strip()
        }
        if not normalised:
            return 0

        # Snapshot per-client batches and ws objects under the lock, then
        # release before calling ws.send() to avoid holding it during I/O.
        client_sends: list[tuple[str, Any, str]] = []
        with self._lock:
            for client_id, subs in self._subscriptions.items():
                batch = {t: normalised[t] for t in subs if t in normalised}
                if not batch or client_id not in self._connections:
                    continue
                ws = self._connections[client_id]
                payload = {'type': 'price_batch', 'data': batch}
                try:
                    serialised = json.dumps(payload)
                except (TypeError, ValueError) as exc:
                    logger.debug(
                        "WS price_batch: non-serialisable payload for client %s: %s",
                        client_id, exc,
                    )
                    continue
                if len(serialised.encode()) > _MAX_PAYLOAD_BYTES:
                    logger.debug(
                        "WS price_batch for client %s exceeds %d bytes, skipping",
                        client_id, _MAX_PAYLOAD_BYTES,
                    )
                    continue
                client_sends.append((client_id, ws, serialised))

        sent = 0
        dead: list[str] = []
        for client_id, ws, serialised in client_sends:
            try:
                ws.send(serialised)
                sent += 1
            except Exception as exc:
                logger.debug("WS price_batch send failed for %s: %s", client_id, exc)
                dead.append(client_id)

        for client_id in dead:
            self.unregister(client_id)

        if sent > 0:
            logger.debug("WS price_batch broadcast: %d clients notified", sent)

        return sent

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    def connection_count(self) -> int:
        """Return the number of currently connected WebSocket clients."""
        with self._lock:
            return len(self._connections)


# Module-level singleton — imported by app.py (route handler) and
# price_refresh.py (scheduled broadcast) so they share the same registry.
ws_manager = WsManager()