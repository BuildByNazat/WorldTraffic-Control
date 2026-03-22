"""
Camera snapshots repository.

Handles writing camera reachability check cycles to the camera_snapshots
table and querying them for history/uptime analysis.

Write functions are safe to call from background tasks.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session_factory
from app.models_db import CameraSnapshot
from app.schemas import CameraMetadata, CameraSnapshotRecord

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

async def log_camera_snapshot(camera: CameraMetadata) -> None:
    """
    Insert a camera snapshot row for the latest reachability check.
    Called from the camera fetch loop after each camera cycle.

    Safe: exceptions are caught and logged.
    """
    try:
        async with async_session_factory() as session:
            async with session.begin():
                row = CameraSnapshot(
                    camera_id=camera.id,
                    image_url=camera.image_url,
                    status=camera.status,
                    fetched_at=camera.fetched_at or datetime.now(tz=timezone.utc),
                )
                session.add(row)
        logger.debug("Logged snapshot for camera %s → %s.", camera.id, camera.status)
    except Exception:
        logger.exception(
            "Failed to log camera snapshot for %s — DB write skipped.", camera.id
        )


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_recent_camera_snapshots(
    limit: int = 100,
    camera_id: Optional[str] = None,
) -> List[CameraSnapshotRecord]:
    """
    Return the most recent camera snapshot records, newest first.
    Optionally filter by camera_id.
    """
    try:
        async with async_session_factory() as session:
            stmt = select(CameraSnapshot).order_by(CameraSnapshot.fetched_at.desc())
            if camera_id:
                stmt = stmt.where(CameraSnapshot.camera_id == camera_id)
            stmt = stmt.limit(limit)

            result = await session.execute(stmt)
            rows = result.scalars().all()

            return [
                CameraSnapshotRecord(
                    id=row.id,
                    camera_id=row.camera_id,
                    image_url=row.image_url,
                    status=row.status,
                    fetched_at=row.fetched_at,
                )
                for row in rows
            ]
    except Exception:
        logger.exception("Failed to query camera snapshots.")
        return []
