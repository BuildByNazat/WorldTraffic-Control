"""
Alert state repository.

Stores operator status for alerts derived from stored detections.
"""

import logging
from datetime import datetime, timezone
from typing import Dict

from sqlalchemy import select

from app.db import async_session_factory
from app.models_db import AlertState

logger = logging.getLogger(__name__)


async def get_alert_states() -> Dict[str, str]:
    try:
        async with async_session_factory() as session:
            rows = (await session.execute(select(AlertState))).scalars().all()
            return {row.alert_id: row.status for row in rows}
    except Exception:
        logger.exception("Failed to query alert states.")
        return {}


async def set_alert_status(alert_id: str, status: str) -> str:
    try:
        async with async_session_factory() as session:
            row = await session.get(AlertState, alert_id)
            now = datetime.now(tz=timezone.utc)

            if row is None:
                row = AlertState(alert_id=alert_id, status=status, updated_at=now)
                session.add(row)
            else:
                row.status = status
                row.updated_at = now

            await session.commit()
            return row.status
    except Exception:
        logger.exception("Failed to update alert state for %s.", alert_id)
        raise
