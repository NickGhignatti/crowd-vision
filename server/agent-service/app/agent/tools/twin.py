from __future__ import annotations

import httpx
from pydantic import BaseModel, Field

from app.agent.tools.base import ToolContext, ToolResult
from app.config import get_settings


def _client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(
        base_url=settings.twin_service_url,
        timeout=settings.twin_timeout_seconds,
    )


# ─── list_buildings ─────────────────────────────────────────────────────────


class ListBuildingsArgs(BaseModel):
    domain: str = Field(
        description=(
            "Domain name to list buildings for. If the user did not specify one, "
            "use one of the caller's domains."
        )
    )


class ListBuildingsTool:
    name = "list_buildings"
    description = (
        "List all buildings registered in a given domain. "
        "Use this when the user asks 'what buildings exist?', 'show buildings in X', "
        "or before drilling into rooms when the building id is unknown."
    )
    Args = ListBuildingsArgs

    async def run(self, args: ListBuildingsArgs, ctx: ToolContext) -> ToolResult:
        async with _client() as c:
            r = await c.get(f"/buildings/{args.domain}")
        if r.status_code >= 400:
            return ToolResult(
                content=f"twin-service error {r.status_code}: {r.text}", is_error=True
            )
        data = r.json() or []
        # Project to keep payload small for the LLM.
        slim = [
            {
                "id": b.get("id"),
                "name": b.get("name"),
                "domains": b.get("domains", []),
                "room_count": len(b.get("rooms", [])),
            }
            for b in data
        ]
        return ToolResult(content={"buildings": slim})


# ─── get_building ───────────────────────────────────────────────────────────


class GetBuildingArgs(BaseModel):
    building_id: str = Field(description="Unique id of the building (NOT its name).")


class GetBuildingTool:
    name = "get_building"
    description = (
        "Fetch a single building's full details (name, domains, rooms with capacity, "
        "occupancy, dimensions, position). Use when you have a specific building_id."
    )
    Args = GetBuildingArgs

    async def run(self, args: GetBuildingArgs, ctx: ToolContext) -> ToolResult:
        async with _client() as c:
            r = await c.get(f"/building/{args.building_id}")
        if r.status_code == 404:
            return ToolResult(content=f"building {args.building_id} not found", is_error=True)
        if r.status_code >= 400:
            return ToolResult(
                content=f"twin-service error {r.status_code}: {r.text}", is_error=True
            )
        return ToolResult(content=r.json())


# ─── list_rooms ─────────────────────────────────────────────────────────────


class ListRoomsArgs(BaseModel):
    building_id: str = Field(description="Building whose rooms should be listed.")


class ListRoomsTool:
    name = "list_rooms"
    description = (
        "List all rooms in a building with their id, name, capacity, and current "
        "occupancy (no_person). Use to answer 'which rooms are full', 'how many "
        "rooms in building X', or to find a room id by name."
    )
    Args = ListRoomsArgs

    async def run(self, args: ListRoomsArgs, ctx: ToolContext) -> ToolResult:
        async with _client() as c:
            r = await c.get(f"/building/{args.building_id}")
        if r.status_code == 404:
            return ToolResult(content=f"building {args.building_id} not found", is_error=True)
        if r.status_code >= 400:
            return ToolResult(
                content=f"twin-service error {r.status_code}: {r.text}", is_error=True
            )
        building = r.json() or {}
        rooms = building.get("rooms", [])
        slim = [
            {
                "id": room.get("id"),
                "name": room.get("name"),
                "capacity": room.get("capacity"),
                "no_person": room.get("no_person"),
                "temperature": room.get("temperature"),
                "max_temperature": room.get("maxTemperature"),
            }
            for room in rooms
        ]
        return ToolResult(
            content={
                "building_id": building.get("id"),
                "building_name": building.get("name"),
                "rooms": slim,
            }
        )


# ─── get_room ───────────────────────────────────────────────────────────────


class GetRoomArgs(BaseModel):
    building_id: str = Field(description="Building containing the room.")
    room_id: str = Field(description="Id of the room within the building.")


class GetRoomTool:
    name = "get_room"
    description = (
        "Fetch a single room's full state: capacity, current occupancy, temperature, "
        "dimensions, position. Use after locating the room id via list_rooms."
    )
    Args = GetRoomArgs

    async def run(self, args: GetRoomArgs, ctx: ToolContext) -> ToolResult:
        async with _client() as c:
            r = await c.get(f"/building/{args.building_id}")
        if r.status_code == 404:
            return ToolResult(content=f"building {args.building_id} not found", is_error=True)
        if r.status_code >= 400:
            return ToolResult(
                content=f"twin-service error {r.status_code}: {r.text}", is_error=True
            )
        building = r.json() or {}
        for room in building.get("rooms", []):
            if room.get("id") == args.room_id:
                return ToolResult(content=room)
        return ToolResult(
            content=f"room {args.room_id} not found in building {args.building_id}",
            is_error=True,
        )
