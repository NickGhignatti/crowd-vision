from __future__ import annotations

import argparse
import json
import sys
from typing import TYPE_CHECKING

from app.collector import build_sessions, build_trackers, run
from app.config import Config

if TYPE_CHECKING:
    from collections import Counter


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
    return parser.parse_args(argv)


def _print_tick(results: dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]) -> None:
    for building_name, (assignment, moves) in results.items():
        counts: dict[str, int] = {}
        for zone in assignment.values():
            counts[zone] = counts.get(zone, 0) + 1
        batch = {
            "building": building_name,
            "counts": counts,
            "transitions": {f"{a}->{b}": n for (a, b), n in moves.items()},
        }
        print(json.dumps(batch))


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

    if not args.dry_run:
        config.load_env()
        print(
            "only --dry-run is wired up so far -- phase 5's signed POST to "
            "/telemetry/ingest hasn't been built yet",
            file=sys.stderr,
        )
        return 1

    sessions_by_building = build_sessions(config, timeout=config.default_timeout)
    trackers_by_building = build_trackers(
        config,
        polls=args.hysteresis_polls,
        margin_db=args.hysteresis_margin_db,
        absent_polls=args.absent_polls,
    )

    run(
        config,
        sessions_by_building,
        trackers_by_building,
        interval_s=config.poll_interval,
        on_tick=_print_tick,
        max_ticks=1 if args.once else None,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
