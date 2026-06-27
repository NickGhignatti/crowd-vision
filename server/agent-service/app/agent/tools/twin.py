from __future__ import annotations

from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field

from app.agent.tools.access import (
    accessible_domains,
    can_access_domain,
    get_authorized_building,
)
from app.agent.tools.base import ToolContext, ToolResult
from app.agent.tools.downstream import (
    auth_headers,
    downstream_error,
    get_twin_client,
    get_with_retry,
)


def _room_payload(room: dict) -> dict:
    return {
        "id": room.get("id"),
        "name": room.get("name"),
        "capacity": room.get("capacity"),
        "dimensions": room.get("dimensions"),
        "position": room.get("position"),
    }


def _building_payload(building: dict, ctx: ToolContext) -> dict:
    raw_domains = building.get("domains", [])
    domains = [str(domain) for domain in raw_domains] if isinstance(raw_domains, list) else []
    raw_rooms = building.get("rooms", [])
    rooms = raw_rooms if isinstance(raw_rooms, list) else []
    return {
        "id": building.get("id"),
        "name": building.get("name"),
        "domains": accessible_domains(ctx.user, domains),
        "rooms": [_room_payload(room) for room in rooms if isinstance(room, dict)],
    }


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
        if not can_access_domain(ctx.user, args.domain):
            return ToolResult(content="domain unavailable or inaccessible", is_error=True)

        try:
            domain = quote(args.domain, safe="")
            r = await get_with_retry(
                get_twin_client(),
                f"/buildings/{domain}",
                headers=auth_headers(ctx.user),
            )
        except httpx.HTTPError:
            return ToolResult(content="twin-service is unavailable", is_error=True)
        if r.status_code >= 400:
            return ToolResult(
                content=downstream_error("twin-service", r),
                is_error=True,
            )
        try:
            data = r.json() or []
        except ValueError:
            return ToolResult(content="twin-service returned invalid data", is_error=True)
        if not isinstance(data, list):
            return ToolResult(content="twin-service returned invalid data", is_error=True)
        # Project to keep payload small for the LLM.
        slim = []
        for building in data:
            if not isinstance(building, dict):
                continue
            raw_domains = building.get("domains")
            if not isinstance(raw_domains, list):
                continue
            domains = [str(domain) for domain in raw_domains]
            if args.domain not in domains:
                continue
            rooms = building.get("rooms")
            slim.append(
                {
                    "id": building.get("id"),
                    "name": building.get("name"),
                    "domains": accessible_domains(ctx.user, domains),
                    "room_count": len(rooms) if isinstance(rooms, list) else 0,
                }
            )
        return ToolResult(content={"buildings": slim})


# ─── get_building ───────────────────────────────────────────────────────────


class GetBuildingArgs(BaseModel):
    building_id: str = Field(description="Unique id of the building (NOT its name).")


class GetBuildingTool:
    name = "get_building"
    description = (
        "Fetch a single building's structural details (name and rooms with capacity, "
        "dimensions, and position). Use when you have a specific building_id. For live "
        "occupancy, temperature, or air quality, use get_latest_sensor_data."
    )
    Args = GetBuildingArgs

    async def run(self, args: GetBuildingArgs, ctx: ToolContext) -> ToolResult:
        building, error = await get_authorized_building(args.building_id, ctx)
        if error is not None:
            return error
        assert building is not None
        return ToolResult(content=_building_payload(building, ctx))


# ─── list_rooms ─────────────────────────────────────────────────────────────


class ListRoomsArgs(BaseModel):
    building_id: str = Field(description="Building whose rooms should be listed.")


class ListRoomsTool:
    name = "list_rooms"
    description = (
        "List a building's rooms with structural data: id, name, capacity, dimensions, "
        "and position. Use to count rooms or resolve a room name to an id. This does not "
        "return live measurements; use get_latest_sensor_data for those."
    )
    Args = ListRoomsArgs

    async def run(self, args: ListRoomsArgs, ctx: ToolContext) -> ToolResult:
        building, error = await get_authorized_building(args.building_id, ctx)
        if error is not None:
            return error
        assert building is not None
        raw_rooms = building.get("rooms", [])
        rooms = raw_rooms if isinstance(raw_rooms, list) else []
        slim = [_room_payload(room) for room in rooms if isinstance(room, dict)]
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
        "Fetch one room's structural state: name, capacity, dimensions, and position. "
        "Use after locating the room id via list_rooms. For live measurements, use "
        "get_latest_sensor_data with this room id."
    )
    Args = GetRoomArgs

    async def run(self, args: GetRoomArgs, ctx: ToolContext) -> ToolResult:
        building, error = await get_authorized_building(args.building_id, ctx)
        if error is not None:
            return error
        assert building is not None
        raw_rooms = building.get("rooms", [])
        rooms = raw_rooms if isinstance(raw_rooms, list) else []
        for room in rooms:
            if isinstance(room, dict) and room.get("id") == args.room_id:
                return ToolResult(content=_room_payload(room))
        return ToolResult(
            content="room unavailable or inaccessible",
            is_error=True,
        )
