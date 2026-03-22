"""
Analytics service for lightweight operational reporting.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, Iterable, Literal, Optional

from app.repositories.aircraft_repo import count_aircraft_observations
from app.repositories.detection_repo import (
    count_detections,
    get_detection_counts_by_category,
    get_detection_timeseries,
)
from app.schemas import (
    AnalyticsOverview,
    AnalyticsTimeseriesPoint,
    AnalyticsTimeseriesResponse,
    AlertRecord,
    IncidentRecord,
)
from app.services.alerts import derive_alert_records
from app.services.incidents import get_incidents


def _within_time_window(
    timestamp: datetime, since: Optional[datetime], until: Optional[datetime]
) -> bool:
    if since is not None and timestamp < since:
        return False
    if until is not None and timestamp > until:
        return False
    return True


def _filter_alerts(
    alerts: Iterable[AlertRecord],
    *,
    category: Optional[str],
    camera_id: Optional[str],
    since: Optional[datetime],
    until: Optional[datetime],
) -> list[AlertRecord]:
    filtered: list[AlertRecord] = []
    for alert in alerts:
        if category and alert.category != category:
            continue
        if camera_id and alert.camera_id != camera_id:
            continue
        if not _within_time_window(alert.timestamp, since, until):
            continue
        filtered.append(alert)
    return filtered


def _filter_incidents(
    incidents: Iterable[IncidentRecord],
    *,
    category: Optional[str],
    camera_id: Optional[str],
    since: Optional[datetime],
    until: Optional[datetime],
) -> list[IncidentRecord]:
    filtered: list[IncidentRecord] = []
    for incident in incidents:
        if category and incident.category != category:
            continue
        if camera_id and incident.camera_id != camera_id:
            continue
        if not _within_time_window(incident.created_at, since, until):
            continue
        filtered.append(incident)
    return filtered


def _choose_bucket_unit(
    since: Optional[datetime], until: Optional[datetime]
) -> Literal["hour", "day"]:
    if since is None or until is None:
        return "day"
    return "hour" if (until - since).total_seconds() <= 60 * 60 * 48 else "day"


def _bucket_key(timestamp: datetime, bucket_unit: Literal["hour", "day"]) -> datetime:
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    if bucket_unit == "hour":
        return timestamp.replace(minute=0, second=0, microsecond=0)
    return timestamp.replace(hour=0, minute=0, second=0, microsecond=0)


def _bucket_label(bucket_start: datetime, bucket_unit: Literal["hour", "day"]) -> str:
    return (
        bucket_start.strftime("%b %d %H:00")
        if bucket_unit == "hour"
        else bucket_start.strftime("%b %d")
    )


async def get_analytics_overview(
    *,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    source: Optional[str] = None,
    callsign: Optional[str] = None,
    altitude_only: bool = False,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> AnalyticsOverview:
    total_detections = await count_detections(
        category=category,
        camera_id=camera_id,
        min_confidence=min_confidence,
        since=since,
        until=until,
    )
    total_aircraft_observations = await count_aircraft_observations(
        callsign=callsign,
        source=source,
        altitude_only=altitude_only,
        since=since,
        until=until,
    )
    detections_by_category = await get_detection_counts_by_category(
        category=category,
        camera_id=camera_id,
        min_confidence=min_confidence,
        since=since,
        until=until,
    )

    alerts = _filter_alerts(
        await derive_alert_records(),
        category=category,
        camera_id=camera_id,
        since=since,
        until=until,
    )
    open_alerts_count = sum(1 for alert in alerts if alert.status != "resolved")

    incidents = _filter_incidents(
        await get_incidents(),
        category=category,
        camera_id=camera_id,
        since=since,
        until=until,
    )
    incidents_by_status: Dict[str, int] = defaultdict(int)
    for incident in incidents:
        incidents_by_status[incident.status] += 1

    return AnalyticsOverview(
        total_detections=total_detections,
        total_aircraft_observations=total_aircraft_observations,
        open_alerts_count=open_alerts_count,
        incidents_by_status=dict(incidents_by_status),
        detections_by_category=detections_by_category,
    )


async def get_analytics_timeseries(
    *,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> AnalyticsTimeseriesResponse:
    bucket_unit = _choose_bucket_unit(since, until or datetime.now(tz=timezone.utc))
    detection_rows = await get_detection_timeseries(
        bucket_unit=bucket_unit,
        category=category,
        camera_id=camera_id,
        min_confidence=min_confidence,
        since=since,
        until=until,
    )

    points: Dict[datetime, AnalyticsTimeseriesPoint] = {}
    for bucket_start_raw, count in detection_rows:
        bucket_start = datetime.fromisoformat(bucket_start_raw).replace(
            tzinfo=timezone.utc
        )
        points[bucket_start] = AnalyticsTimeseriesPoint(
            bucket_start=bucket_start,
            label=_bucket_label(bucket_start, bucket_unit),
            detections=count,
            incidents=0,
        )

    incidents = _filter_incidents(
        await get_incidents(),
        category=category,
        camera_id=camera_id,
        since=since,
        until=until,
    )
    for incident in incidents:
        bucket_start = _bucket_key(incident.created_at, bucket_unit)
        if bucket_start not in points:
            points[bucket_start] = AnalyticsTimeseriesPoint(
                bucket_start=bucket_start,
                label=_bucket_label(bucket_start, bucket_unit),
                detections=0,
                incidents=0,
            )
        points[bucket_start].incidents += 1

    sorted_points = [points[key] for key in sorted(points.keys())]
    return AnalyticsTimeseriesResponse(bucket_unit=bucket_unit, points=sorted_points)
