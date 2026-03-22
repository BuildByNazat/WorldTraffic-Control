"""
Aircraft observations repository.

Handles writing aircraft features to the aircraft_observations table
and querying them for the history API.

All write functions are safe to call from background tasks - exceptions
are logged and swallowed so a DB write can never crash the live feed.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, select

from app.db import async_session_factory
from app.models_db import AircraftObservation
from app.schemas import AircraftFeature, AircraftObservationRecord

logger = logging.getLogger(__name__)


def _apply_aircraft_filters(
    stmt,
    *,
    callsign: Optional[str] = None,
    source: Optional[str] = None,
    altitude_only: bool = False,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
):
    if callsign:
        stmt = stmt.where(AircraftObservation.callsign.ilike(f"%{callsign}%"))
    if source:
        stmt = stmt.where(AircraftObservation.source == source)
    if altitude_only:
        stmt = stmt.where(AircraftObservation.altitude.is_not(None))
    if since is not None:
        stmt = stmt.where(AircraftObservation.observed_at >= since)
    if until is not None:
        stmt = stmt.where(AircraftObservation.observed_at <= until)
    return stmt


def _to_aircraft_record(row: AircraftObservation) -> AircraftObservationRecord:
    return AircraftObservationRecord(
        id=row.id,
        feature_id=row.feature_id,
        callsign=row.callsign,
        latitude=row.latitude,
        longitude=row.longitude,
        altitude=row.altitude,
        heading=row.heading,
        speed=row.speed,
        source=row.source,
        observed_at=row.observed_at,
    )


async def log_aircraft_snapshot(features: List[AircraftFeature]) -> None:
    """
    Insert one row per aircraft feature into aircraft_observations.
    Called after each broadcast tick with the aircraft portion of the snapshot.

    Safe: any exception is caught and logged - the live feed is not affected.
    """
    if not features:
        return

    now = datetime.now(tz=timezone.utc)

    try:
        async with async_session_factory() as session:
            async with session.begin():
                rows = []
                for f in features:
                    p = f.properties
                    lon, lat = f.geometry.coordinates[0], f.geometry.coordinates[1]
                    rows.append(
                        AircraftObservation(
                            feature_id=p.id,
                            callsign=p.callsign or None,
                            latitude=lat,
                            longitude=lon,
                            altitude=p.altitude,
                            heading=p.heading,
                            speed=p.speed,
                            source=p.source,
                            observed_at=now,
                        )
                    )
                session.add_all(rows)
        logger.debug("Logged %d aircraft observations to DB.", len(rows))
    except Exception:
        logger.exception("Failed to log aircraft observations - DB write skipped.")


async def get_recent_aircraft(
    *,
    limit: int = 100,
    offset: int = 0,
    callsign: Optional[str] = None,
    source: Optional[str] = None,
    altitude_only: bool = False,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Tuple[int, List[AircraftObservationRecord]]:
    """
    Return paginated aircraft observations, newest first, along with the total
    number of matching rows before pagination.
    """
    try:
        async with async_session_factory() as session:
            base_stmt = _apply_aircraft_filters(
                select(AircraftObservation),
                callsign=callsign,
                source=source,
                altitude_only=altitude_only,
                since=since,
                until=until,
            )

            total_stmt = select(func.count()).select_from(base_stmt.subquery())
            query_stmt = (
                base_stmt.order_by(AircraftObservation.observed_at.desc())
                .offset(offset)
                .limit(limit)
            )

            total = (await session.execute(total_stmt)).scalar_one()
            rows = (await session.execute(query_stmt)).scalars().all()
            return total, [_to_aircraft_record(row) for row in rows]
    except Exception:
        logger.exception("Failed to query aircraft observations.")
        return 0, []


async def count_aircraft_observations(
    *,
    callsign: Optional[str] = None,
    source: Optional[str] = None,
    altitude_only: bool = False,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> int:
    """Return the total number of matching aircraft observation rows."""
    try:
        async with async_session_factory() as session:
            stmt = _apply_aircraft_filters(
                select(func.count()).select_from(AircraftObservation),
                callsign=callsign,
                source=source,
                altitude_only=altitude_only,
                since=since,
                until=until,
            )
            return (await session.execute(stmt)).scalar_one()
    except Exception:
        logger.exception("Failed to count aircraft observations.")
        return 0


async def get_latest_aircraft_time(
    *,
    callsign: Optional[str] = None,
    source: Optional[str] = None,
    altitude_only: bool = False,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Optional[datetime]:
    """Return the timestamp of the most recent matching aircraft observation."""
    try:
        async with async_session_factory() as session:
            stmt = _apply_aircraft_filters(
                select(func.max(AircraftObservation.observed_at)).select_from(
                    AircraftObservation
                ),
                callsign=callsign,
                source=source,
                altitude_only=altitude_only,
                since=since,
                until=until,
            )
            return (await session.execute(stmt)).scalar_one_or_none()
    except Exception:
        logger.exception("Failed to get latest aircraft time.")
        return None
