"""
OpenSky Network aircraft data provider.
Fetches real-world aircraft states from the OpenSky REST API.
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional

import httpx
from app.services.providers.base import BaseAircraftProvider, ProviderUnavailableError
from app.services.providers.models import (
    AviationFlight,
    AviationProviderStatus,
    AviationSnapshot,
)

logger = logging.getLogger(__name__)


class OpenSkyProvider(BaseAircraftProvider):
    """
    OpenSky Network API provider.
    Requires (optional) username/password for higher rate limits.
    """

    provider_key = "opensky"
    provider_label = "OpenSky Network"
    OPENSKY_URL = "https://opensky-network.org/api/states/all"
    MAX_TRACKED_FLIGHTS = 150
    STALE_AFTER_SECONDS = 90.0
    VERY_STALE_AFTER_SECONDS = 300.0

    def __init__(
        self, username: Optional[str] = None, password: Optional[str] = None
    ) -> None:
        self.auth = (username, password) if username and password else None
        # We use a persistent client for connection pooling
        self.client = httpx.AsyncClient(timeout=10.0)

    async def get_snapshot(self) -> AviationSnapshot:
        """
        Fetch all states from OpenSky and normalize them into the internal model.
        """
        checked_at = datetime.now(timezone.utc)
        try:
            response = await self.client.get(self.OPENSKY_URL, auth=self.auth)
            response.raise_for_status()
            data = response.json()

            states = data.get("states")
            if not states:
                return AviationSnapshot(
                    flights=[],
                    provider_status=AviationProviderStatus(
                        provider_key=self.provider_key,
                        provider_label=self.provider_label,
                        mode="evaluation",
                        checked_at=checked_at,
                        healthy=True,
                        degraded=False,
                        message="Provider responded with no currently trackable aircraft.",
                        last_snapshot_at=checked_at,
                    ),
                    generated_at=checked_at,
                )

            flights: List[AviationFlight] = []
            candidate_flights: List[AviationFlight] = []
            skipped_without_position = 0
            skipped_very_stale = 0
            skipped_without_identity = 0

            for s in states:
                if s[5] is None or s[6] is None:
                    skipped_without_position += 1
                    continue

                last_position_seconds = s[3]
                last_contact_seconds = s[4]
                observed_seconds = (
                    last_position_seconds
                    if last_position_seconds is not None
                    else last_contact_seconds
                )
                observed_at = (
                    datetime.fromtimestamp(observed_seconds, tz=timezone.utc)
                    if observed_seconds is not None
                    else checked_at
                )
                freshness_seconds = max(
                    0.0, (checked_at - observed_at).total_seconds()
                )
                if freshness_seconds > self.VERY_STALE_AFTER_SECONDS:
                    skipped_very_stale += 1
                    continue

                callsign = (s[1] or "").strip() or None
                stable_id = (s[0] or "").strip().upper()
                if not stable_id:
                    skipped_without_identity += 1
                    continue
                altitude_value_m = s[13] if s[13] is not None else s[7]
                altitude_ft = (
                    altitude_value_m * 3.28084 if altitude_value_m is not None else None
                )
                speed_kts = (s[9] * 1.94384) if s[9] is not None else None
                heading = s[10] if s[10] is not None else None

                candidate_flights.append(
                    AviationFlight(
                        stable_id=stable_id,
                        callsign=callsign,
                        flight_identifier=callsign,
                        latitude=s[6],
                        longitude=s[5],
                        altitude_ft=round(altitude_ft, 0) if altitude_ft is not None else None,
                        heading_deg=round(heading, 1) if heading is not None else None,
                        ground_speed_kts=round(speed_kts, 1) if speed_kts is not None else None,
                        observed_at=observed_at,
                        provider=self.provider_key,
                        freshness_seconds=round(freshness_seconds, 1),
                        stale=freshness_seconds > self.STALE_AFTER_SECONDS,
                    )
                )

            candidate_flights.sort(
                key=lambda flight: (
                    flight.stale,
                    flight.freshness_seconds
                    if flight.freshness_seconds is not None
                    else float("inf"),
                    flight.callsign is None,
                    flight.stable_id,
                )
            )
            flights = candidate_flights[: self.MAX_TRACKED_FLIGHTS]
            skipped_after_cap = max(0, len(candidate_flights) - len(flights))
            included_stale = sum(1 for flight in flights if flight.stale)
            missing_callsigns = sum(1 for flight in flights if not flight.callsign)

            message = (
                "Using authenticated OpenSky evaluation access."
                if self.auth
                else "Using anonymous OpenSky evaluation access."
            )
            message = (
                f"{message} Showing the {len(flights)} freshest aircraft for the current map snapshot."
            )
            if (
                skipped_without_position
                or skipped_very_stale
                or skipped_without_identity
                or skipped_after_cap
                or included_stale
                or missing_callsigns
            ):
                message = (
                    f"{message} Filtered {skipped_without_position} without position, "
                    f"{skipped_without_identity} without identity, "
                    f"{skipped_very_stale} very stale tracks, and held back {skipped_after_cap} additional aircraft to keep the live map responsive."
                )
                if included_stale:
                    message = f"{message} {included_stale} retained tracks are marked stale."
                if missing_callsigns:
                    message = f"{message} {missing_callsigns} retained tracks have no callsign from the provider."

            return AviationSnapshot(
                flights=flights,
                provider_status=AviationProviderStatus(
                    provider_key=self.provider_key,
                    provider_label=self.provider_label,
                    mode="evaluation",
                    checked_at=checked_at,
                    healthy=True,
                    degraded=False,
                    message=message,
                    last_snapshot_at=checked_at,
                ),
                generated_at=checked_at,
            )

        except Exception as exc:
            logger.exception("Failed to fetch data from OpenSky.")
            raise ProviderUnavailableError(
                AviationProviderStatus(
                    provider_key=self.provider_key,
                    provider_label=self.provider_label,
                    mode="evaluation",
                    checked_at=checked_at,
                    healthy=False,
                    degraded=True,
                    message=f"OpenSky request failed: {exc}",
                    last_snapshot_at=None,
                )
            ) from exc

    async def close(self):
        """Clean up the httpx client."""
        await self.client.aclose()
