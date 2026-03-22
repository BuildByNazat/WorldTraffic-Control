"""
Provider factory and fallback logic.

Instantiates the correct aircraft data provider based on configuration
and exposes a single get_snapshot() entry point with OpenSky -> Simulated fallback.

On shutdown, call factory.close() to release any held resources.
"""

import logging
from app.config import settings
from app.schemas import AircraftFeatureCollection
from app.services.providers.simulated import SimulatedProvider
from app.services.providers.opensky import OpenSkyProvider

logger = logging.getLogger(__name__)


class ProviderFactory:
    """
    Manages the active aircraft data provider and implements fallback logic.
    Both providers are always instantiated so fallback is instant with no
    cold-start latency.
    """

    def __init__(self) -> None:
        self._primary_type = settings.aircraft_provider
        self._simulated = SimulatedProvider()
        self._opensky = OpenSkyProvider(settings.opensky_username, settings.opensky_password)

        logger.info(
            "ProviderFactory ready. Primary: %s | OpenSky credentials: %s",
            self._primary_type,
            "provided" if settings.opensky_username else "anonymous",
        )

    @property
    def primary_type(self) -> str:
        """The configured primary provider name."""
        return self._primary_type

    async def get_snapshot(self) -> AircraftFeatureCollection:
        """
        Return a snapshot from the configured provider.
        If the primary provider is opensky and it fails, automatically falls
        back to simulated data for this tick (without permanently switching).
        """
        if self._primary_type == "opensky":
            try:
                return await self._opensky.get_snapshot()
            except Exception as exc:
                logger.warning(
                    "OpenSky provider failed — falling back to simulated data this tick. "
                    "Reason: %s",
                    exc,
                )
                return await self._simulated.get_snapshot()

        return await self._simulated.get_snapshot()

    async def close(self) -> None:
        """
        Release resources held by all providers.
        Called by the application lifespan on shutdown.
        """
        await self._opensky.close()
        await self._simulated.close()
        logger.info("ProviderFactory closed all provider connections.")


# Global singleton — created once at import time
factory = ProviderFactory()
