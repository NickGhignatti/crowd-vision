from __future__ import annotations

from typing import TYPE_CHECKING, Any
from urllib.parse import quote

import httpx

from app.agent.tools.base import ToolContext, ToolResult
from app.agent.tools.downstream import downstream_error, get_twin_client, get_with_retry
from app.config import get_settings

if TYPE_CHECKING:
    from app.auth import AuthUser


def _has_global_access(user: AuthUser) -> bool:
    return "admin" in user.roles or (
        not get_settings().require_auth and user.user_id == "anonymous"
    )


def can_access_domain(user: AuthUser, domain: str) -> bool:
    return _has_global_access(user) or domain in user.domains


def accessible_domains(user: AuthUser, domains: list[str]) -> list[str]:
    if _has_global_access(user):
        return domains
    allowed = set(user.domains)
    return [domain for domain in domains if domain in allowed]


async def get_authorized_building(
    building_id: str,
    ctx: ToolContext,
) -> tuple[dict[str, Any] | None, ToolResult | None]:
    """Fetch a building and reject inaccessible IDs without revealing existence."""
    try:
        encoded_id = quote(building_id, safe="")
        response = await get_with_retry(get_twin_client(), f"/building/{encoded_id}")
    except httpx.HTTPError:
        return None, ToolResult(content="twin-service is unavailable", is_error=True)

    if response.status_code == 404:
        return None, ToolResult(content="building unavailable or inaccessible", is_error=True)
    if response.status_code >= 400:
        return None, ToolResult(
            content=downstream_error("twin-service", response),
            is_error=True,
        )

    try:
        building = response.json()
    except ValueError:
        return None, ToolResult(content="twin-service returned invalid data", is_error=True)
    if not isinstance(building, dict):
        return None, ToolResult(content="twin-service returned invalid data", is_error=True)
    if str(building.get("id")) != building_id:
        return None, ToolResult(content="building unavailable or inaccessible", is_error=True)

    raw_domains = building.get("domains")
    if not isinstance(raw_domains, list):
        return None, ToolResult(content="twin-service returned invalid data", is_error=True)
    domains = [str(domain) for domain in raw_domains]
    if not accessible_domains(ctx.user, domains):
        return None, ToolResult(content="building unavailable or inaccessible", is_error=True)
    return building, None
