"""
Alert derivation service.

Alerts are derived heuristically from recent stored detections. Operator status
is persisted separately in alert_states.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from math import fabs
from typing import Dict, List

from app.repositories.alert_repo import get_alert_states
from app.repositories.detection_repo import get_recent_detections
from app.schemas import AlertRecord, AlertsResponse, AlertsSummary

ALERT_LOOKBACK_HOURS = 24
ALERT_FETCH_LIMIT = 1000
CLUSTER_WINDOW_MINUTES = 10
CLUSTER_DISTANCE_DEGREES = 0.02
HIGH_CONFIDENCE_THRESHOLD = 0.9
REPEATED_CLUSTER_THRESHOLD = 3


@dataclass
class DetectionCluster:
    category: str
    camera_id: str
    latitude: float
    longitude: float
    source: str
    first_seen: datetime
    last_seen: datetime
    detections: List[object] = field(default_factory=list)

    def add(self, detection: object) -> None:
        self.detections.append(detection)
        self.last_seen = detection.detected_at
        self.latitude = (
            ((self.latitude * (len(self.detections) - 1)) + detection.latitude)
            / len(self.detections)
        )
        self.longitude = (
            ((self.longitude * (len(self.detections) - 1)) + detection.longitude)
            / len(self.detections)
        )


def _same_cluster(cluster: DetectionCluster, detection: object) -> bool:
    if cluster.category != detection.category or cluster.camera_id != detection.camera_id:
        return False

    if cluster.last_seen + timedelta(minutes=CLUSTER_WINDOW_MINUTES) < detection.detected_at:
        return False

    return (
        fabs(cluster.latitude - detection.latitude) <= CLUSTER_DISTANCE_DEGREES
        and fabs(cluster.longitude - detection.longitude) <= CLUSTER_DISTANCE_DEGREES
    )


def _cluster_detections(detections: List[object]) -> List[DetectionCluster]:
    clusters: List[DetectionCluster] = []

    for detection in detections:
        for cluster in reversed(clusters):
            if _same_cluster(cluster, detection):
                cluster.add(detection)
                break
        else:
            clusters.append(
                DetectionCluster(
                    category=detection.category,
                    camera_id=detection.camera_id,
                    latitude=detection.latitude,
                    longitude=detection.longitude,
                    source=detection.source,
                    first_seen=detection.detected_at,
                    last_seen=detection.detected_at,
                    detections=[detection],
                )
            )

    return clusters


def _qualifies(cluster: DetectionCluster) -> bool:
    max_confidence = max(detection.confidence for detection in cluster.detections)
    return (
        cluster.category == "incident"
        or len(cluster.detections) >= REPEATED_CLUSTER_THRESHOLD
        or max_confidence >= HIGH_CONFIDENCE_THRESHOLD
    )


def _severity(cluster: DetectionCluster) -> str:
    max_confidence = max(detection.confidence for detection in cluster.detections)
    if cluster.category == "incident" and max_confidence >= HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if cluster.category == "incident" or len(cluster.detections) >= REPEATED_CLUSTER_THRESHOLD:
        return "medium"
    return "low"


def _title(cluster: DetectionCluster) -> str:
    if cluster.category == "incident":
        return f"Incident detected at {cluster.camera_id}"
    if len(cluster.detections) >= REPEATED_CLUSTER_THRESHOLD:
        return f"Repeated {cluster.category} activity near {cluster.camera_id}"
    return f"High-confidence {cluster.category} detection"


def _alert_id(cluster: DetectionCluster) -> str:
    return (
        f"{cluster.category}:{cluster.camera_id}:"
        f"{round(cluster.latitude, 2):.2f}:{round(cluster.longitude, 2):.2f}:"
        f"{cluster.first_seen.strftime('%Y%m%d%H%M')}"
    )


async def derive_alert_records() -> List[AlertRecord]:
    since = datetime.now(tz=timezone.utc) - timedelta(hours=ALERT_LOOKBACK_HOURS)
    _, detections = await get_recent_detections(limit=ALERT_FETCH_LIMIT, offset=0, since=since)
    clusters = _cluster_detections(list(reversed(detections)))
    states = await get_alert_states()

    alerts: List[AlertRecord] = []
    for cluster in clusters:
      if not _qualifies(cluster):
        continue

      alert_id = _alert_id(cluster)
      alerts.append(
          AlertRecord(
              id=alert_id,
              title=_title(cluster),
              category=cluster.category,
              severity=_severity(cluster),
              timestamp=cluster.last_seen,
              latitude=cluster.latitude,
              longitude=cluster.longitude,
              source=cluster.source,
              camera_id=cluster.camera_id,
              feature_ids=[item.feature_id for item in cluster.detections],
              status=states.get(alert_id, "new"),
          )
      )

    alerts.sort(key=lambda alert: alert.timestamp, reverse=True)
    return alerts


async def get_alerts_response() -> AlertsResponse:
    alerts = await derive_alert_records()
    return AlertsResponse(count=len(alerts), alerts=alerts)


async def get_alerts_summary() -> AlertsSummary:
    alerts = await derive_alert_records()
    open_alerts = [alert for alert in alerts if alert.status != "resolved"]

    by_severity: Dict[str, int] = {}
    by_category: Dict[str, int] = {}
    for alert in open_alerts:
        by_severity[alert.severity] = by_severity.get(alert.severity, 0) + 1
        by_category[alert.category] = by_category.get(alert.category, 0) + 1

    return AlertsSummary(
        total_open_alerts=len(open_alerts),
        alerts_by_severity=by_severity,
        alerts_by_category=by_category,
    )
