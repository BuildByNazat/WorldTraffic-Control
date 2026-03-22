"""
WebSocket broadcaster — WorldTraffic Control

Manages connected clients and the background broadcast loop.
Each broadcast push includes BOTH aircraft features AND camera detections
in a single CombinedFeatureCollection.

After every successful broadcast, aircraft observations and detections are
logged to SQLite in a fire-and-forget task so DB latency can never affect
the live WebSocket feed.

Broadcast payload shape:
  {
    "type": "FeatureCollection",
    "features": [
      { aircraft features with properties.category == "aircraft" },
      { detection features with properties.source == "gemini_camera" }
    ]
  }
"""

import asyncio
import logging
from typing import List

from fastapi import WebSocket

from app.config import settings
from app.schemas import AircraftFeature, CombinedFeatureCollection, DetectionFeature
from app.services.providers.factory import factory
from app.services.camera_registry import get_all_detections

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Connection manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    """Tracks all active WebSocket connections and handles broadcast fan-out."""

    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(
            "WebSocket client connected. Total active: %d",
            len(self.active_connections),
        )

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        logger.info(
            "WebSocket client disconnected. Total active: %d",
            len(self.active_connections),
        )

    async def broadcast(self, message: str) -> None:
        """Fan-out a text message to all connected clients, pruning stale sockets."""
        dead: set[WebSocket] = set()
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active_connections.discard(ws)
            logger.debug("Pruned stale WebSocket connection.")


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Snapshot builder
# ---------------------------------------------------------------------------

async def build_combined_snapshot() -> CombinedFeatureCollection:
    """
    Fetch the latest aircraft snapshot and merge in all current camera detections.
    Returns a CombinedFeatureCollection for broadcasting or HTTP response.
    """
    aircraft_snapshot = await factory.get_snapshot()
    detections = get_all_detections()
    combined_features = list(aircraft_snapshot.features) + list(detections)
    return CombinedFeatureCollection(features=combined_features)


# ---------------------------------------------------------------------------
# DB logging helper (fire-and-forget)
# ---------------------------------------------------------------------------

async def _log_aircraft_observations(
    aircraft_features: List[AircraftFeature],
) -> None:
    """
    Write aircraft observations to SQLite.
    Exceptions are caught here so a DB failure never propagates to the caller.
    """
    try:
        from app.repositories.aircraft_repo import log_aircraft_snapshot
        await log_aircraft_snapshot(aircraft_features)
    except Exception:
        logger.exception("DB logging task for aircraft failed unexpectedly.")


# ---------------------------------------------------------------------------
# Background broadcast loop
# ---------------------------------------------------------------------------

async def broadcast_loop() -> None:
    """
    Infinite loop: generates a combined snapshot every broadcast_interval seconds
    and fans it out to all connected clients.

    After each successful broadcast:
      - Aircraft observations are logged to SQLite (non-blocking task).
    """
    interval = settings.broadcast_interval
    logger.info("Broadcast loop started. Interval: %.1fs.", interval)

    while True:
        await asyncio.sleep(interval)

        try:
            combined = await build_combined_snapshot()

            # Filter aircraft features for logging
            aircraft_features = [
                f for f in combined.features
                if getattr(getattr(f, "properties", None), "category", None) == "aircraft"
            ]

            # Fire-and-forget aircraft logging — does not block the broadcast
            # Detections are logged in cameras.py to avoid duplicates.
            if aircraft_features:
                asyncio.create_task(
                    _log_aircraft_observations(aircraft_features),
                    name="db_log_aircraft",
                )

            if manager.active_connections:
                payload = combined.model_dump_json()
                await manager.broadcast(payload)
                logger.debug(
                    "Broadcast: %d client(s) | %d aircraft | %d detections.",
                    len(manager.active_connections),
                    len(aircraft_features),
                    len(combined.features) - len(aircraft_features),
                )

        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unexpected error in broadcast loop — skipping this tick.")
