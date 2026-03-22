"""
Camera detections repository.

Handles writing Gemini detection features to the camera_detections table
and querying them for the history API.

Write functions are safe to call from background tasks - exceptions are
logged and swallowed so a DB write can never crash the live pipeline.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, select

from app.db import async_session_factory
from app.models_db import CameraDetection
from app.schemas import DetectionFeature, DetectionRecord

logger = logging.getLogger(__name__)


def _apply_detection_filters(
    stmt,
    *,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
):
    if category:
        stmt = stmt.where(CameraDetection.category == category.lower())
    if camera_id:
        stmt = stmt.where(CameraDetection.camera_id == camera_id)
    if min_confidence is not None:
        stmt = stmt.where(CameraDetection.confidence >= min_confidence)
    if since is not None:
        stmt = stmt.where(CameraDetection.detected_at >= since)
    if until is not None:
        stmt = stmt.where(CameraDetection.detected_at <= until)
    return stmt


def _to_detection_record(row: CameraDetection) -> DetectionRecord:
    return DetectionRecord(
        id=row.id,
        feature_id=row.feature_id,
        category=row.category,
        label=row.label,
        confidence=row.confidence,
        latitude=row.latitude,
        longitude=row.longitude,
        source=row.source,
        camera_id=row.camera_id,
        detected_at=row.detected_at,
    )


async def log_detections(features: List[DetectionFeature]) -> None:
    """
    Insert one row per detection into camera_detections.
    Called after each camera analysis cycle has produced new features.

    Safe: exceptions are caught and logged.
    """
    if not features:
        return

    try:
        async with async_session_factory() as session:
            async with session.begin():
                rows = []
                for f in features:
                    p = f.properties
                    lon, lat = f.geometry.coordinates[0], f.geometry.coordinates[1]
                    rows.append(
                        CameraDetection(
                            feature_id=p.id,
                            category=p.category,
                            label=p.label,
                            confidence=p.confidence,
                            latitude=lat,
                            longitude=lon,
                            source=p.source,
                            camera_id=p.camera_id,
                            detected_at=p.detected_at or datetime.now(tz=timezone.utc),
                        )
                    )
                session.add_all(rows)
        logger.debug("Logged %d camera detections to DB.", len(rows))
    except Exception:
        logger.exception("Failed to log camera detections - DB write skipped.")


async def get_recent_detections(
    *,
    limit: int = 100,
    offset: int = 0,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Tuple[int, List[DetectionRecord]]:
    """
    Return paginated camera detections, newest first, along with the total
    number of matching rows before pagination.
    """
    try:
        async with async_session_factory() as session:
            base_stmt = _apply_detection_filters(
                select(CameraDetection),
                category=category,
                camera_id=camera_id,
                min_confidence=min_confidence,
                since=since,
                until=until,
            )

            total_stmt = select(func.count()).select_from(base_stmt.subquery())
            query_stmt = (
                base_stmt.order_by(CameraDetection.detected_at.desc())
                .offset(offset)
                .limit(limit)
            )

            total = (await session.execute(total_stmt)).scalar_one()
            rows = (await session.execute(query_stmt)).scalars().all()
            return total, [_to_detection_record(row) for row in rows]
    except Exception:
        logger.exception("Failed to query camera detections.")
        return 0, []


async def count_detections(
    *,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> int:
    """Return the total number of matching detection rows."""
    try:
        async with async_session_factory() as session:
            stmt = _apply_detection_filters(
                select(func.count()).select_from(CameraDetection),
                category=category,
                camera_id=camera_id,
                min_confidence=min_confidence,
                since=since,
                until=until,
            )
            return (await session.execute(stmt)).scalar_one()
    except Exception:
        logger.exception("Failed to count detections.")
        return 0


async def get_detection_counts_by_category(
    *,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Dict[str, int]:
    """Return a dict mapping category -> count for matching detections."""
    try:
        async with async_session_factory() as session:
            stmt = _apply_detection_filters(
                select(CameraDetection.category, func.count())
                .select_from(CameraDetection)
                .group_by(CameraDetection.category),
                category=category,
                camera_id=camera_id,
                min_confidence=min_confidence,
                since=since,
                until=until,
            )
            result = await session.execute(stmt)
            return {row[0]: row[1] for row in result.all()}
    except Exception:
        logger.exception("Failed to query detection counts by category.")
        return {}


async def get_latest_detection_time(
    *,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
    min_confidence: Optional[float] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Optional[datetime]:
    """Return the timestamp of the most recent matching detection."""
    try:
        async with async_session_factory() as session:
            stmt = _apply_detection_filters(
                select(func.max(CameraDetection.detected_at)).select_from(CameraDetection),
                category=category,
                camera_id=camera_id,
                min_confidence=min_confidence,
                since=since,
                until=until,
            )
            return (await session.execute(stmt)).scalar_one_or_none()
    except Exception:
        logger.exception("Failed to get latest detection time.")
        return None
