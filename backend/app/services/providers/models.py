"""
Normalized aviation provider models.

These dataclasses define the provider-facing integration boundary so any future
commercial aviation source can be adapted into one internal model before the
rest of the application touches it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.schemas import (
    AircraftFeature,
    AircraftFeatureCollection,
    AircraftGeometry,
    AircraftProperties,
)


@dataclass(slots=True)
class AviationFlight:
    stable_id: str
    latitude: float
    longitude: float
    observed_at: datetime
    provider: str
    callsign: Optional[str] = None
    flight_identifier: Optional[str] = None
    altitude_ft: Optional[float] = None
    ground_speed_kts: Optional[float] = None
    heading_deg: Optional[float] = None
    route_origin: Optional[str] = None
    route_destination: Optional[str] = None
    freshness_seconds: Optional[float] = None
    stale: bool = False


@dataclass(slots=True)
class AviationProviderStatus:
    provider_key: str
    provider_label: str
    mode: str
    checked_at: datetime
    healthy: bool
    degraded: bool = False
    fallback_active: bool = False
    message: Optional[str] = None
    last_snapshot_at: Optional[datetime] = None


@dataclass(slots=True)
class AviationSnapshot:
    flights: list[AviationFlight] = field(default_factory=list)
    provider_status: AviationProviderStatus | None = None
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def to_aircraft_feature_collection(snapshot: AviationSnapshot) -> AircraftFeatureCollection:
    """Convert normalized aviation flights into the existing GeoJSON contract."""
    features: list[AircraftFeature] = []

    for flight in snapshot.flights:
        altitude_ft = float(flight.altitude_ft or 0.0)
        heading_deg = float(flight.heading_deg or 0.0) % 360
        speed_kts = float(flight.ground_speed_kts or 0.0)

        features.append(
            AircraftFeature(
                geometry=AircraftGeometry(
                    coordinates=[flight.longitude, flight.latitude]
                ),
                properties=AircraftProperties(
                    id=flight.stable_id,
                    callsign=flight.callsign or flight.flight_identifier,
                    altitude=round(altitude_ft, 0),
                    heading=round(heading_deg, 1),
                    speed=round(speed_kts, 1),
                    source=flight.provider,
                    observed_at=flight.observed_at,
                    route_origin=flight.route_origin,
                    route_destination=flight.route_destination,
                    provider_name=(
                        snapshot.provider_status.provider_label
                        if snapshot.provider_status
                        else flight.provider
                    ),
                    freshness_seconds=flight.freshness_seconds,
                    stale=flight.stale,
                ),
            )
        )

    return AircraftFeatureCollection(features=features)
