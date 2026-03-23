"""
Commercial aviation provider placeholder.

This adapter is intentionally non-functional. It provides a stable integration
point for a future licensed commercial provider without forcing the rest of the
application to change shape again.
"""

from datetime import datetime, timezone

from app.services.providers.base import BaseAircraftProvider
from app.services.providers.models import AviationProviderStatus, AviationSnapshot


class CommercialProviderStub(BaseAircraftProvider):
    provider_key = "commercial_stub"
    provider_label = "Commercial Provider Placeholder"

    def __init__(self, provider_name: str | None = None) -> None:
        self._provider_name = provider_name or self.provider_label

    async def get_snapshot(self) -> AviationSnapshot:
        now = datetime.now(timezone.utc)
        return AviationSnapshot(
            flights=[],
            provider_status=AviationProviderStatus(
                provider_key=self.provider_key,
                provider_label=self._provider_name,
                mode="provider",
                checked_at=now,
                healthy=False,
                degraded=True,
                message="No commercial aviation provider is configured yet.",
                last_snapshot_at=None,
            ),
            generated_at=now,
        )
