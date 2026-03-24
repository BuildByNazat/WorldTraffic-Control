"""
Watchlist repository for saved aircraft.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import delete, select

from app.db import async_session_factory
from app.models_db import WatchlistEntry
from app.schemas import WatchlistEntryRecord, WatchlistEntryRequest


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def _to_record(row: WatchlistEntry) -> WatchlistEntryRecord:
    return WatchlistEntryRecord(
        id=row.id,
        aircraft_id=row.aircraft_id,
        callsign=row.callsign,
        flight_identifier=row.flight_identifier,
        source=row.source,
        provider_name=row.provider_name,
        route_origin=row.route_origin,
        route_destination=row.route_destination,
        latitude=row.latitude,
        longitude=row.longitude,
        altitude=row.altitude,
        speed=row.speed,
        heading=row.heading,
        observed_at=row.observed_at,
        created_at=row.created_at,
    )


async def list_watchlist_entries(user_id: int) -> List[WatchlistEntryRecord]:
    async with async_session_factory() as session:
        rows = (
            await session.execute(
                select(WatchlistEntry)
                .where(WatchlistEntry.user_id == user_id)
                .order_by(WatchlistEntry.created_at.desc())
            )
        ).scalars().all()
        return [_to_record(row) for row in rows]


async def get_watchlist_entry(
    user_id: int, aircraft_id: str
) -> Optional[WatchlistEntryRecord]:
    async with async_session_factory() as session:
        row = (
            await session.execute(
                select(WatchlistEntry).where(
                    WatchlistEntry.user_id == user_id,
                    WatchlistEntry.aircraft_id == aircraft_id,
                )
            )
        ).scalar_one_or_none()
        return _to_record(row) if row else None


async def upsert_watchlist_entry(
    user_id: int, payload: WatchlistEntryRequest
) -> WatchlistEntryRecord:
    async with async_session_factory() as session:
        row = (
            await session.execute(
                select(WatchlistEntry).where(
                    WatchlistEntry.user_id == user_id,
                    WatchlistEntry.aircraft_id == payload.aircraft_id,
                )
            )
        ).scalar_one_or_none()

        if row is None:
            row = WatchlistEntry(
                user_id=user_id,
                aircraft_id=payload.aircraft_id,
                created_at=_utcnow(),
            )
            session.add(row)

        row.callsign = payload.callsign
        row.flight_identifier = payload.flight_identifier
        row.source = payload.source
        row.provider_name = payload.provider_name
        row.route_origin = payload.route_origin
        row.route_destination = payload.route_destination
        row.latitude = payload.latitude
        row.longitude = payload.longitude
        row.altitude = payload.altitude
        row.speed = payload.speed
        row.heading = payload.heading
        row.observed_at = payload.observed_at

        await session.commit()
        await session.refresh(row)
        return _to_record(row)


async def remove_watchlist_entry(user_id: int, aircraft_id: str) -> bool:
    async with async_session_factory() as session:
        result = await session.execute(
            delete(WatchlistEntry).where(
                WatchlistEntry.user_id == user_id,
                WatchlistEntry.aircraft_id == aircraft_id,
            )
        )
        await session.commit()
        return (result.rowcount or 0) > 0
