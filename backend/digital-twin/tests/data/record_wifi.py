"""Records Wi-Fi ticks with ground truth, for the estimator's accuracy test (`service/tracks.rs`).

The ticks come from the collector's own code run against ap-simulator's world, so they are what
the collector would post. Stdlib only. Regenerate from the repo root:

    mise exec -- python3 backend/digital-twin/tests/data/record_wifi.py \
        > backend/digital-twin/tests/data/wifi-recording.jsonl

Line 1 holds the building and router placements as twin stores them. Each later line holds one
tick, where every connected token really stood, and who sent each burst (null: nobody connected).
"""

import calendar
import itertools
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "simulators" / "ap-simulator"))
sys.path.insert(0, str(ROOT / "devices" / "ap-collector"))

from building import BuildingWorld  # noqa: E402
from config import SimConfig  # noqa: E402
from geometry import Layout, Point, Room  # noqa: E402

from app.bursts import Burst, Bursts  # noqa: E402
from app.collector import build_readings  # noqa: E402
from app.observations import observations_batch  # noqa: E402
from app.probes import probe_from  # noqa: E402
from app.tokens import Tokens  # noqa: E402

BUILDING = "b-recorded"
START_S = calendar.timegm((2026, 9, 23, 9, 0, 0))
TICK_S = 10
TICKS = 90
# Two floors of three by two 10 m rooms; a router in five of the six on each floor.
ROOMS = [
    Room(f"f{f}-{i}{j}", Point(5 + 10 * i, 1.5 + 3 * f, 5 + 10 * j), 10, 3, 10)
    for f in range(2)
    for i in range(3)
    for j in range(2)
]
ROUTERS = [(f"r-{room.id}", room.id) for room in ROOMS if room.id[-2:] != "11"]


def main() -> None:
    layout = Layout.of(ROOMS, ROUTERS, None)
    world = BuildingWorld(BUILDING, layout, SimConfig())
    counter = itertools.count()
    tokens = Tokens(mint=lambda: f"{next(counter):016x}")
    clock = [0.0]
    pending: list = []
    bursts = Bursts(lambda _building: pending[:], clock=lambda: clock[0])

    print(json.dumps({"building": building(layout), "placements": placements(layout)}))
    for n in range(TICKS):
        now = START_S + n * TICK_S
        clock[0] = now
        polled = [
            (ap, [(s.mac, s.signal, s.inactive_ms) for s in world.clients(ap, now)])
            for ap in sorted(world.aps)
        ]
        readings, answered = build_readings(polled)
        pending[:] = [
            probe
            for ap in sorted(world.aps)
            for event in world.events(ap, now - TICK_S, now)
            if (probe := probe_from(ap, event.kind, json.dumps(event.payload), event.at))
        ]
        taken = bursts.take(BUILDING)
        sightings, scans = tokens.observe(readings, taken)
        tick = observations_batch(BUILDING, now * 1000, sorted(answered), sightings, scans)
        print(json.dumps(truth(world, layout, tokens, tick, taken, now), separators=(",", ":")))


def truth(
    world: BuildingWorld, layout: Layout, tokens: Tokens, tick: dict, taken: list[Burst], now: float
) -> dict:
    token_of = {mac: token for mac, (token, _seen) in tokens._known.items()}
    connected = {row["token"] for row in tick["connected"]}
    phones = {}
    for phone in world.ground_truth(now)["phones"]:
        token = token_of.get(phone["mac"])
        if token in connected and phone["present"]:
            phones[token] = spot(layout, Point(**phone["position"]))

    sent = [
        (at, mac, point, sender.key)
        for sender in world._senders(now - 3 * TICK_S, now)
        for _slot, at, mac, point in world._bursts(sender, now - 3 * TICK_S, now)
    ]
    # Ticks keep bursts in the order the collector grouped them, so each lines up with its address.
    assert len(tick["bursts"]) == len(taken)
    senders = []
    for raw in taken:
        # A router hears a burst up to 1.5 s after it was sent, so the start trails the send.
        _at, _mac, point, key = min(
            (s for s in sent if s[1] == raw.address and s[0] <= raw.started + 0.01),
            key=lambda s: raw.started - s[0],
        )
        owner = token_of.get(key)
        senders.append({"owner": owner if owner in connected else None, **spot(layout, point)})
    return {"tick": tick, "phones": phones, "bursts": senders}


def spot(layout: Layout, point: Point) -> dict:
    room = layout.room_at(point)
    return {
        "x": round(point.x, 3),
        "z": round(point.z, 3),
        "floor": layout.floor_of(point.y),
        "room": room.id if room else None,
    }


def building(layout: Layout) -> dict:
    return {
        "id": BUILDING,
        "name": BUILDING,
        "domains": [],
        "rooms": [
            {
                "id": room.id,
                "name": room.id,
                "capacity": 10.0,
                "position": {"x": room.centre.x, "y": room.centre.y, "z": room.centre.z},
                "dimensions": {"width": room.width, "height": room.height, "depth": room.depth},
            }
            for room in layout.rooms.values()
        ],
    }


def placements(layout: Layout) -> list[dict]:
    return [
        {"sensor_id": router.id, "position": vars(router.position)}
        for router in layout.routers.values()
    ]


if __name__ == "__main__":
    main()
