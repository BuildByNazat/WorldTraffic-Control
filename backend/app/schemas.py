"""
Pydantic schemas for WorldTraffic Control data models.

Aircraft schemas follow the GeoJSON spec (RFC 7946).
Camera schemas represent metadata-only state.
Detection schemas represent Gemini analysis results — coordinates are APPROXIMATE.
History schemas are flat record types for the SQLite history API endpoints.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Aircraft Schemas (GeoJSON — stable)
# ---------------------------------------------------------------------------

class AircraftProperties(BaseModel):
    id: str
    callsign: str
    altitude: float = Field(..., description="Altitude in feet")
    heading: float = Field(..., ge=0, lt=360)
    speed: float = Field(..., description="Speed in knots")
    source: Literal["simulated", "opensky"] = "simulated"
    category: Literal["aircraft"] = "aircraft"


class AircraftGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float] = Field(..., min_length=2, max_length=3)


class AircraftFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: AircraftGeometry
    properties: AircraftProperties


class AircraftFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[AircraftFeature]


# ---------------------------------------------------------------------------
# Camera Schemas (Metadata Only — Phase 2)
# ---------------------------------------------------------------------------

class CameraMetadata(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    heading: Optional[float] = None
    image_url: str
    status: Literal["online", "offline", "unknown"] = "unknown"
    fetched_at: Optional[datetime] = None

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class CameraList(BaseModel):
    cameras: List[CameraMetadata]


# ---------------------------------------------------------------------------
# Detection Schemas (Phase 3 — Gemini Analysis)
#
# ⚠️  COORDINATE APPROXIMATION:
#     Detections are placed at the camera's lat/lon with a small jitter.
#     These are NOT precise object geolocations.
# ---------------------------------------------------------------------------

class DetectionProperties(BaseModel):
    id: str
    category: str
    label: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    latitude: float   # ⚠️ Approximate — camera lat/lon + jitter
    longitude: float  # ⚠️ Approximate — camera lat/lon + jitter
    source: Literal["gemini_camera"] = "gemini_camera"
    camera_id: str
    detected_at: Optional[datetime] = None

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class DetectionGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float] = Field(..., min_length=2, max_length=2)


class DetectionFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: DetectionGeometry
    properties: DetectionProperties


# ---------------------------------------------------------------------------
# Combined Snapshot Schema (Aircraft + Detections merged — live payload)
# ---------------------------------------------------------------------------

class CombinedFeatureCollection(BaseModel):
    """GeoJSON FeatureCollection holding aircraft and camera detection features."""
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[Union[AircraftFeature, DetectionFeature]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Status / Debug Schema
# ---------------------------------------------------------------------------

class ServiceStatus(BaseModel):
    status: Literal["ok"] = "ok"
    aircraft_provider: str
    broadcast_interval_seconds: float
    camera_fetch_interval_seconds: float
    camera_count: int
    active_ws_connections: int
    gemini_enabled: bool
    db_path: str


# ---------------------------------------------------------------------------
# History API Response Schemas (Phase 4 — SQLite)
# ---------------------------------------------------------------------------

class AircraftObservationRecord(BaseModel):
    """Flat record returned by GET /api/history/aircraft."""
    id: int
    feature_id: str
    callsign: Optional[str] = None
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    source: str
    observed_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class AircraftHistoryResponse(BaseModel):
    """Paginated aircraft observation results."""
    count: int
    records: List[AircraftObservationRecord]


class DetectionRecord(BaseModel):
    """Flat record returned by GET /api/history/detections."""
    id: int
    feature_id: str
    category: str
    label: str
    confidence: float
    latitude: float
    longitude: float
    source: str
    camera_id: str
    detected_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class DetectionHistoryResponse(BaseModel):
    """Paginated detection results."""
    count: int
    records: List[DetectionRecord]


class CameraSnapshotRecord(BaseModel):
    """Flat record returned by GET /api/history/cameras."""
    id: int
    camera_id: str
    image_url: str
    status: str
    fetched_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class CameraSnapshotHistoryResponse(BaseModel):
    """Paginated camera snapshot results."""
    count: int
    records: List[CameraSnapshotRecord]


class HistorySummary(BaseModel):
    """Aggregated statistics returned by GET /api/history/summary."""
    total_aircraft_observations: int
    total_detections: int
    detections_by_category: Dict[str, int]
    latest_aircraft_observed_at: Optional[datetime] = None
    latest_detection_detected_at: Optional[datetime] = None

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}
