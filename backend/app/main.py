"""
WorldTraffic Control API entry point.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import close_db, init_db
from app.schemas import (
    AnalyticsOverview,
    AnalyticsTimeseriesResponse,
    AircraftHistoryResponse,
    AlertStatusResponse,
    AlertsResponse,
    AlertsSummary,
    CameraList,
    CameraSnapshotHistoryResponse,
    CombinedFeatureCollection,
    DetectionHistoryResponse,
    HistorySummary,
    IncidentNoteUpdateRequest,
    IncidentRecord,
    IncidentStatusUpdateRequest,
    IncidentsResponse,
    ServiceStatus,
)
from app.services.analytics import get_analytics_overview, get_analytics_timeseries
from app.services.alerts import derive_alert_records, get_alerts_summary
from app.services.broadcaster import broadcast_loop, build_combined_snapshot, manager
from app.services.camera_registry import get_all_cameras
from app.services.cameras import camera_fetch_loop
from app.services.incidents import create_incident_from_alert, get_incidents
from app.services.providers.factory import factory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Starting WorldTraffic Control v0.4.0 | Provider: %s | Broadcast: %.1fs | Camera: %.0fs | Gemini: %s | DB: %s",
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
    description="Real-time geospatial tracking with history and alerts.",
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
    return await build_combined_snapshot()


@app.get("/api/cameras", tags=["cameras"], response_model=CameraList)
async def cameras():
    return CameraList(cameras=get_all_cameras())


@app.get("/api/history/aircraft", tags=["history"], response_model=AircraftHistoryResponse)
async def history_aircraft(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    callsign: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    altitude_only: bool = Query(default=False),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
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


@app.get("/api/history/detections", tags=["history"], response_model=DetectionHistoryResponse)
async def history_detections(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    category: Optional[str] = Query(default=None),
    camera_id: Optional[str] = Query(default=None),
    min_confidence: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
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


@app.get("/api/history/cameras", tags=["history"], response_model=CameraSnapshotHistoryResponse)
async def history_cameras(
    limit: int = Query(default=100, ge=1, le=1000),
    camera_id: Optional[str] = Query(default=None),
):
    from app.repositories.camera_repo import get_recent_camera_snapshots

    records = await get_recent_camera_snapshots(limit=limit, camera_id=camera_id)
    return CameraSnapshotHistoryResponse(count=len(records), records=records)


@app.get("/api/history/summary", tags=["history"], response_model=HistorySummary)
async def history_summary(
    category: Optional[str] = Query(default=None),
    camera_id: Optional[str] = Query(default=None),
    min_confidence: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    source: Optional[str] = Query(default=None),
    callsign: Optional[str] = Query(default=None),
    altitude_only: bool = Query(default=False),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
):
    from app.repositories.aircraft_repo import count_aircraft_observations, get_latest_aircraft_time
    from app.repositories.detection_repo import count_detections, get_detection_counts_by_category, get_latest_detection_time

    total_aircraft, total_detections, by_category, latest_aircraft, latest_detection = (
        await asyncio.gather(
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
    )

    return HistorySummary(
        total_aircraft_observations=total_aircraft,
        total_detections=total_detections,
        detections_by_category=by_category,
        latest_aircraft_observed_at=latest_aircraft,
        latest_detection_detected_at=latest_detection,
    )


@app.get("/api/alerts", tags=["alerts"], response_model=AlertsResponse)
async def alerts():
    alert_records = await derive_alert_records()
    return AlertsResponse(count=len(alert_records), alerts=alert_records)


@app.get("/api/alerts/summary", tags=["alerts"], response_model=AlertsSummary)
async def alerts_summary():
    return await get_alerts_summary()


@app.post("/api/alerts/{alert_id}/acknowledge", tags=["alerts"], response_model=AlertStatusResponse)
async def acknowledge_alert(alert_id: str):
    from app.repositories.alert_repo import set_alert_status

    valid_ids = {alert.id for alert in await derive_alert_records()}
    if alert_id not in valid_ids:
        raise HTTPException(status_code=404, detail="Alert not found")

    status = await set_alert_status(alert_id, "acknowledged")
    return AlertStatusResponse(id=alert_id, status=status)


@app.post("/api/alerts/{alert_id}/resolve", tags=["alerts"], response_model=AlertStatusResponse)
async def resolve_alert(alert_id: str):
    from app.repositories.alert_repo import set_alert_status

    valid_ids = {alert.id for alert in await derive_alert_records()}
    if alert_id not in valid_ids:
        raise HTTPException(status_code=404, detail="Alert not found")

    status = await set_alert_status(alert_id, "resolved")
    return AlertStatusResponse(id=alert_id, status=status)


@app.get("/api/incidents", tags=["incidents"], response_model=IncidentsResponse)
async def incidents():
    incident_records = await get_incidents()
    return IncidentsResponse(count=len(incident_records), incidents=incident_records)


@app.get("/api/incidents/{incident_id}", tags=["incidents"], response_model=IncidentRecord)
async def incident_detail(incident_id: str):
    from app.repositories.incident_repo import get_incident_by_id

    incident = await get_incident_by_id(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.post(
    "/api/incidents/from-alert/{alert_id}",
    tags=["incidents"],
    response_model=IncidentRecord,
)
async def promote_alert_to_incident(alert_id: str):
    incident = await create_incident_from_alert(alert_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return incident


@app.post("/api/incidents/{incident_id}/status", tags=["incidents"], response_model=IncidentRecord)
async def update_incident_status(
    incident_id: str, payload: IncidentStatusUpdateRequest
):
    from app.repositories.incident_repo import update_incident_status as save_status

    incident = await save_status(incident_id, payload.status)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.post("/api/incidents/{incident_id}/note", tags=["incidents"], response_model=IncidentRecord)
async def update_incident_note(
    incident_id: str, payload: IncidentNoteUpdateRequest
):
    from app.repositories.incident_repo import update_incident_note as save_note

    incident = await save_note(incident_id, payload.operator_notes)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@app.get("/api/analytics/overview", tags=["analytics"], response_model=AnalyticsOverview)
async def analytics_overview(
    category: Optional[str] = Query(default=None),
    camera_id: Optional[str] = Query(default=None),
    min_confidence: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    source: Optional[str] = Query(default=None),
    callsign: Optional[str] = Query(default=None),
    altitude_only: bool = Query(default=False),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
):
    return await get_analytics_overview(
        category=category,
        camera_id=camera_id,
        min_confidence=min_confidence,
        source=source,
        callsign=callsign,
        altitude_only=altitude_only,
        since=since,
        until=until,
    )


@app.get(
    "/api/analytics/timeseries",
    tags=["analytics"],
    response_model=AnalyticsTimeseriesResponse,
)
async def analytics_timeseries(
    category: Optional[str] = Query(default=None),
    camera_id: Optional[str] = Query(default=None),
    min_confidence: Optional[float] = Query(default=None, ge=0.0, le=1.0),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
):
    return await get_analytics_timeseries(
        category=category,
        camera_id=camera_id,
        min_confidence=min_confidence,
        since=since,
        until=until,
    )


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
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
