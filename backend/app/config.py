"""
Centralized configuration for WorldTraffic Control.

All environment variables are read once at startup via python-dotenv.
Extend this module when adding new phases.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    """
    Immutable settings object populated from environment variables.
    Provides clear defaults and typed fields for all configuration.
    """

    # ── Aircraft data source ─────────────────────────────────────────────────
    aircraft_provider: str = "simulated"
    opensky_username: Optional[str] = None
    opensky_password: Optional[str] = None

    # ── Broadcast timing ─────────────────────────────────────────────────────
    broadcast_interval: float = 5.0  # seconds between WebSocket pushes

    # ── Camera ingestion ─────────────────────────────────────────────────────
    camera_fetch_interval: float = 60.0  # seconds between camera reachability checks

    # ── Gemini vision analysis ───────────────────────────────────────────────
    # Phase 3: set GEMINI_API_KEY to enable camera image analysis.
    # If absent, analysis is silently skipped — no crash, zero detections.
    gemini_api_key: Optional[str] = None

    # ── Database (SQLite) ───────────────────────────────────────────────────
    # SQLite persistence for historical logging. File created on startup.
    # Override DB_PATH to change location (e.g. absolute path).
    db_path: str = str(Path(__file__).parent.parent / "data" / "worldtraffic.db")

    # ── Camera seed data ─────────────────────────────────────────────────────
    # NOTE: Public DOT camera URLs are often session-gated or return HTML.
    # Replace image_url with a stable direct JPEG URL for reliable analysis.
    # TODO (Phase 5+): load cameras from DB instead of hardcoded seed data.
    default_cameras: list = field(default_factory=lambda: [
        {
            "id": "CAM001",
            "name": "I-25 at 20th St (Denver, CO)",
            "latitude": 39.757,
            "longitude": -105.002,
            "heading": 320,
            "image_url": "https://www.cotrip.org/api/v1/cctvImages/437",
        }
    ])


def _load_settings() -> Settings:
    """Load settings from environment with type coercion and validation."""
    return Settings(
        aircraft_provider=os.getenv("AIRCRAFT_PROVIDER", "simulated").lower().strip(),
        opensky_username=os.getenv("OPENSKY_USERNAME") or None,
        opensky_password=os.getenv("OPENSKY_PASSWORD") or None,
        broadcast_interval=float(os.getenv("BROADCAST_INTERVAL", "5.0")),
        camera_fetch_interval=float(os.getenv("CAMERA_FETCH_INTERVAL", "60.0")),
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        db_path=os.getenv(
            "DB_PATH",
            str(Path(__file__).parent.parent / "data" / "worldtraffic.db"),
        ),
    )


# Global singleton — import `settings` throughout the app
settings = _load_settings()

# ---------------------------------------------------------------------------
# History API Response Schemas
# ---------------------------------------------------------------------------
AIRCRAFT_PROVIDER: str = settings.aircraft_provider
OPENSKY_USERNAME: Optional[str] = settings.opensky_username
OPENSKY_PASSWORD: Optional[str] = settings.opensky_password
BROADCAST_INTERVAL: float = settings.broadcast_interval
CAMERA_FETCH_INTERVAL: float = settings.camera_fetch_interval
GEMINI_API_KEY: Optional[str] = settings.gemini_api_key
DB_PATH: str = settings.db_path
DEFAULT_CAMERAS: list = settings.default_cameras
