"""
Incident workflow service.

Promotes derived alerts into lightweight persisted incidents.
"""

from __future__ import annotations

from typing import List, Optional
from uuid import uuid4

from app.repositories.incident_repo import (
    create_incident,
    get_incident_by_alert_id,
    list_incidents,
)
from app.schemas import AlertRecord, IncidentRecord
from app.services.alerts import derive_alert_records

STATUS_ORDER = {"open": 0, "under_review": 1, "closed": 2}


def _sort_incidents(incidents: List[IncidentRecord]) -> List[IncidentRecord]:
    return sorted(
        incidents,
        key=lambda incident: (
            STATUS_ORDER.get(incident.status, 99),
            -incident.updated_at.timestamp(),
        ),
    )


async def get_incidents() -> List[IncidentRecord]:
    return _sort_incidents(await list_incidents())


async def find_alert(alert_id: str) -> Optional[AlertRecord]:
    alerts = await derive_alert_records()
    for alert in alerts:
        if alert.id == alert_id:
            return alert
    return None


async def create_incident_from_alert(alert_id: str) -> Optional[IncidentRecord]:
    existing = await get_incident_by_alert_id(alert_id)
    if existing is not None:
        return existing

    alert = await find_alert(alert_id)
    if alert is None:
        return None

    return await create_incident(
        incident_id=f"inc-{uuid4().hex[:12]}",
        title=alert.title,
        source_alert_id=alert.id,
        category=alert.category,
        severity=alert.severity,
        latitude=alert.latitude,
        longitude=alert.longitude,
        camera_id=alert.camera_id,
        related_feature_ids=alert.feature_ids,
    )
