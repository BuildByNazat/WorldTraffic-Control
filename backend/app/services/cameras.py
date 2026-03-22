"""
Background service for traffic camera metadata ingestion + Gemini analysis.

Phase 2: checks camera URL reachability, updates status in registry.
Phase 3: if reachable and GEMINI_API_KEY is set, fetches image bytes and
         sends them to Gemini for object detection analysis.
Phase 4: after each camera check cycle, logs a CameraSnapshot row to SQLite.

Two clear failure modes are handled safely:
  1. Camera URL is unreachable → status "offline", zero detections, snapshot logged.
  2. Gemini call fails → zero detections, no crash, snapshot still logged.
  3. DB write fails → logged and swallowed, live pipeline unaffected.

⚠️  NOTE: Many DOT camera endpoints return HTML, redirects, or session-gated
          responses rather than raw JPEG. content-type is checked before analysis.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import List

import httpx

from app.config import settings
from app.schemas import DetectionFeature
from app.services.camera_registry import (
    get_all_cameras,
    update_camera,
    update_detections,
)

logger = logging.getLogger(__name__)

_CHECK_TIMEOUT = 6.0   # seconds for reachability probe
_FETCH_TIMEOUT = 10.0  # seconds for image byte download


# ---------------------------------------------------------------------------
# Reachability check
# ---------------------------------------------------------------------------

async def _check_camera_reachable(
    client: httpx.AsyncClient,
    cam_id: str,
    url: str,
) -> bool:
    """Try HEAD first; fall back to minimal GET on 405/400."""
    try:
        response = await client.head(url, timeout=_CHECK_TIMEOUT)
        if response.status_code in (405, 400, 501) or not response.is_success:
            logger.debug("Camera %s: HEAD %d → retrying with GET.", cam_id, response.status_code)
            response = await client.get(
                url,
                timeout=_CHECK_TIMEOUT,
                headers={"Range": "bytes=0-0"},
            )
        reachable = response.is_success
        if not reachable:
            logger.warning(
                "Camera %s offline. HTTP %d | URL: %s", cam_id, response.status_code, url
            )
        return reachable
    except httpx.TimeoutException:
        logger.warning("Camera %s timed out (%.1fs).", cam_id, _CHECK_TIMEOUT)
        return False
    except Exception as exc:
        logger.warning("Camera %s reachability check failed: %s", cam_id, exc)
        return False


# ---------------------------------------------------------------------------
# Image fetch
# ---------------------------------------------------------------------------

async def _fetch_image_bytes(
    client: httpx.AsyncClient,
    cam_id: str,
    url: str,
) -> bytes | None:
    """
    Download image bytes only if content-type indicates a real image.
    Returns None for HTML pages, API responses, or any fetch failure.
    """
    try:
        response = await client.get(url, timeout=_FETCH_TIMEOUT)
        if not response.is_success:
            logger.debug("Camera %s: image fetch HTTP %d.", cam_id, response.status_code)
            return None

        content_type = response.headers.get("content-type", "").lower()
        if "image" not in content_type:
            logger.debug(
                "Camera %s: content-type '%s' is not an image — skipping analysis.",
                cam_id, content_type,
            )
            return None

        return response.content

    except Exception as exc:
        logger.warning("Camera %s: image fetch failed: %s", cam_id, exc)
        return None


# ---------------------------------------------------------------------------
# Gemini analysis
# ---------------------------------------------------------------------------

async def _run_gemini_analysis(
    cam_id: str,
    cam_lat: float,
    cam_lon: float,
    image_bytes: bytes,
) -> List[DetectionFeature]:
    """Run Gemini, parse detections, return GeoJSON features. Empty list on any failure."""
    from app.services.vision.gemini_client import analyse_image_bytes
    from app.services.vision.detections import parse_detections, build_detection_features

    raw_json = await analyse_image_bytes(image_bytes)
    if raw_json is None:
        return []

    raw_detections = parse_detections(raw_json)
    if not raw_detections:
        return []

    features = build_detection_features(raw_detections, cam_id, cam_lat, cam_lon)
    logger.info("Camera %s: %d detection(s) from Gemini.", cam_id, len(features))
    return features


# ---------------------------------------------------------------------------
# Per-camera cycle
# ---------------------------------------------------------------------------

async def _process_camera(client: httpx.AsyncClient, cam) -> None:
    """Full Phase 2+3+4 cycle for a single camera."""
    now = datetime.now(tz=timezone.utc)

    reachable = await _check_camera_reachable(client, cam.id, cam.image_url)
    status = "online" if reachable else "offline"
    update_camera(cam.id, status=status, fetched_at=now)

    # ── Phase 4: log snapshot to SQLite (fire-and-forget) ──────────────────
    from app.repositories.camera_repo import log_camera_snapshot
    from app.services.camera_registry import get_camera

    updated_cam = get_camera(cam.id)
    if updated_cam:
        asyncio.create_task(log_camera_snapshot(updated_cam), name=f"db_log_cam_{cam.id}")

    # ── Phase 3: Gemini analysis ────────────────────────────────────────────
    if reachable and settings.gemini_api_key:
        image_bytes = await _fetch_image_bytes(client, cam.id, cam.image_url)
        if image_bytes:
            detections = await _run_gemini_analysis(
                cam.id, cam.latitude, cam.longitude, image_bytes
            )
            update_detections(cam.id, detections)

            # Log new detections to DB (fire-and-forget)
            if detections:
                from app.repositories.detection_repo import log_detections
                asyncio.create_task(log_detections(detections), name=f"db_log_det_{cam.id}")
        else:
            update_detections(cam.id, [])
            logger.debug("Camera %s: image unavailable — detections cleared.", cam.id)
    else:
        update_detections(cam.id, [])


# ---------------------------------------------------------------------------
# Background loop
# ---------------------------------------------------------------------------

async def camera_fetch_loop() -> None:
    """
    Infinite loop: for each camera, check reachability, optionally run
    Gemini analysis, and log to SQLite — every camera_fetch_interval seconds.
    """
    interval = settings.camera_fetch_interval
    logger.info(
        "Camera fetch loop started. Interval: %.0fs | Gemini: %s",
        interval,
        "enabled" if settings.gemini_api_key else "disabled",
    )

    async with httpx.AsyncClient(follow_redirects=True) as client:
        while True:
            cameras = get_all_cameras()
            for cam in cameras:
                try:
                    await _process_camera(client, cam)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "Unexpected error processing camera %s — skipping.", cam.id
                    )

            await asyncio.sleep(interval)
