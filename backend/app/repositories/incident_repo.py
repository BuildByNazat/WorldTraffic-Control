"""
Incident repository.

Stores lightweight operator incidents promoted from alerts.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select

from app.db import async_session_factory
from app.models_db import IncidentCase
from app.schemas import IncidentRecord

logger = logging.getLogger(__name__)


def _to_record(row: IncidentCase) -> IncidentRecord:
    return IncidentRecord(
        id=row.id,
        title=row.title,
        source_alert_id=row.source_alert_id,
        category=row.category,
        severity=row.severity,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
        latitude=row.latitude,
        longitude=row.longitude,
        camera_id=row.camera_id,
        operator_notes=row.operator_notes or "",
        related_feature_ids=json.loads(row.related_feature_ids or "[]"),
    )


async def list_incidents() -> List[IncidentRecord]:
    try:
        async with async_session_factory() as session:
            rows = (
                await session.execute(
                    select(IncidentCase).order_by(IncidentCase.updated_at.desc())
                )
            ).scalars().all()
            return [_to_record(row) for row in rows]
    except Exception:
        logger.exception("Failed to list incidents.")
        return []


async def get_incident_by_id(incident_id: str) -> Optional[IncidentRecord]:
    try:
        async with async_session_factory() as session:
            row = await session.get(IncidentCase, incident_id)
            return _to_record(row) if row else None
    except Exception:
        logger.exception("Failed to get incident %s.", incident_id)
        return None


async def get_incident_by_alert_id(alert_id: str) -> Optional[IncidentRecord]:
    try:
        async with async_session_factory() as session:
            row = (
                await session.execute(
                    select(IncidentCase).where(IncidentCase.source_alert_id == alert_id)
                )
            ).scalar_one_or_none()
            return _to_record(row) if row else None
    except Exception:
        logger.exception("Failed to get incident for alert %s.", alert_id)
        return None


async def create_incident(
    *,
    incident_id: str,
    title: str,
    source_alert_id: str,
    category: str,
    severity: str,
    latitude: float,
    longitude: float,
    camera_id: Optional[str],
    related_feature_ids: List[str],
) -> IncidentRecord:
    now = datetime.now(tz=timezone.utc)
    try:
        async with async_session_factory() as session:
            row = IncidentCase(
                id=incident_id,
                title=title,
                source_alert_id=source_alert_id,
                category=category,
                severity=severity,
                status="open",
                created_at=now,
                updated_at=now,
                latitude=latitude,
                longitude=longitude,
                camera_id=camera_id,
                operator_notes="",
                related_feature_ids=json.dumps(related_feature_ids),
            )
            session.add(row)
            await session.commit()
            return _to_record(row)
    except Exception:
        logger.exception("Failed to create incident from alert %s.", source_alert_id)
        raise


async def update_incident_status(
    incident_id: str, status: str
) -> Optional[IncidentRecord]:
    try:
        async with async_session_factory() as session:
            row = await session.get(IncidentCase, incident_id)
            if row is None:
                return None
            row.status = status
            row.updated_at = datetime.now(tz=timezone.utc)
            await session.commit()
            return _to_record(row)
    except Exception:
        logger.exception("Failed to update incident status for %s.", incident_id)
        raise


async def update_incident_note(
    incident_id: str, operator_notes: str
) -> Optional[IncidentRecord]:
    try:
        async with async_session_factory() as session:
            row = await session.get(IncidentCase, incident_id)
            if row is None:
                return None
            row.operator_notes = operator_notes
            row.updated_at = datetime.now(tz=timezone.utc)
            await session.commit()
            return _to_record(row)
    except Exception:
        logger.exception("Failed to update incident note for %s.", incident_id)
        raise
