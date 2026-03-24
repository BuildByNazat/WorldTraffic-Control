"""
Repository helpers for user-configured aircraft alert rules.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import delete, select

from app.db import async_session_factory
from app.models_db import AircraftAlertRule, WatchlistEntry


def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


async def list_aircraft_alert_rules(user_id: int) -> List[AircraftAlertRule]:
    async with async_session_factory() as session:
        return (
            await session.execute(
                select(AircraftAlertRule)
                .where(AircraftAlertRule.user_id == user_id)
                .order_by(
                    AircraftAlertRule.aircraft_id.asc(),
                    AircraftAlertRule.alert_type.asc(),
                )
            )
        ).scalars().all()


async def create_aircraft_alert_rule(
    *,
    user_id: int,
    aircraft_id: str,
    alert_type: str,
    movement_nm_threshold: Optional[float],
) -> Tuple[Optional[AircraftAlertRule], bool]:
    async with async_session_factory() as session:
        watchlist_entry = (
            await session.execute(
                select(WatchlistEntry).where(
                    WatchlistEntry.user_id == user_id,
                    WatchlistEntry.aircraft_id == aircraft_id,
                )
            )
        ).scalar_one_or_none()
        if watchlist_entry is None:
            return None, False

        existing = (
            await session.execute(
                select(AircraftAlertRule).where(
                    AircraftAlertRule.user_id == user_id,
                    AircraftAlertRule.watchlist_entry_id == watchlist_entry.id,
                    AircraftAlertRule.alert_type == alert_type,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False

        now = _utcnow()
        row = AircraftAlertRule(
            user_id=user_id,
            watchlist_entry_id=watchlist_entry.id,
            aircraft_id=watchlist_entry.aircraft_id,
            callsign=watchlist_entry.callsign,
            flight_identifier=watchlist_entry.flight_identifier,
            source=watchlist_entry.source,
            provider_name=watchlist_entry.provider_name,
            alert_type=alert_type,
            enabled=True,
            movement_nm_threshold=movement_nm_threshold,
            baseline_latitude=watchlist_entry.latitude,
            baseline_longitude=watchlist_entry.longitude,
            baseline_observed_at=watchlist_entry.observed_at,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row, True


async def update_aircraft_alert_rule_enabled(
    user_id: int, alert_id: int, enabled: bool
) -> Optional[AircraftAlertRule]:
    async with async_session_factory() as session:
        row = (
            await session.execute(
                select(AircraftAlertRule).where(
                    AircraftAlertRule.id == alert_id,
                    AircraftAlertRule.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            return None
        row.enabled = enabled
        row.updated_at = _utcnow()
        await session.commit()
        await session.refresh(row)
        return row


async def delete_aircraft_alert_rule(user_id: int, alert_id: int) -> bool:
    async with async_session_factory() as session:
        result = await session.execute(
            delete(AircraftAlertRule).where(
                AircraftAlertRule.id == alert_id,
                AircraftAlertRule.user_id == user_id,
            )
        )
        await session.commit()
        return (result.rowcount or 0) > 0
