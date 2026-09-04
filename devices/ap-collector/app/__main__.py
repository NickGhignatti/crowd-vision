from __future__ import annotations

import argparse
import json
import sys
import time
from typing import TYPE_CHECKING

from app.collector import build_sessions, build_trackers, readings_for_building, run
from app.config import Config
from app.ingest import IngestError, post_batch
from app.zones import DEFAULT_FROZEN_POLLS

if TYPE_CHECKING:
    from collections import Counter
    from collections.abc import Callable


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m app")
    parser.add_argument("--config", required=True, help="path to collector.json")
    parser.add_argument("--once", action="store_true", help="run a single tick and exit")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print each tick's result instead of posting it to telemetry",
    )
    parser.add_argument(
        "--replay",
        metavar="CSV",
        help="replay a phase-2 survey CSV instead of polling live APs (not implemented yet)",
    )
    parser.add_argument("--hysteresis-polls", type=int, default=3)
    parser.add_argument("--hysteresis-margin-db", type=float, default=6.0)
    parser.add_argument("--absent-polls", type=int, default=3)
    parser.add_argument(
        "--frozen-polls",
        type=int,
        default=DEFAULT_FROZEN_POLLS,
        help="drop a device held behind a silent AP after this many polls",
    )
    return parser.parse_args(argv)


def _make_print_tick(
    config: Config,
) -> Callable[[dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]], None]:
    """Dry-run `on_tick`: shares `readings_for_building` with the real post path so the
    preview always matches what would actually be sent, `devicesPerPerson` included."""
    buildings_by_name = {building.name: building for building in config.buildings}

    def on_tick(results: dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]) -> None:
        now_ms = int(time.time() * 1000)
        for building_name, (assignment, moves) in results.items():
            building = buildings_by_name[building_name]
            readings = readings_for_building(
                building, assignment, now_ms, config.devices_per_person
            )
            counts = {reading["roomId"]: reading["deviceCount"] for reading in readings}
            batch = {
                "building": building_name,
                "counts": counts,
                "transitions": {f"{a}->{b}": n for (a, b), n in moves.items()},
            }
            print(json.dumps(batch))

    return on_tick


def _make_post_tick(
    config: Config,
) -> Callable[[dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]], None]:
    """Real-mode `on_tick`: turn each building's confirmed assignment into deviceDetection
    readings and POST them. Built once (needs config's secret/URL/buildings), not per tick.

    A failed POST is reported and dropped, never raised: `run` calls this straight from its
    loop, so an escaping IngestError ends the process -- one telemetry restart, or one batch
    the ingest endpoint refuses, and the collector is gone until somebody notices. A tick is a
    snapshot the next tick supersedes, so losing one costs a poll interval of resolution. The
    catch sits inside the per-building loop for the same reason `poll_one` guards each AP
    separately: one building's rejected batch must not skip every building after it."""
    buildings_by_name = {building.name: building for building in config.buildings}
    ingest_url = config.telemetry_service.rstrip("/") + "/ingest"
    secret = config.telemetry_secret.encode("utf-8")

    def on_tick(results: dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]) -> None:
        now_ms = int(time.time() * 1000)
        for building_name, (assignment, _moves) in results.items():
            building = buildings_by_name[building_name]
            readings = readings_for_building(
                building, assignment, now_ms, config.devices_per_person
            )
            try:
                post_batch(
                    ingest_url, secret, building_name, readings, timeout=config.default_timeout
                )
            except IngestError as error:
                print(f"{building_name}: dropping this tick's batch: {error}", file=sys.stderr)

    return on_tick


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    if args.replay:
        print(
            "--replay isn't implemented yet: a phase-2 CSV has no per-tick record of whether "
            "an AP answered at all, only rows for MACs it actually heard, so replaying it "
            "through ZoneTracker needs a decision on how to derive `available_zones` from that "
            "before it can reuse the live pipeline's semantics.",
            file=sys.stderr,
        )
        return 2

    config = Config([])
    config.load_from_config_file(args.config)

    if args.dry_run:
        on_tick = _make_print_tick(config)
    else:
        config.load_env()
        on_tick = _make_post_tick(config)

    sessions_by_building = build_sessions(config, timeout=config.default_timeout)
    trackers_by_building = build_trackers(
        config,
        polls=args.hysteresis_polls,
        margin_db=args.hysteresis_margin_db,
        absent_polls=args.absent_polls,
        frozen_polls=args.frozen_polls,
    )

    run(
        config,
        sessions_by_building,
        trackers_by_building,
        interval_s=config.poll_interval,
        on_tick=on_tick,
        max_ticks=1 if args.once else None,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
