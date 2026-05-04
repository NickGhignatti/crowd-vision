from __future__ import annotations

from typing import Literal

import httpx
from pydantic import BaseModel, Field

from app.agent.tools.base import ToolContext, ToolResult
from app.config import get_settings


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=get_settings().sensor_service_url, timeout=10.0)


# ─── get_occupancy_history ──────────────────────────────────────────────────


class GetOccupancyHistoryArgs(BaseModel):
    building_id: str = Field(description="Id of the building containing the room.")
    room_id: str = Field(description="Id of the room within the building.")
    time_range: Literal["1D", "1W", "1M"] = Field(
        default="1D",
        description=(
            "Window: '1D' = last 24h with hourly buckets; '1W' = last 7 days "
            "with daily buckets; '1M' = last 30 days with daily buckets."
        ),
    )


class GetOccupancyHistoryTool:
    name = "get_occupancy_history"
    description = (
        "Fetch a room's occupancy time-series for the past 1 day / 1 week / 1 month "
        "as bucketed avg/min/max people-count. Use for questions about trends, peak "
        "times, or recent occupancy patterns. For *current* occupancy use get_room."
    )
    Args = GetOccupancyHistoryArgs

    async def run(self, args: GetOccupancyHistoryArgs, ctx: ToolContext) -> ToolResult:
        params = {
            "building": args.building_id,
            "roomId": args.room_id,
            "timeRange": args.time_range,
        }
        async with _client() as c:
            r = await c.get("/peopleCount/dashboard", params=params)
        if r.status_code >= 400:
            return ToolResult(
                content=f"sensor-service error {r.status_code}: {r.text}", is_error=True
            )

        buckets = (r.json() or {}).get("peopleCount", []) or []
        slim = [
            {
                "timestamp": b.get("timestamp"),
                "avg": b.get("avg"),
                "min": b.get("min"),
                "max": b.get("max"),
            }
            for b in buckets
        ]

        summary: dict[str, object] = {"bucket_count": len(slim)}
        if slim:
            avgs = [b["avg"] for b in slim if b.get("avg") is not None]
            if avgs:
                summary["avg_overall"] = round(sum(avgs) / len(avgs), 2)
            peak = max(
                (b for b in slim if b.get("max") is not None),
                key=lambda b: b["max"],
                default=None,
            )
            if peak is not None:
                summary["peak"] = {"timestamp": peak["timestamp"], "value": peak["max"]}

        return ToolResult(
            content={
                "building_id": args.building_id,
                "room_id": args.room_id,
                "time_range": args.time_range,
                "summary": summary,
                "buckets": slim,
            }
        )
