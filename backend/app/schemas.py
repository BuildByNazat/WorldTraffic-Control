"""
Pydantic schemas for WorldTraffic Control data models.
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


class AircraftProperties(BaseModel):
    id: str
    callsign: Optional[str] = None
    flight_identifier: Optional[str] = None
    altitude: float = Field(..., description="Altitude in feet")
    heading: float = Field(..., ge=0, lt=360)
    speed: float = Field(..., description="Speed in knots")
    source: str = "simulated"
    category: Literal["aircraft"] = "aircraft"
    observed_at: Optional[datetime] = None
    route_origin: Optional[str] = None
    route_destination: Optional[str] = None
    provider_name: Optional[str] = None
    freshness_seconds: Optional[float] = None
    stale: bool = False


class AircraftSearchResult(BaseModel):
    id: str
    callsign: Optional[str] = None
    flight_identifier: Optional[str] = None
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    source: str
    provider_name: Optional[str] = None
    observed_at: Optional[datetime] = None
    route_origin: Optional[str] = None
    route_destination: Optional[str] = None
    freshness_seconds: Optional[float] = None
    stale: bool = False


class AircraftSearchResponse(BaseModel):
    query: str
    count: int
    results: List[AircraftSearchResult]


class AuthCredentialsRequest(BaseModel):
    email: str
    password: str


class UserProfile(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class AuthSessionResponse(BaseModel):
    authenticated: bool
    user: Optional[UserProfile] = None
    token: Optional[str] = None


class WatchlistEntryRequest(BaseModel):
    aircraft_id: str
    callsign: Optional[str] = None
    flight_identifier: Optional[str] = None
    source: str
    provider_name: Optional[str] = None
    route_origin: Optional[str] = None
    route_destination: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    observed_at: Optional[datetime] = None


class WatchlistEntryRecord(BaseModel):
    id: int
    aircraft_id: str
    callsign: Optional[str] = None
    flight_identifier: Optional[str] = None
    source: str
    provider_name: Optional[str] = None
    route_origin: Optional[str] = None
    route_destination: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    observed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class WatchlistResponse(BaseModel):
    count: int
    items: List[WatchlistEntryRecord]


AircraftAlertType = Literal["visible", "not_visible", "movement"]
AircraftAlertStatus = Literal["triggered", "waiting", "unavailable", "disabled"]


class AircraftAlertRuleRequest(BaseModel):
    aircraft_id: str
    alert_type: AircraftAlertType
    movement_nm_threshold: Optional[float] = Field(default=None, ge=5, le=500)


class AircraftAlertRuleUpdateRequest(BaseModel):
    enabled: bool


class AircraftAlertRuleRecord(BaseModel):
    id: int
    aircraft_id: str
    watchlist_entry_id: int
    callsign: Optional[str] = None
    flight_identifier: Optional[str] = None
    source: str
    provider_name: Optional[str] = None
    alert_type: AircraftAlertType
    enabled: bool
    movement_nm_threshold: Optional[float] = None
    baseline_latitude: Optional[float] = None
    baseline_longitude: Optional[float] = None
    baseline_observed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    status: AircraftAlertStatus
    status_message: str
    currently_visible: bool
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_observed_at: Optional[datetime] = None
    distance_nm: Optional[float] = None

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class AircraftAlertsResponse(BaseModel):
    count: int
    items: List[AircraftAlertRuleRecord]


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


class DetectionProperties(BaseModel):
    id: str
    category: str
    label: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    latitude: float
    longitude: float
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


class CombinedFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: List[Union[AircraftFeature, DetectionFeature]] = Field(default_factory=list)


class ServiceStatus(BaseModel):
    status: Literal["ok"] = "ok"
    app_env: str
    auth_signup_enabled: bool
    aircraft_provider: str
    aviation_data_mode: str
    aviation_provider: str
    aviation_provider_label: str
    aviation_active_source: str
    aviation_provider_healthy: bool
    aviation_provider_degraded: bool
    aviation_provider_message: Optional[str] = None
    aviation_last_snapshot_at: Optional[datetime] = None
    simulated_mode: bool
    opensky_configured: bool
    broadcast_interval_seconds: float
    camera_fetch_interval_seconds: float
    camera_count: int
    active_ws_connections: int
    gemini_enabled: bool
    public_base_url: Optional[str] = None
    db_path: str


class AircraftObservationRecord(BaseModel):
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
    count: int
    total: int
    limit: int
    offset: int
    records: List[AircraftObservationRecord]


class DetectionRecord(BaseModel):
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
    count: int
    total: int
    limit: int
    offset: int
    records: List[DetectionRecord]


class CameraSnapshotRecord(BaseModel):
    id: int
    camera_id: str
    image_url: str
    status: str
    fetched_at: datetime

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class CameraSnapshotHistoryResponse(BaseModel):
    count: int
    records: List[CameraSnapshotRecord]


class HistorySummary(BaseModel):
    total_aircraft_observations: int
    total_detections: int
    detections_by_category: Dict[str, int]
    latest_aircraft_observed_at: Optional[datetime] = None
    latest_detection_detected_at: Optional[datetime] = None

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class AlertRecord(BaseModel):
    id: str
    title: str
    category: str
    severity: Literal["high", "medium", "low"]
    timestamp: datetime
    latitude: float
    longitude: float
    source: str
    camera_id: Optional[str] = None
    feature_ids: List[str] = Field(default_factory=list)
    status: Literal["new", "acknowledged", "resolved"]

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class AlertsResponse(BaseModel):
    count: int
    alerts: List[AlertRecord]


class AlertsSummary(BaseModel):
    total_open_alerts: int
    alerts_by_severity: Dict[str, int]
    alerts_by_category: Dict[str, int]


class AlertStatusResponse(BaseModel):
    id: str
    status: Literal["new", "acknowledged", "resolved"]


class IncidentRecord(BaseModel):
    id: str
    title: str
    source_alert_id: str
    category: str
    severity: Literal["high", "medium", "low"]
    status: Literal["open", "under_review", "closed"]
    created_at: datetime
    updated_at: datetime
    latitude: float
    longitude: float
    camera_id: Optional[str] = None
    operator_notes: str = ""
    related_feature_ids: List[str] = Field(default_factory=list)

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class IncidentsResponse(BaseModel):
    count: int
    incidents: List[IncidentRecord]


class IncidentStatusUpdateRequest(BaseModel):
    status: Literal["open", "under_review", "closed"]


class IncidentNoteUpdateRequest(BaseModel):
    operator_notes: str = ""


class AnalyticsOverview(BaseModel):
    total_detections: int
    total_aircraft_observations: int
    open_alerts_count: int
    incidents_by_status: Dict[str, int]
    detections_by_category: Dict[str, int]


class AnalyticsTimeseriesPoint(BaseModel):
    bucket_start: datetime
    label: str
    detections: int = 0
    incidents: int = 0

    model_config = {"json_encoders": {datetime: lambda v: v.isoformat()}}


class AnalyticsTimeseriesResponse(BaseModel):
    bucket_unit: Literal["hour", "day"]
    points: List[AnalyticsTimeseriesPoint]
