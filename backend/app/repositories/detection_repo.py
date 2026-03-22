"""
Camera detections repository.

Handles writing Gemini detection features to the camera_detections table
and querying them for the history API.

Write functions are safe to call from background tasks — exceptions are
logged and swallowed so a DB write can never crash the live pipeline.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_factory
from app.models_db import CameraDetection
from app.schemas import DetectionFeature, DetectionRecord

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

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
        logger.exception("Failed to log camera detections — DB write skipped.")


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_recent_detections(
    limit: int = 100,
    category: Optional[str] = None,
    camera_id: Optional[str] = None,
) -> List[DetectionRecord]:
    """
    Return the most recent camera detections, newest first.
    Optionally filter by category or camera_id.
    """
    try:
        async with async_session_factory() as session:
            stmt = select(CameraDetection).order_by(
                CameraDetection.detected_at.desc()
            )
            if category:
                stmt = stmt.where(CameraDetection.category == category.lower())
            if camera_id:
                stmt = stmt.where(CameraDetection.camera_id == camera_id)

            stmt = stmt.limit(limit)
            result = await session.execute(stmt)
            rows = result.scalars().all()

            return [
                DetectionRecord(
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
                for row in rows
            ]
    except Exception:
        logger.exception("Failed to query camera detections.")
        return []


async def count_detections() -> int:
    """Return total number of detection rows."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(select(func.count()).select_from(CameraDetection))
            return result.scalar_one()
    except Exception:
        logger.exception("Failed to count detections.")
        return 0


async def get_detection_counts_by_category() -> Dict[str, int]:
    """Return a dict mapping category → count for all detections."""
    try:
        async with async_session_factory() as session:
            stmt = (
                select(CameraDetection.category, func.count())
                .group_by(CameraDetection.category)
            )
            result = await session.execute(stmt)
            return {row[0]: row[1] for row in result.all()}
    except Exception:
        logger.exception("Failed to query detection counts by category.")
        return {}


async def get_latest_detection_time() -> Optional[datetime]:
    """Return the timestamp of the most recent detection."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(func.max(CameraDetection.detected_at))
            )
            return result.scalar_one_or_none()
    except Exception:
        logger.exception("Failed to get latest detection time.")
        return None
