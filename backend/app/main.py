"""
WorldTraffic Control API entry point.
"""

import asyncio
import logging
import math
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import check_db_connection, close_db, init_db
from app.schemas import (
    AnalyticsOverview,
    AircraftAlertRuleRecord,
    AircraftAlertRuleRequest,
    AircraftAlertRuleUpdateRequest,
    AircraftAlertsResponse,
    AnalyticsTimeseriesResponse,
    AircraftHistoryResponse,
    AircraftSearchResponse,
    AircraftSearchResult,
    AlertStatusResponse,
    AuthCredentialsRequest,
    AuthSessionResponse,
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
    UserProfile,
    WatchlistEntryRequest,
    WatchlistResponse,
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


def _validate_credentials(email: str, password: str) -> None:
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


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


def _distance_nm(
    latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float
) -> float:
    radius_nm = 3440.065
    lat_a = math.radians(latitude_a)
    lat_b = math.radians(latitude_b)
    delta_lat = math.radians(latitude_b - latitude_a)
    delta_lon = math.radians(longitude_b - longitude_a)

    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * radius_nm * math.asin(math.sqrt(haversine))


def _serialize_aircraft_alert_rule(
    row,
    current_flight,
) -> AircraftAlertRuleRecord:
    current_visible = current_flight is not None
    distance_nm: Optional[float] = None

    if not row.enabled:
        status = "disabled"
        message = "Rule disabled."
    elif row.alert_type == "visible":
        status = "triggered" if current_visible else "waiting"
        message = (
            "Aircraft is currently visible in the active provider snapshot."
            if current_visible
            else "Waiting for the aircraft to appear in the active provider snapshot."
        )
    elif row.alert_type == "not_visible":
        status = "triggered" if not current_visible else "waiting"
        message = (
            "Aircraft is not currently visible in the active provider snapshot."
            if not current_visible
            else "Aircraft is still visible in the active provider snapshot."
        )
    else:
        if not current_visible:
            status = "unavailable"
            message = "Movement alert is unavailable because the aircraft is not currently visible."
        elif row.baseline_latitude is None or row.baseline_longitude is None:
            status = "unavailable"
            message = "Movement alert needs a saved position baseline from the watchlist entry."
        else:
            distance_nm = _distance_nm(
                row.baseline_latitude,
                row.baseline_longitude,
                current_flight.latitude,
                current_flight.longitude,
            )
            threshold = row.movement_nm_threshold or 25.0
            status = "triggered" if distance_nm >= threshold else "waiting"
            message = (
                f"Aircraft moved {distance_nm:.1f} NM from the saved position."
                if distance_nm >= threshold
                else f"Waiting for {threshold:.0f} NM of movement from the saved position ({distance_nm:.1f} NM so far)."
            )

    return AircraftAlertRuleRecord(
        id=row.id,
        aircraft_id=row.aircraft_id,
        watchlist_entry_id=row.watchlist_entry_id,
        callsign=row.callsign,
        flight_identifier=row.flight_identifier,
        source=row.source,
        provider_name=row.provider_name,
        alert_type=row.alert_type,
        enabled=row.enabled,
        movement_nm_threshold=row.movement_nm_threshold,
        baseline_latitude=row.baseline_latitude,
        baseline_longitude=row.baseline_longitude,
        baseline_observed_at=row.baseline_observed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        status=status,
        status_message=message,
        currently_visible=current_visible,
        current_latitude=current_flight.latitude if current_flight else None,
        current_longitude=current_flight.longitude if current_flight else None,
        current_observed_at=current_flight.observed_at if current_flight else None,
        distance_nm=distance_nm,
    )


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> UserProfile:
    from app.repositories.auth_repo import get_user_for_token

    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")

    user = await get_user_for_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Session is invalid or expired.")
    return user


async def get_optional_token(
    authorization: Optional[str] = Header(default=None),
) -> Optional[str]:
    return _extract_bearer_token(authorization)


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


@app.post("/api/auth/signup", tags=["auth"], response_model=AuthSessionResponse)
async def auth_signup(payload: AuthCredentialsRequest):
    from sqlalchemy.exc import IntegrityError

    from app.repositories.auth_repo import create_session_for_user, create_user, get_user_by_email

    email = payload.email.strip().lower()
    _validate_credentials(email, payload.password)

    existing_user = await get_user_by_email(email)
    if existing_user is not None:
        raise HTTPException(status_code=409, detail="An account with that email already exists.")

    try:
        user = await create_user(email, payload.password)
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="An account with that email already exists."
        ) from exc

    token = await create_session_for_user(user.id)
    return AuthSessionResponse(authenticated=True, user=user, token=token)


@app.post("/api/auth/signin", tags=["auth"], response_model=AuthSessionResponse)
async def auth_signin(payload: AuthCredentialsRequest):
    from app.repositories.auth_repo import create_session_for_user, get_user_by_email, verify_password

    email = payload.email.strip().lower()
    _validate_credentials(email, payload.password)

    user_row = await get_user_by_email(email)
    if user_row is None or not verify_password(payload.password, user_row.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user = UserProfile(id=user_row.id, email=user_row.email, created_at=user_row.created_at)
    token = await create_session_for_user(user.id)
    return AuthSessionResponse(authenticated=True, user=user, token=token)


@app.post("/api/auth/signout", tags=["auth"], response_model=AuthSessionResponse)
async def auth_signout(token: Optional[str] = Depends(get_optional_token)):
    from app.repositories.auth_repo import delete_session

    if token:
        await delete_session(token)
    return AuthSessionResponse(authenticated=False, user=None, token=None)


@app.get("/api/auth/me", tags=["auth"], response_model=AuthSessionResponse)
async def auth_me(token: Optional[str] = Depends(get_optional_token)):
    from app.repositories.auth_repo import get_user_for_token

    if not token:
        return AuthSessionResponse(authenticated=False, user=None, token=None)

    user = await get_user_for_token(token)
    if user is None:
        return AuthSessionResponse(authenticated=False, user=None, token=None)
    return AuthSessionResponse(authenticated=True, user=user, token=None)


@app.get("/api/watchlist", tags=["watchlist"], response_model=WatchlistResponse)
async def watchlist_list(current_user: UserProfile = Depends(get_current_user)):
    from app.repositories.watchlist_repo import list_watchlist_entries

    items = await list_watchlist_entries(current_user.id)
    return WatchlistResponse(count=len(items), items=items)


@app.post("/api/watchlist", tags=["watchlist"], response_model=WatchlistResponse)
async def watchlist_add(
    payload: WatchlistEntryRequest, current_user: UserProfile = Depends(get_current_user)
):
    from app.repositories.watchlist_repo import list_watchlist_entries, upsert_watchlist_entry

    if not payload.aircraft_id.strip():
        raise HTTPException(status_code=400, detail="Aircraft id is required.")

    await upsert_watchlist_entry(current_user.id, payload)
    items = await list_watchlist_entries(current_user.id)
    return WatchlistResponse(count=len(items), items=items)


@app.delete("/api/watchlist/{aircraft_id}", tags=["watchlist"], response_model=WatchlistResponse)
async def watchlist_remove(
    aircraft_id: str, current_user: UserProfile = Depends(get_current_user)
):
    from app.repositories.watchlist_repo import list_watchlist_entries, remove_watchlist_entry

    removed = await remove_watchlist_entry(current_user.id, aircraft_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Watchlist entry not found.")

    items = await list_watchlist_entries(current_user.id)
    return WatchlistResponse(count=len(items), items=items)


@app.get("/api/aircraft-alerts", tags=["watchlist"], response_model=AircraftAlertsResponse)
async def aircraft_alerts_list(current_user: UserProfile = Depends(get_current_user)):
    from app.repositories.aircraft_alert_repo import list_aircraft_alert_rules

    snapshot = factory.last_snapshot or await factory.get_snapshot()
    flights_by_id = {flight.stable_id: flight for flight in snapshot.flights}
    rows = await list_aircraft_alert_rules(current_user.id)
    items = [
        _serialize_aircraft_alert_rule(row, flights_by_id.get(row.aircraft_id))
        for row in rows
    ]
    return AircraftAlertsResponse(count=len(items), items=items)


@app.post("/api/aircraft-alerts", tags=["watchlist"], response_model=AircraftAlertsResponse)
async def aircraft_alerts_create(
    payload: AircraftAlertRuleRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    from app.repositories.aircraft_alert_repo import create_aircraft_alert_rule, list_aircraft_alert_rules

    movement_threshold = payload.movement_nm_threshold
    if payload.alert_type == "movement" and movement_threshold is None:
        movement_threshold = 25.0

    created, created_new = await create_aircraft_alert_rule(
        user_id=current_user.id,
        aircraft_id=payload.aircraft_id.strip(),
        alert_type=payload.alert_type,
        movement_nm_threshold=movement_threshold,
    )
    if created is None:
        raise HTTPException(
            status_code=404,
            detail="Save the aircraft to your watchlist before creating alerts.",
        )
    if not created_new:
        raise HTTPException(status_code=409, detail="Alert rule already exists.")

    snapshot = factory.last_snapshot or await factory.get_snapshot()
    flights_by_id = {flight.stable_id: flight for flight in snapshot.flights}
    rows = await list_aircraft_alert_rules(current_user.id)
    items = [
        _serialize_aircraft_alert_rule(row, flights_by_id.get(row.aircraft_id))
        for row in rows
    ]
    return AircraftAlertsResponse(count=len(items), items=items)


@app.patch(
    "/api/aircraft-alerts/{alert_id}",
    tags=["watchlist"],
    response_model=AircraftAlertsResponse,
)
async def aircraft_alerts_update(
    alert_id: int,
    payload: AircraftAlertRuleUpdateRequest,
    current_user: UserProfile = Depends(get_current_user),
):
    from app.repositories.aircraft_alert_repo import (
        list_aircraft_alert_rules,
        update_aircraft_alert_rule_enabled,
    )

    updated = await update_aircraft_alert_rule_enabled(
        current_user.id, alert_id, payload.enabled
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Aircraft alert rule not found.")

    snapshot = factory.last_snapshot or await factory.get_snapshot()
    flights_by_id = {flight.stable_id: flight for flight in snapshot.flights}
    rows = await list_aircraft_alert_rules(current_user.id)
    items = [
        _serialize_aircraft_alert_rule(row, flights_by_id.get(row.aircraft_id))
        for row in rows
    ]
    return AircraftAlertsResponse(count=len(items), items=items)


@app.delete(
    "/api/aircraft-alerts/{alert_id}",
    tags=["watchlist"],
    response_model=AircraftAlertsResponse,
)
async def aircraft_alerts_delete(
    alert_id: int, current_user: UserProfile = Depends(get_current_user)
):
    from app.repositories.aircraft_alert_repo import (
        delete_aircraft_alert_rule,
        list_aircraft_alert_rules,
    )

    deleted = await delete_aircraft_alert_rule(current_user.id, alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Aircraft alert rule not found.")

    snapshot = factory.last_snapshot or await factory.get_snapshot()
    flights_by_id = {flight.stable_id: flight for flight in snapshot.flights}
    rows = await list_aircraft_alert_rules(current_user.id)
    items = [
        _serialize_aircraft_alert_rule(row, flights_by_id.get(row.aircraft_id))
        for row in rows
    ]
    return AircraftAlertsResponse(count=len(items), items=items)


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
