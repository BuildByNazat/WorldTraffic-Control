"""
SQLAlchemy ORM models for WorldTraffic Control.

Three tables:
  aircraft_observations  — one row per aircraft per broadcast cycle
  camera_detections      — one row per Gemini detection
  camera_snapshots       — one row per camera reachability check cycle

All timestamps are stored as UTC ISO-8601 strings for maximum portability.
Primary keys use auto-incrementing integers; feature_id / camera_id are
application-level identifiers for cross-referencing with live data.

TODO (Phase 5): Add indexes on observed_at / detected_at for range queries.
TODO (Phase 5): Add foreign key from camera_detections.camera_id to
                camera_snapshots.camera_id for integrity checking.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Aircraft observations
# ---------------------------------------------------------------------------

class AircraftObservation(Base):
    """
    One aircraft at one point-in-time.
    Logged after every broadcast tick for all features in the snapshot.
    """
    __tablename__ = "aircraft_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feature_id: Mapped[str] = mapped_column(String(64), index=True)
    callsign: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    altitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(32))          # "simulated" | "opensky"
    observed_at: Mapped[datetime] = mapped_column(DateTime, index=True)


# ---------------------------------------------------------------------------
# Camera detections (Gemini analysis results)
# ---------------------------------------------------------------------------

class CameraDetection(Base):
    """
    One Gemini-detected object from one camera analysis cycle.
    ⚠️  Coordinates are approximate — camera lat/lon + jitter only.
    """
    __tablename__ = "camera_detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feature_id: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    label: Mapped[str] = mapped_column(String(200))
    confidence: Mapped[float] = mapped_column(Float)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(32))          # "gemini_camera"
    camera_id: Mapped[str] = mapped_column(String(64), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, index=True)


# ---------------------------------------------------------------------------
# Camera snapshots (per-cycle reachability + analysis metadata)
# ---------------------------------------------------------------------------

class CameraSnapshot(Base):
    """
    One reachability check cycle for one camera.
    Records the outcome and time so we can track uptime trends over time.
    """
    __tablename__ = "camera_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    camera_id: Mapped[str] = mapped_column(String(64), index=True)
    image_url: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))           # "online" | "offline"
    fetched_at: Mapped[datetime] = mapped_column(DateTime, index=True)
