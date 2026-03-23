"""
Base interface for aircraft data providers.

Any new provider must subclass BaseAircraftProvider and implement get_snapshot().
Optionally override close() if the provider holds resources (e.g., HTTP client).
"""

from abc import ABC, abstractmethod

from app.services.providers.models import AviationProviderStatus, AviationSnapshot


class ProviderUnavailableError(RuntimeError):
    """Raised when a provider cannot supply a usable aviation snapshot."""

    def __init__(self, status: AviationProviderStatus):
        super().__init__(status.message or "Provider unavailable.")
        self.status = status


class BaseAircraftProvider(ABC):
    """
    Abstract base class for any provider that can supply live aircraft positions.
    """

    provider_key: str = "unknown"
    provider_label: str = "Unknown Provider"

    @abstractmethod
    async def get_snapshot(self) -> AviationSnapshot:
        """Fetch a fresh normalized aviation snapshot."""
        ...

    async def close(self) -> None:
        """
        Optional cleanup hook called on application shutdown.
        Override in subclasses that hold external connections (e.g., httpx.AsyncClient).
        """
