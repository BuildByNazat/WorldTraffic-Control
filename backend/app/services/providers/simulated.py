"""
Simulated aircraft data provider.
Moves the existing simulation logic into a provider class.
"""

import math
import random
from typing import List

from app.schemas import (
    AircraftFeature,
    AircraftFeatureCollection,
    AircraftGeometry,
    AircraftProperties,
)
from app.services.providers.base import BaseAircraftProvider


class SimulatedProvider(BaseAircraftProvider):
    """
    Fake aircraft data generator with smooth movement over time.
    """

    def __init__(self, min_aircraft: int = 8, max_aircraft: int = 15) -> None:
        self._fleet: List[dict] = []
        self._min_aircraft = min_aircraft
        self._max_aircraft = max_aircraft

    def _init_fleet(self) -> None:
        count = random.randint(self._min_aircraft, self._max_aircraft)
        callsign_bases = [
            "UAL", "DAL", "AAL", "BAW", "AFR", "DLH", "EZY", "RYR",
            "THY", "SIA", "QFA", "CPA", "ANA", "JAL", "KAL", "UAE",
        ]
        for i in range(count):
            callsign_prefix = random.choice(callsign_bases)
            self._fleet.append(
                {
                    "id": f"SIM{i+1:03d}",
                    "callsign": f"{callsign_prefix}{random.randint(100, 9999)}",
                    "lat": random.uniform(-60.0, 70.0),
                    "lon": random.uniform(-170.0, 170.0),
                    "altitude": random.uniform(15_000, 42_000),
                    "heading": random.uniform(0, 359.9),
                    "speed": random.uniform(300, 600),
                }
            )

    def _move_aircraft(self, ac: dict, delta_seconds: float = 5.0) -> dict:
        distance_nm = (ac["speed"] / 3600.0) * delta_seconds
        lat_delta = (distance_nm / 60.0) * math.cos(math.radians(ac["heading"]))
        lon_delta = (distance_nm / (60.0 * math.cos(math.radians(ac["lat"])) + 1e-9)) * math.sin(
            math.radians(ac["heading"])
        )

        new_lat = ac["lat"] + lat_delta
        new_lon = ac["lon"] + lon_delta

        if new_lon > 180: new_lon -= 360
        elif new_lon < -180: new_lon += 360

        heading = ac["heading"]
        if new_lat > 85:
            new_lat = 85
            heading = (180 + heading) % 360
        elif new_lat < -85:
            new_lat = -85
            heading = (180 + heading) % 360

        heading = (heading + random.uniform(-3, 3)) % 360
        altitude = ac["altitude"] + random.uniform(-200, 200)
        altitude = max(5_000, min(45_000, altitude))

        return {**ac, "lat": new_lat, "lon": new_lon, "heading": heading, "altitude": altitude}

    async def get_snapshot(self) -> AircraftFeatureCollection:
        if not self._fleet:
            self._init_fleet()
        else:
            self._fleet = [self._move_aircraft(ac) for ac in self._fleet]

        features: List[AircraftFeature] = []
        for ac in self._fleet:
            feature = AircraftFeature(
                geometry=AircraftGeometry(coordinates=[ac["lon"], ac["lat"]]),
                properties=AircraftProperties(
                    id=ac["id"],
                    callsign=ac["callsign"],
                    altitude=round(ac["altitude"], 0),
                    heading=round(ac["heading"], 1),
                    speed=round(ac["speed"], 1),
                    source="simulated",
                ),
            )
            features.append(feature)

        return AircraftFeatureCollection(features=features)
