"""
Detection Processing — WorldTraffic Control

Validates raw Gemini JSON output using Pydantic and converts validated
detections into GeoJSON-compatible DetectionFeature objects.

⚠️  COORDINATE APPROXIMATION WARNING:
    Detections are placed at the camera's own lat/lon with a tiny offset
    to avoid exact overlap. This is an MVP approximation only.
    No actual geolocation is derived from image content.
    Future phases should use proper camera calibration or depth estimation.

Flow:
    raw JSON string
        → parse_detections()   — validates + returns List[RawDetection]
        → build_detection_features()  — converts to List[DetectionFeature]

Errors at any step produce an empty list, never a crash.
"""

import json
import logging
import random
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from app.schemas import DetectionFeature, DetectionGeometry, DetectionProperties

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic model for a single raw Gemini detection
# ---------------------------------------------------------------------------

VALID_CATEGORIES = frozenset(
    {"vehicle", "pedestrian", "aircraft", "infrastructure", "incident", "unknown"}
)


class RawDetection(BaseModel):
    """
    Represents a single detection as returned by Gemini before GeoJSON conversion.
    Strict validation so bad Gemini output is rejected cleanly.
    """
    label: str = Field(..., min_length=1, max_length=200)
    category: str = "unknown"
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        normalised = v.lower().strip()
        return normalised if normalised in VALID_CATEGORIES else "unknown"

    @field_validator("label")
    @classmethod
    def strip_label(cls, v: str) -> str:
        return v.strip()


class GeminiDetectionResponse(BaseModel):
    """Top-level wrapper matching the expected Gemini JSON structure."""
    detections: List[RawDetection] = []


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_detections(raw_json: Optional[str]) -> List[RawDetection]:
    """
    Validate a raw JSON string from the Gemini client.

    Returns a (possibly empty) list of RawDetection objects.
    Returns [] safely on any parse / validation error.
    """
    if not raw_json:
        return []

    try:
        data = json.loads(raw_json)
        parsed = GeminiDetectionResponse.model_validate(data)
        logger.info("Parsed %d valid Gemini detections.", len(parsed.detections))
        return parsed.detections
    except json.JSONDecodeError as exc:
        logger.warning("Gemini response was not valid JSON: %s", exc)
        return []
    except Exception:
        logger.exception("Gemini detection validation failed.")
        return []


# ---------------------------------------------------------------------------
# GeoJSON conversion
# ---------------------------------------------------------------------------

def build_detection_features(
    detections: List[RawDetection],
    camera_id: str,
    camera_lat: float,
    camera_lon: float,
) -> List[DetectionFeature]:
    """
    Convert validated RawDetection objects into DetectionFeature (GeoJSON Feature) objects.

    ⚠️  COORDINATE NOTE:
        Each detection is placed at the camera's lat/lon with a small random jitter
        (±0.0002°, ≈ 20 m) so stacked detections don't completely overlap on the map.
        These are NOT accurate object positions — do not treat them as such.

    Args:
        detections:   Validated list of RawDetection objects.
        camera_id:    ID of the source camera (e.g. "CAM001").
        camera_lat:   Camera's latitude (used as approximate detection origin).
        camera_lon:   Camera's longitude (used as approximate detection origin).

    Returns:
        List of DetectionFeature objects ready to be merged into the snapshot payload.
    """
    now = datetime.now(tz=timezone.utc)
    features: List[DetectionFeature] = []

    for det in detections:
        # Small jitter so overlapping detections are slightly offset on the map
        jitter_lat = camera_lat + random.uniform(-0.0002, 0.0002)
        jitter_lon = camera_lon + random.uniform(-0.0002, 0.0002)

        feature = DetectionFeature(
            geometry=DetectionGeometry(coordinates=[jitter_lon, jitter_lat]),
            properties=DetectionProperties(
                id=f"DET-{camera_id}-{uuid4().hex[:8]}",
                category=det.category,
                label=det.label,
                confidence=round(det.confidence, 3),
                # ⚠️  Approximate only — see module docstring
                latitude=jitter_lat,
                longitude=jitter_lon,
                source="gemini_camera",
                camera_id=camera_id,
                detected_at=now,
            ),
        )
        features.append(feature)

    return features
