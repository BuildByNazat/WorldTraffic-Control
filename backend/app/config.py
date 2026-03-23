"""
Centralized configuration for WorldTraffic Control.

Environment loading order:
1. project-root/.env
2. backend/.env

Values from backend/.env override project-root/.env so local backend overrides
remain predictable when using the provided startup scripts.
"""

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_LOCAL_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
)


def _load_env_files() -> None:
    for env_path, override in (
        (PROJECT_ROOT / ".env", False),
        (BACKEND_DIR / ".env", True),
    ):
        if env_path.exists():
            load_dotenv(env_path, override=override)


def _get_optional_str(name: str) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _get_float(name: str, default: float, *, minimum: Optional[float] = None) -> float:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == "":
        return default

    try:
        value = float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number, received {raw_value!r}.") from exc

    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}, received {value}.")

    return value


def _get_csv(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == "":
        return default

    values = tuple(
        item.strip().rstrip("/")
        for item in raw_value.split(",")
        if item.strip()
    )
    return values or default


def _resolve_db_path(raw_path: Optional[str]) -> str:
    path = Path(raw_path.strip()) if raw_path else Path("data/worldtraffic.db")
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return str(path.resolve())


@dataclass(frozen=True)
class Settings:
    aircraft_provider: str = "simulated"
    opensky_username: Optional[str] = None
    opensky_password: Optional[str] = None
    broadcast_interval: float = 5.0
    camera_fetch_interval: float = 60.0
    gemini_api_key: Optional[str] = None
    db_path: str = str((BACKEND_DIR / "data" / "worldtraffic.db").resolve())
    cors_origins: tuple[str, ...] = DEFAULT_LOCAL_CORS_ORIGINS
    default_cameras: list = field(
        default_factory=lambda: [
            {
                "id": "CAM001",
                "name": "I-25 at 20th St (Denver, CO)",
                "latitude": 39.757,
                "longitude": -105.002,
                "heading": 320,
                "image_url": "https://www.cotrip.org/api/v1/cctvImages/437",
            }
        ]
    )


def _load_settings() -> Settings:
    _load_env_files()

    provider = (os.getenv("AIRCRAFT_PROVIDER", "simulated")).strip().lower()
    if provider not in {"simulated", "opensky"}:
        logger.warning(
            "Unsupported AIRCRAFT_PROVIDER=%r. Falling back to 'simulated'.",
            provider,
        )
        provider = "simulated"

    if provider == "opensky" and not _get_optional_str("OPENSKY_USERNAME"):
        logger.info("OpenSky is enabled without credentials. Anonymous rate limits apply.")

    return Settings(
        aircraft_provider=provider,
        opensky_username=_get_optional_str("OPENSKY_USERNAME"),
        opensky_password=_get_optional_str("OPENSKY_PASSWORD"),
        broadcast_interval=_get_float("BROADCAST_INTERVAL", 5.0, minimum=0.25),
        camera_fetch_interval=_get_float("CAMERA_FETCH_INTERVAL", 60.0, minimum=5.0),
        gemini_api_key=_get_optional_str("GEMINI_API_KEY"),
        db_path=_resolve_db_path(os.getenv("DB_PATH")),
        cors_origins=_get_csv("CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    )


settings = _load_settings()

AIRCRAFT_PROVIDER: str = settings.aircraft_provider
OPENSKY_USERNAME: Optional[str] = settings.opensky_username
OPENSKY_PASSWORD: Optional[str] = settings.opensky_password
BROADCAST_INTERVAL: float = settings.broadcast_interval
CAMERA_FETCH_INTERVAL: float = settings.camera_fetch_interval
GEMINI_API_KEY: Optional[str] = settings.gemini_api_key
DB_PATH: str = settings.db_path
CORS_ORIGINS: tuple[str, ...] = settings.cors_origins
DEFAULT_CAMERAS: list = settings.default_cameras
