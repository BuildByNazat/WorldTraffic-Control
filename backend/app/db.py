"""
Database setup for WorldTraffic Control.

Uses SQLAlchemy 2.x async engine backed by aiosqlite.

Usage:
    from app.db import init_db, async_session_factory

Repositories use async_session_factory() to acquire sessions.
"""

import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.models_db import Base

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------

def _make_engine() -> AsyncEngine:
    """Create the async SQLite engine, ensuring the data directory exists."""
    db_path = Path(settings.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite+aiosqlite:///{settings.db_path}"
    logger.info("Database: %s", db_path.resolve())
    return create_async_engine(
        url,
        echo=False,
        pool_pre_ping=True,
        connect_args={"timeout": 30},
    )


engine: AsyncEngine = _make_engine()

# Factory for creating new async sessions
async_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """
    Create all tables if they do not already exist.
    Called once from the FastAPI lifespan startup hook.
    """
    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
        await conn.exec_driver_sql("PRAGMA synchronous=NORMAL;")
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON;")
        await conn.exec_driver_sql("PRAGMA busy_timeout=30000;")
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized.")


async def check_db_connection() -> bool:
    """Run a lightweight readiness query against the configured database."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("Database readiness check failed.")
        return False


async def close_db() -> None:
    """Dispose the engine connection pool. Called on shutdown."""
    await engine.dispose()
    logger.info("Database closed.")
