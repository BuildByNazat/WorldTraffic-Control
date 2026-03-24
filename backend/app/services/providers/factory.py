"""
Provider factory and fallback logic.

Creates the configured aviation provider and exposes a single normalized
snapshot boundary for the rest of the application.
"""

from datetime import datetime, timezone
import logging

from app.config import settings
from app.services.providers.base import ProviderUnavailableError
from app.services.providers.commercial_stub import CommercialProviderStub
from app.services.providers.models import AviationProviderStatus, AviationSnapshot
from app.services.providers.opensky import OpenSkyProvider
from app.services.providers.simulated import SimulatedProvider

logger = logging.getLogger(__name__)


class ProviderFactory:
    """Manage the active aviation provider and a safe simulated fallback path."""

    def __init__(self) -> None:
        self._primary_type = settings.aviation_provider
        self._simulated = SimulatedProvider()
        self._providers = {
            "simulated": self._simulated,
            "opensky": OpenSkyProvider(
                settings.opensky_username,
                settings.opensky_password,
            ),
            "commercial_stub": CommercialProviderStub(
                settings.commercial_provider_name
            ),
        }
        self._last_provider_status: AviationProviderStatus | None = None
        self._last_snapshot: AviationSnapshot | None = None
        self._active_provider_key = self._primary_type

        logger.info(
            "ProviderFactory ready. Mode: %s | Primary: %s | OpenSky credentials: %s",
            settings.aviation_data_mode,
            self._primary_type,
            "provided" if settings.opensky_username else "anonymous",
        )

    @property
    def primary_type(self) -> str:
        """Configured aviation provider key."""
        return self._primary_type

    @property
    def active_provider_key(self) -> str:
        """Provider key currently supplying snapshot data to the app."""
        return self._active_provider_key

    @property
    def last_provider_status(self) -> AviationProviderStatus | None:
        """Latest provider health/status record from the configured path."""
        return self._last_provider_status

    @property
    def last_snapshot(self) -> AviationSnapshot | None:
        """Latest normalized aviation snapshot produced by the factory."""
        return self._last_snapshot

    async def get_snapshot(self) -> AviationSnapshot:
        """
        Return a normalized aviation snapshot from the configured provider path.

        If the configured provider fails, the app falls back to the simulated
        provider for continuity while preserving degraded status metadata.
        """
        provider = self._providers[self._primary_type]

        try:
            snapshot = await provider.get_snapshot()
            self._last_provider_status = snapshot.provider_status
            self._last_snapshot = snapshot
            self._active_provider_key = provider.provider_key
            return snapshot
        except ProviderUnavailableError as exc:
            self._last_provider_status = AviationProviderStatus(
                provider_key=exc.status.provider_key,
                provider_label=exc.status.provider_label,
                mode=exc.status.mode,
                checked_at=exc.status.checked_at,
                healthy=exc.status.healthy,
                degraded=True,
                fallback_active=True,
                message=exc.status.message,
                last_snapshot_at=exc.status.last_snapshot_at,
            )
            logger.warning(
                "Primary aviation provider failed; falling back to simulated data. Reason: %s",
                exc.status.message,
            )
        except Exception as exc:
            now = datetime.now(timezone.utc)
            self._last_provider_status = AviationProviderStatus(
                provider_key=self._primary_type,
                provider_label=self._primary_type.replace("_", " ").title(),
                mode=settings.aviation_data_mode,
                checked_at=now,
                healthy=False,
                degraded=True,
                fallback_active=True,
                message=f"Unexpected provider error: {exc}",
                last_snapshot_at=None,
            )
            logger.exception("Unexpected provider error.")

        snapshot = await self._simulated.get_snapshot()
        self._last_snapshot = snapshot
        self._active_provider_key = self._simulated.provider_key
        return snapshot

    async def close(self) -> None:
        """Release resources held by all providers."""
        for provider in self._providers.values():
            await provider.close()
        logger.info("ProviderFactory closed all provider connections.")


factory = ProviderFactory()
