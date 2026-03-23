"""
OpenSky Network aircraft data provider.
Fetches real-world aircraft states from the OpenSky REST API.
"""

import logging
from typing import List, Optional

import httpx
from app.schemas import (
    AircraftFeature,
    AircraftFeatureCollection,
    AircraftGeometry,
    AircraftProperties,
)
from app.services.providers.base import BaseAircraftProvider

logger = logging.getLogger(__name__)


class OpenSkyProvider(BaseAircraftProvider):
    """
    OpenSky Network API provider.
    Requires (optional) username/password for higher rate limits.
    """

    OPENSKY_URL = "https://opensky-network.org/api/states/all"

    def __init__(
        self, username: Optional[str] = None, password: Optional[str] = None
    ) -> None:
        self.auth = (username, password) if username and password else None
        # We use a persistent client for connection pooling
        self.client = httpx.AsyncClient(timeout=10.0)

    async def get_snapshot(self) -> AircraftFeatureCollection:
        """
        Fetch all states from OpenSky, filtered to a reasonable amount, and parsed as GeoJSON.
        """
        try:
            response = await self.client.get(self.OPENSKY_URL, auth=self.auth)
            response.raise_for_status()
            data = response.json()

            states = data.get("states")
            if not states:
                return AircraftFeatureCollection(features=[])

            features: List[AircraftFeature] = []
            
            # Limit to top 15 aircraft to match existing UI throughput for MVP
            # In production, we might want to filter by bounding box instead.
            for s in states[:15]:
                # OpenSky State Vector Index:
                # 0: icao24, 1: callsign, 2: origin_country, 5: longitude, 6: latitude, 
                # 7: baro_altitude, 9: velocity, 10: true_track
                
                # Filter out those without position
                if s[5] is None or s[6] is None:
                    continue

                callsign = (s[1] or "N/A").strip()
                altitude_ft = (s[7] * 3.28084) if s[7] is not None else 0
                speed_kts = (s[9] * 1.94384) if s[9] is not None else 0
                heading = s[10] if s[10] is not None else 0

                feature = AircraftFeature(
                    geometry=AircraftGeometry(coordinates=[s[5], s[6]]),
                    properties=AircraftProperties(
                        id=s[0],
                        callsign=callsign,
                        altitude=round(altitude_ft, 0),
                        heading=round(heading, 1),
                        speed=round(speed_kts, 1),
                        source="opensky",
                    ),
                )
                features.append(feature)

            return AircraftFeatureCollection(features=features)

        except Exception:
            logger.exception("Failed to fetch data from OpenSky.")
            raise

    async def close(self):
        """Clean up the httpx client."""
        await self.client.aclose()
