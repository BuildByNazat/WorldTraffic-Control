"""
In-memory registry for traffic cameras and their latest Gemini detections.

Shared between:
  - cameras.py (writes status + detections)
  - broadcaster.py (reads detections for snapshot merge)
  - main.py (reads cameras for /api/cameras)

TODO (Phase 4): Replace with SQLite-backed persistence (aiosqlite) so
                camera history and detection logs survive restarts.
"""

from datetime import datetime
from typing import Dict, List, Optional

from app.config import DEFAULT_CAMERAS
from app.schemas import CameraMetadata, DetectionFeature

# ---------------------------------------------------------------------------
# Camera metadata registry: {camera_id → CameraMetadata}
# ---------------------------------------------------------------------------

registry: Dict[str, CameraMetadata] = {
    cam["id"]: CameraMetadata(**cam) for cam in DEFAULT_CAMERAS
}

# ---------------------------------------------------------------------------
# Detection store: {camera_id → List[DetectionFeature]}
# Latest detections per camera — overwritten on each analysis cycle.
# Empty list means: no detections (either not yet analysed, or Gemini returned none).
# ---------------------------------------------------------------------------

detection_store: Dict[str, List[DetectionFeature]] = {
    cam["id"]: [] for cam in DEFAULT_CAMERAS
}


# ---------------------------------------------------------------------------
# Camera metadata accessors
# ---------------------------------------------------------------------------

def get_all_cameras() -> List[CameraMetadata]:
    """Return all camera metadata from the registry (insertion order preserved)."""
    return list(registry.values())


def get_camera(camera_id: str) -> Optional[CameraMetadata]:
    """Return metadata for a specific camera, or None if not found."""
    return registry.get(camera_id)


def update_camera(camera_id: str, **kwargs) -> None:
    """
    Merge kwargs into the existing CameraMetadata for camera_id.
    Silently ignores unknown camera IDs.
    """
    if camera_id not in registry:
        return
    existing = registry[camera_id].model_dump()
    existing.update(kwargs)
    registry[camera_id] = CameraMetadata(**existing)


# ---------------------------------------------------------------------------
# Detection accessors
# ---------------------------------------------------------------------------

def get_all_detections() -> List[DetectionFeature]:
    """Return all current detections across all cameras as a flat list."""
    result: List[DetectionFeature] = []
    for dets in detection_store.values():
        result.extend(dets)
    return result


def update_detections(camera_id: str, detections: List[DetectionFeature]) -> None:
    """
    Replace the detection list for a given camera.
    Called after each Gemini analysis cycle.
    Silently ignores unknown camera IDs.
    """
    if camera_id in detection_store:
        detection_store[camera_id] = detections
