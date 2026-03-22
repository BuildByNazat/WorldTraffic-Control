"""
Base interface for aircraft data providers.

Any new provider must subclass BaseAircraftProvider and implement get_snapshot().
Optionally override close() if the provider holds resources (e.g., HTTP client).
"""

from abc import ABC, abstractmethod

from app.schemas import AircraftFeatureCollection


class BaseAircraftProvider(ABC):
    """
    Abstract base class for any provider that can supply live aircraft positions.
    """

    @abstractmethod
    async def get_snapshot(self) -> AircraftFeatureCollection:
        """Fetch a fresh snapshot of aircraft data."""
        ...

    async def close(self) -> None:
        """
        Optional cleanup hook called on application shutdown.
        Override in subclasses that hold external connections (e.g., httpx.AsyncClient).
        """
