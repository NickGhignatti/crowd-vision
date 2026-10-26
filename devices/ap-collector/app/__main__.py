from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from typing import TYPE_CHECKING, Any

from app.bursts import Bursts
from app.collector import build_sessions, run, sync_state
from app.config import Config
from app.ingest import IngestError, post_observations
from app.observations import observations_batch
from app.probes import ProbeHub, ProbeListener
from app.routers import SyncError, buildings_from, fetch_routers
from app.tokens import Tokens

if TYPE_CHECKING:
    from collections.abc import Callable

    from app.bursts import Burst
    from app.collector import TickResult
    from app.probes import Probe

Batches = dict[str, dict[str, Any]]


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app")
    parser.add_argument("--config", required=True, help="path to collector.json")
    parser.add_argument("--once", action="store_true", help="run a single tick and exit")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print a summary of each tick instead of posting it to telemetry",
    )
    parser.add_argument(
        "--replay",
        metavar="CSV",
        help="replay a phase-2 survey CSV instead of polling live APs (not implemented yet)",
    )
    return parser.parse_args(argv)


def _make_batches(
    config: Config, bursts: Callable[[str], list[Burst]]
) -> Callable[[dict[str, TickResult]], Batches]:
    """Each building's tick body, every address swapped for a token.

    One token table per building for the whole run: a phone keeps its token across ticks.
    """
    tokens: dict[str, Tokens] = {}

    def batches(results: dict[str, TickResult]) -> Batches:
        now_ms = int(time.time() * 1000)
        for gone in set(tokens) - set(results):
            del tokens[gone]
        built: Batches = {}
        for building, (answered, rows) in results.items():
            table = tokens.setdefault(building, Tokens())
            sightings, scans = table.observe(rows, bursts(building))
            built[building] = observations_batch(
                building, now_ms, sorted(answered), sightings, scans, config.devices_per_person
            )
        return built

    return batches


def _summary(batch: dict[str, Any]) -> dict[str, Any]:
    """What a dry run prints: counts only, so no token stream reaches stdout or a log."""
    connected = {row["token"] for row in batch["connected"]}
    bursts = batch["bursts"]
    per_router = Counter(router for burst in bursts for router in burst["heard"])
    by_routers_heard = Counter(str(len(burst["heard"])) for burst in bursts)
    return {
        "building": batch["buildingId"],
        "answered": len(batch["answered"]),
        "connected": len(connected),
        "bursts": {
            "perRouter": dict(sorted(per_router.items())),
            "byRoutersHeard": dict(sorted(by_routers_heard.items())),
            "fromConnected": sum(burst["token"] in connected for burst in bursts),
        },
    }


def _make_print_tick(
    batches: Callable[[dict[str, TickResult]], Batches],
) -> Callable[[dict[str, TickResult]], None]:
    """Dry-run `on_tick`: summarises the same bodies the real path would post."""

    def on_tick(results: dict[str, TickResult]) -> None:
        for batch in batches(results).values():
            print(json.dumps(_summary(batch)))

    return on_tick


def _make_post_tick(
    config: Config, batches: Callable[[dict[str, TickResult]], Batches]
) -> Callable[[dict[str, TickResult]], None]:
    """Real-mode `on_tick`: POST each building's tick to telemetry.

    A failed POST is dropped, not retried or raised: by the next poll the tick is stale, and an
    escaping IngestError would end the process. Caught per building, so one refused tick does
    not skip the buildings after it."""
    url = config.telemetry_service.rstrip("/") + "/observations"

    def on_tick(results: dict[str, TickResult]) -> None:
        for building, batch in batches(results).items():
            secret = config.key_for(building)
            if secret is None:
                print(f"{building}: no device key, dropping this tick", file=sys.stderr)
                continue
            try:
                post_observations(url, secret, batch, timeout=config.default_timeout)
            except IngestError as error:
                print(f"{building}: dropping this tick: {error}", file=sys.stderr)

    return on_tick


def _refreshing(
    on_tick: Callable[[dict[str, TickResult]], None],
    refresh: Callable[[], None],
    every: int,
) -> Callable[[dict[str, TickResult]], None]:
    """`on_tick`, then a router-list refresh after every `every` ticks."""
    ticks = 0

    def wrapped(results: dict[str, TickResult]) -> None:
        nonlocal ticks
        on_tick(results)
        ticks += 1
        if ticks % every == 0:
            refresh()

    return wrapped


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    if args.replay:
        print(
            "--replay isn't implemented yet: a phase-2 CSV has no per-tick record of whether "
            "an AP answered at all, only rows for MACs it actually heard, so replaying it "
            "needs a decision on how to derive each tick's `answered` routers from that.",
            file=sys.stderr,
        )
        return 2

    config = Config([])
    config.load_from_config_file(args.config)
    # Even a dry run reads its routers from telemetry: there is no other list.
    config.load_env()
    hub = ProbeHub(ProbeListener) if config.subscribe_probes else None

    def drain(building: str) -> list[Probe]:
        return hub.drain(building) if hub is not None else []

    batches = _make_batches(config, Bursts(drain).take)
    on_tick = _make_print_tick(batches) if args.dry_run else _make_post_tick(config, batches)
    sessions_by_building = build_sessions(config, timeout=config.default_timeout)

    def refresh() -> None:
        # Each building key reads its own building; the shared dev key reads every one.
        shared = config.shared_key
        reads = [(b, k) for b, k in config.keys.items()] or ([(None, shared)] if shared else [])
        found: list[dict] = []
        for building_id, key in reads:
            try:
                answer = fetch_routers(
                    config.telemetry_service, key, config.default_timeout, building_id
                )
            except SyncError as error:
                print(f"keeping the previous router list: {error}", file=sys.stderr)
                return
            found += answer["buildings"]
        config.buildings = buildings_from({"buildings": found}, config.site)
        sync_state(config, sessions_by_building, config.default_timeout)
        if hub is not None:
            hub.sync(config.buildings)

    refresh()
    every = max(1, round(config.sync_interval / config.poll_interval))
    try:
        run(
            config,
            sessions_by_building,
            interval_s=config.poll_interval,
            on_tick=_refreshing(on_tick, refresh, every),
            max_ticks=1 if args.once else None,
        )
    finally:
        if hub is not None:
            hub.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
