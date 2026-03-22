"""
WorldTraffic Control - FastAPI application entry point. v0.4.0

Lifecycle:
  startup  -> init_db (create tables) -> start broadcast + camera background tasks
  shutdown -> cancel both tasks -> close DB pool -> close provider connections

Endpoints:
  GET /              - health check
  GET /api/status    - provider / intervals / connection count / Gemini + DB state
  GET /api/snapshot  - combined snapshot (aircraft + detections)
  GET /api/cameras   - camera metadata list
  WS  /ws/live       - live combined broadcast stream

History endpoints (Phase 4 - SQLite):
  GET /api/history/aircraft   - recent aircraft observations
  GET /api/history/detections - recent Gemini camera detections
  GET /api/history/cameras    - recent camera snapshot cycles
  GET /api/history/summary    - aggregated statistics

History API notes:
  - Logging failures will never crash or stall the live feed.
  - DB writes are fire-and-forget asyncio.create_task() calls.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import close_db, init_db
from app.schemas import (
    AircraftHistoryResponse,
    CameraList,
    CameraSnapshotHistoryResponse,
    CombinedFeatureCollection,
    DetectionHistoryResponse,
    HistorySummary,
    ServiceStatus,
)
from app.services.broadcaster import broadcast_loop, build_combined_snapshot, manager
from app.services.camera_registry import get_all_cameras
from app.services.cameras import camera_fetch_loop
from app.services.providers.factory import factory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB, launch background tasks. Shutdown: cancel + cleanup."""
    logger.info(
        "Starting WorldTraffic Control v0.4.0 | Provider: %s | "
        "Broadcast: %.1fs | Camera: %.0fs | Gemini: %s | DB: %s",
        settings.aircraft_provider,
        settings.broadcast_interval,
        settings.camera_fetch_interval,
        "enabled" if settings.gemini_api_key else "disabled",
        settings.db_path,
    )

    await init_db()

    broadcast_task = asyncio.create_task(broadcast_loop(), name="broadcast_loop")
    camera_task = asyncio.create_task(camera_fetch_loop(), name="camera_fetch_loop")
    logger.info("All background tasks launched.")

    yield

    logger.info("Shutting down...")
    broadcast_task.cancel()
    camera_task.cancel()
    await asyncio.gather(broadcast_task, camera_task, return_exceptions=True)
    await factory.close()
    await close_db()
    logger.info("WorldTraffic Control shutdown complete.")


app = FastAPI(
    title="WorldTraffic Control API",
    description=(
        "Real-time geospatial tracking - aircraft via WebSocket + "
        "Gemini camera analysis (Phase 3) + SQLite history (Phase 4)."
    ),
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["health"])
async def root():
    return {"status": "ok", "service": "WorldTraffic Control", "version": "0.4.0"}


@app.get("/api/status", tags=["health"], response_model=ServiceStatus)
async def service_status():
    return ServiceStatus(
        aircraft_provider=factory.primary_type,
        broadcast_interval_seconds=settings.broadcast_interval,
        camera_fetch_interval_seconds=settings.camera_fetch_interval,
        camera_count=len(get_all_cameras()),
        active_ws_connections=len(manager.active_connections),
        gemini_enabled=bool(settings.gemini_api_key),
        db_path=settings.db_path,
    )


@app.get("/api/snapshot", tags=["data"], response_model=CombinedFeatureCollection)
async def snapshot():
    """Current combined snapshot: aircraft + camera detections."""
    return await build_combined_snapshot()


@app.get("/api/cameras", tags=["cameras"], response_model=CameraList)
async def cameras():
    """Camera metadata list. Phase 2: metadata only."""
    return CameraList(cameras=get_all_cameras())


@app.get(
    "/api/history/aircraft",
    tags=["history"],
    response_model=AircraftHistoryResponse,
    summary="Recent aircraft observations",
    description=(
        "Returns the most recent aircraft observations from SQLite, newest first. "
        "Note: logging failures do not affect the live feed."
    ),
)
async def history_aircraft(
    limit: int = Query(default=100, ge=1, le=1000, description="Max records to return"),
    offset: int = Query(default=0, ge=0, description="Records to skip"),
    callsign: Optional[str] = Query(default=None, description="Case-insensitive callsign search"),
    source: Optional[str] = Query(default=None, description="Filter by source: simulated | opensky"),
    altitude_only: bool = Query(default=False, description="Only include aircraft with altitude"),
    since: Optional[datetime] = Query(default=None, description="Inclusive lower observed_at bound"),
    until: Optional[datetime] = Query(default=None, description="Inclusive upper observed_at bound"),
):
    from app.repositories.aircraft_repo import get_recent_aircraft

    total, records = await get_recent_aircraft(
        limit=limit,
        offset=offset,
        callsign=callsign,
        source=source,
        altitude_only=altitude_only,
        since=since,
        until=until,
    )
    return AircraftHistoryResponse(
        count=len(records),
        total=total,
        limit=limit,
        offset=offset,
        records=records,
    )


@app.get(
    "/api/history/detections",
    tags=["history"],
    response_model=DetectionHistoryResponse,
    summary="Recent Gemini camera detections",
    description=(
        "Returns the most recent Gemini analysis detections. "
        "Coordinates are approximate (camera lat/lon + jitter)."
    ),
)
async def history_detections(
    limit: int = Query(default=100, ge=1, le=1000, description="Max records to return"),
    offset: int = Query(default=0, ge=0, description="Records to skip"),
    category: Optional[str] = Query(default=None, description="Filter by detection category"),
    camera_id: Optional[str] = Query(default=None, description="Filter by camera ID"),
    min_confidence: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    since: Optional[datetime] = Query(default=None, description="Inclusive lower detected_at bound"),
    until: Optional[datetime] = Query(default=None, description="Inclusive upper detected_at bound"),
):
    from app.repositories.detection_repo import get_recent_detections

    total, records = await get_recent_detections(
        limit=limit,
        offset=offset,
        category=category,
        camera_id=camera_id,
        min_confidence=min_confidence,
        since=since,
        until=until,
    )
    return DetectionHistoryResponse(
        count=len(records),
        total=total,
        limit=limit,
        offset=offset,
        records=records,
    )


@app.get(
    "/api/history/cameras",
    tags=["history"],
    response_model=CameraSnapshotHistoryResponse,
    summary="Recent camera snapshot cycles",
    description="Returns camera reachability check history (online/offline status over time).",
)
async def history_cameras(
    limit: int = Query(default=100, ge=1, le=1000),
    camera_id: Optional[str] = Query(default=None, description="Filter by camera ID"),
):
    from app.repositories.camera_repo import get_recent_camera_snapshots

    records = await get_recent_camera_snapshots(limit=limit, camera_id=camera_id)
    return CameraSnapshotHistoryResponse(count=len(records), records=records)


@app.get(
    "/api/history/summary",
    tags=["history"],
    response_model=HistorySummary,
    summary="Historical statistics summary",
    description="Aggregated counts and timestamps from the SQLite log.",
)
async def history_summary(
    category: Optional[str] = Query(default=None, description="Detection category filter"),
    camera_id: Optional[str] = Query(default=None, description="Detection camera filter"),
    min_confidence: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    source: Optional[str] = Query(default=None, description="Aircraft source filter"),
    callsign: Optional[str] = Query(default=None, description="Aircraft callsign search"),
    altitude_only: bool = Query(default=False, description="Only aircraft with altitude"),
    since: Optional[datetime] = Query(default=None, description="Inclusive lower timestamp bound"),
    until: Optional[datetime] = Query(default=None, description="Inclusive upper timestamp bound"),
):
    from app.repositories.aircraft_repo import (
        count_aircraft_observations,
        get_latest_aircraft_time,
    )
    from app.repositories.detection_repo import (
        count_detections,
        get_detection_counts_by_category,
        get_latest_detection_time,
    )

    (
        total_aircraft,
        total_detections,
        by_category,
        latest_aircraft,
        latest_detection,
    ) = await asyncio.gather(
        count_aircraft_observations(
            callsign=callsign,
            source=source,
            altitude_only=altitude_only,
            since=since,
            until=until,
        ),
        count_detections(
            category=category,
            camera_id=camera_id,
            min_confidence=min_confidence,
            since=since,
            until=until,
        ),
        get_detection_counts_by_category(
            category=category,
            camera_id=camera_id,
            min_confidence=min_confidence,
            since=since,
            until=until,
        ),
        get_latest_aircraft_time(
            callsign=callsign,
            source=source,
            altitude_only=altitude_only,
            since=since,
            until=until,
        ),
        get_latest_detection_time(
            category=category,
            camera_id=camera_id,
            min_confidence=min_confidence,
            since=since,
            until=until,
        ),
    )

    return HistorySummary(
        total_aircraft_observations=total_aircraft,
        total_detections=total_detections,
        detections_by_category=by_category,
        latest_aircraft_observed_at=latest_aircraft,
        latest_detection_detected_at=latest_detection,
    )


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """
    Live combined feed over WebSocket.
    Immediately sends the current snapshot on connect, then broadcast_loop
    pushes updates every broadcast_interval seconds.
    """
    await manager.connect(websocket)
    try:
        initial = await build_combined_snapshot()
        await websocket.send_text(initial.model_dump_json())
        while True:
            await asyncio.sleep(30)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        logger.exception("Unexpected error in /ws/live handler.")
    finally:
        manager.disconnect(websocket)
