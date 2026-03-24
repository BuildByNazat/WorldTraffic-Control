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
from app.db import check_db_connection, close_db, init_db
from app.schemas import (
    AnalyticsOverview,
    AnalyticsTimeseriesResponse,
    AircraftHistoryResponse,
    AircraftSearchResponse,
    AircraftSearchResult,
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


def _normalized_aircraft_tokens(
    callsign: Optional[str],
    flight_identifier: Optional[str],
    stable_id: str,
    source: str,
    provider_name: Optional[str] = None,
) -> list[str]:
    return [
        value.strip().lower()
        for value in (callsign, flight_identifier, stable_id, source, provider_name)
        if value and value.strip()
    ]


def _aircraft_match_score(
    query: str,
    callsign: Optional[str],
    flight_identifier: Optional[str],
    stable_id: str,
    source: str,
    provider_name: Optional[str] = None,
) -> int:
    tokens = _normalized_aircraft_tokens(
        callsign, flight_identifier, stable_id, source, provider_name
    )
    if not tokens:
        return -1

    if any(token == query for token in tokens):
        return 400
    if callsign and callsign.lower().startswith(query):
        return 320
    if flight_identifier and flight_identifier.lower().startswith(query):
        return 300
    if stable_id.lower().startswith(query):
        return 280
    if any(query in token for token in tokens):
        return 200
    return -1


@asynccontextmanager
async def lifespan(app: FastAPI):
    broadcast_task: asyncio.Task | None = None
    camera_task: asyncio.Task | None = None

    logger.info(
        "Starting WorldTraffic Control v0.4.0 | Env: %s | Aviation mode: %s | Provider: %s | Broadcast: %.1fs | Camera: %.0fs | Gemini: %s | DB: %s",
        settings.app_env,
        settings.aviation_data_mode,
        settings.aviation_provider,
        settings.broadcast_interval,
        settings.camera_fetch_interval,
        "enabled" if settings.gemini_api_key else "disabled",
        settings.db_path,
    )
    logger.info("Configured CORS origins: %s", ", ".join(settings.cors_origins))
    if settings.public_base_url:
        logger.info("Public base URL: %s", settings.public_base_url)

    try:
        await init_db()

        broadcast_task = asyncio.create_task(broadcast_loop(), name="broadcast_loop")
        camera_task = asyncio.create_task(camera_fetch_loop(), name="camera_fetch_loop")
        logger.info("All background tasks launched.")

        yield
    except Exception:
        logger.exception("Application startup/runtime failure.")
        raise
    finally:
        logger.info("Shutting down...")

        tasks = [task for task in (broadcast_task, camera_task) if task is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        try:
            await factory.close()
        except Exception:
            logger.exception("Failed to close provider resources cleanly.")

        try:
            await close_db()
        except Exception:
            logger.exception("Failed to close database resources cleanly.")

        logger.info("WorldTraffic Control shutdown complete.")


app = FastAPI(
    title="WorldTraffic Control API",
    description="Real-time geospatial tracking with history and alerts.",
    version="0.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["health"])
async def root():
    return {"status": "ok", "service": "WorldTraffic Control", "version": "0.4.0"}


@app.get("/healthz", tags=["health"])
async def healthz():
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
async def readyz():
    if not await check_db_connection():
        raise HTTPException(status_code=503, detail="Database is not ready.")
    return {"status": "ok"}


@app.get("/api/status", tags=["health"], response_model=ServiceStatus)
async def service_status():
    provider_status = factory.last_provider_status
    return ServiceStatus(
        app_env=settings.app_env,
        aircraft_provider=factory.primary_type,
        aviation_data_mode=settings.aviation_data_mode,
        aviation_provider=settings.aviation_provider,
        aviation_provider_label=(
            provider_status.provider_label
            if provider_status
            else settings.aviation_provider.replace("_", " ").title()
        ),
        aviation_active_source=factory.active_provider_key,
        aviation_provider_healthy=(
            provider_status.healthy if provider_status else settings.aviation_provider == "simulated"
        ),
        aviation_provider_degraded=provider_status.degraded if provider_status else False,
        aviation_provider_message=provider_status.message if provider_status else None,
        aviation_last_snapshot_at=provider_status.last_snapshot_at if provider_status else None,
        simulated_mode=factory.active_provider_key == "simulated",
        opensky_configured=bool(
            settings.opensky_username and settings.opensky_password
        ),
        broadcast_interval_seconds=settings.broadcast_interval,
        camera_fetch_interval_seconds=settings.camera_fetch_interval,
        camera_count=len(get_all_cameras()),
        active_ws_connections=len(manager.active_connections),
        gemini_enabled=bool(settings.gemini_api_key),
        public_base_url=settings.public_base_url,
        db_path=settings.db_path,
    )


@app.get("/api/snapshot", tags=["data"], response_model=CombinedFeatureCollection)
async def snapshot():
    return await build_combined_snapshot()


@app.get("/api/aviation/search", tags=["aviation"], response_model=AircraftSearchResponse)
async def aviation_search(
    q: str = Query(..., min_length=1, max_length=64),
    limit: int = Query(default=8, ge=1, le=25),
):
    normalized_query = q.strip().lower()
    if not normalized_query:
        return AircraftSearchResponse(query="", count=0, results=[])

    snapshot = factory.last_snapshot or await factory.get_snapshot()

    ranked: list[tuple[int, AircraftSearchResult]] = []
    provider_label = (
        snapshot.provider_status.provider_label if snapshot.provider_status else None
    )

    for flight in snapshot.flights:
        score = _aircraft_match_score(
            normalized_query,
            flight.callsign,
            flight.flight_identifier,
            flight.stable_id,
            flight.provider,
            provider_label,
        )
        if score < 0:
            continue

        ranked.append(
            (
                score,
                AircraftSearchResult(
                    id=flight.stable_id,
                    callsign=flight.callsign,
                    flight_identifier=flight.flight_identifier,
                    latitude=flight.latitude,
                    longitude=flight.longitude,
                    altitude=round(flight.altitude_ft, 0)
                    if flight.altitude_ft is not None
                    else None,
                    heading=round(flight.heading_deg, 1)
                    if flight.heading_deg is not None
                    else None,
                    speed=round(flight.ground_speed_kts, 1)
                    if flight.ground_speed_kts is not None
                    else None,
                    source=flight.provider,
                    provider_name=provider_label or flight.provider,
                    observed_at=flight.observed_at,
                    route_origin=flight.route_origin,
                    route_destination=flight.route_destination,
                    freshness_seconds=flight.freshness_seconds,
                    stale=flight.stale,
                ),
            )
        )

    ranked.sort(
        key=lambda item: (
            -item[0],
            item[1].callsign or item[1].flight_identifier or item[1].id,
        )
    )
    results = [result for _, result in ranked[:limit]]
    return AircraftSearchResponse(query=q.strip(), count=len(results), results=results)


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
