from __future__ import annotations

import asyncio

from schemas import BuildingConfig
from simulator import Simulator


async def main() -> None:
    sim = Simulator()
    config = BuildingConfig(
        buildingId="smoke-building",
        roomIds=["room-1"],
        targetUrl="http://localhost:80/sensor",
        interval_seconds=60.0,
    )

    sim.register_building(config)
    sim.start(config.buildingId)
    sim.stop(config.buildingId)
    await sim.close()
    print("ok")


if __name__ == "__main__":
    asyncio.run(main())

