"""
Aircraft observations repository.

Handles writing aircraft features to the aircraft_observations table
and querying them for the history API.

All write functions are safe to call from background tasks — exceptions
are logged and swallowed so a DB write can never crash the live feed.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_factory
from app.models_db import AircraftObservation
from app.schemas import AircraftFeature, AircraftObservationRecord

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

async def log_aircraft_snapshot(features: List[AircraftFeature]) -> None:
    """
    Insert one row per aircraft feature into aircraft_observations.
    Called after each broadcast tick with the aircraft portion of the snapshot.

    Safe: any exception is caught and logged — the live feed is not affected.
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
        logger.exception("Failed to log aircraft observations — DB write skipped.")


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_recent_aircraft(
    limit: int = 100,
    callsign: Optional[str] = None,
    source: Optional[str] = None,
) -> List[AircraftObservationRecord]:
    """
    Return the most recent aircraft observations, newest first.
    Optionally filter by callsign (case-insensitive prefix) or source.
    """
    try:
        async with async_session_factory() as session:
            stmt = select(AircraftObservation).order_by(
                AircraftObservation.observed_at.desc()
            )
            if callsign:
                stmt = stmt.where(
                    AircraftObservation.callsign.ilike(f"{callsign}%")
                )
            if source:
                stmt = stmt.where(AircraftObservation.source == source)

            stmt = stmt.limit(limit)
            result = await session.execute(stmt)
            rows = result.scalars().all()

            return [
                AircraftObservationRecord(
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
                for row in rows
            ]
    except Exception:
        logger.exception("Failed to query aircraft observations.")
        return []


async def count_aircraft_observations() -> int:
    """Return the total number of aircraft observation rows."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(select(func.count()).select_from(AircraftObservation))
            return result.scalar_one()
    except Exception:
        logger.exception("Failed to count aircraft observations.")
        return 0


async def get_latest_aircraft_time() -> Optional[datetime]:
    """Return the timestamp of the most recent aircraft observation."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(func.max(AircraftObservation.observed_at))
            )
            return result.scalar_one_or_none()
    except Exception:
        logger.exception("Failed to get latest aircraft time.")
        return None
