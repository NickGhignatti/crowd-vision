"""What the twin tools return when digital-twin misbehaves.

The authorization happy/denied paths live in test_agent_tools.py. This file
covers the guards *around* that decision, and they share one invariant worth
stating: a building that does not exist and a building the caller may not see
must be indistinguishable. `get_authorized_building` is the single place that
holds it for every twin tool, so it is tested once here rather than per tool.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

import httpx
import pytest

from app.agent.tools import access as access_module
from app.agent.tools import downstream as downstream_module
from app.agent.tools import twin as twin_module
from app.agent.tools.access import get_authorized_building
from app.agent.tools.base import ToolContext
from app.agent.tools.downstream import (
    close_downstream_clients,
    downstream_error,
    get_with_retry,
)
from app.agent.tools.twin import GetRoomArgs, GetRoomTool
from app.auth import AuthUser

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

NOT_FOUND_OR_FORBIDDEN = "building unavailable or inaccessible"
INVALID = "digital-twin returned invalid data"


def _context(*, domains: list[str] | None = None) -> ToolContext:
    return ToolContext(
        user=AuthUser("user-1", roles=[], domains=domains or ["unibo.it"], raw_token="tok"),
        session=cast("AsyncSession", object()),  # never touched by these tools
    )


def _twin(monkeypatch, handler) -> None:
    client = httpx.AsyncClient(base_url="http://twin.test", transport=httpx.MockTransport(handler))
    monkeypatch.setattr(access_module, "get_twin_client", lambda: client)


def _responds(body, status: int = 200):
    def handler(_request: httpx.Request) -> httpx.Response:
        if isinstance(body, str):
            return httpx.Response(status, text=body)
        return httpx.Response(status, json=body)

    return handler


@pytest.mark.asyncio
async def test_a_missing_building_is_indistinguishable_from_a_forbidden_one(monkeypatch):
    _twin(monkeypatch, _responds({"detail": "not found"}, status=404))
    missing, missing_err = await get_authorized_building("building-1", _context())

    _twin(monkeypatch, _responds({"id": "building-1", "domains": ["other.it"], "rooms": []}))
    forbidden, forbidden_err = await get_authorized_building("building-1", _context())

    assert missing is None and forbidden is None
    assert missing_err is not None and forbidden_err is not None
    # Same wording, same error flag: the answer must not leak which case it was.
    assert missing_err.content == forbidden_err.content == NOT_FOUND_OR_FORBIDDEN
    assert missing_err.is_error and forbidden_err.is_error


@pytest.mark.asyncio
async def test_a_building_answered_under_a_different_id_is_refused(monkeypatch):
    # A twin that answers /building/<a> with building <b> would otherwise hand the
    # caller a building whose domains were never the ones we authorized against.
    _twin(monkeypatch, _responds({"id": "building-2", "domains": ["unibo.it"], "rooms": []}))

    building, error = await get_authorized_building("building-1", _context())

    assert building is None
    assert error is not None
    assert error.content == NOT_FOUND_OR_FORBIDDEN


@pytest.mark.asyncio
async def test_an_unreachable_twin_is_reported_as_unavailable(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    _twin(monkeypatch, handler)

    building, error = await get_authorized_building("building-1", _context())

    assert building is None
    assert error is not None
    assert error.content == "digital-twin is unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        pytest.param("not json at all", id="not-json"),
        pytest.param(["a", "list"], id="not-an-object"),
        pytest.param({"id": "building-1", "domains": "unibo.it"}, id="domains-not-a-list"),
    ],
)
async def test_a_malformed_building_is_not_parsed_into_an_authorization_decision(monkeypatch, body):
    _twin(monkeypatch, _responds(body))

    building, error = await get_authorized_building("building-1", _context())

    assert building is None
    assert error is not None
    assert error.content == INVALID


@pytest.mark.asyncio
async def test_an_upstream_failure_is_surfaced_with_its_status(monkeypatch):
    _twin(monkeypatch, _responds({"detail": "boom"}, status=500))

    building, error = await get_authorized_building("building-1", _context())

    assert building is None
    assert error is not None
    assert "500" in str(error.content)


def test_rate_limiting_is_named_rather_than_reported_as_a_bare_status():
    rate_limited = downstream_error("digital-twin", httpx.Response(429))
    other = downstream_error("digital-twin", httpx.Response(503))

    assert rate_limited == "digital-twin is rate-limited; try again later"
    assert other == "digital-twin request failed with status 503"


@pytest.mark.asyncio
async def test_a_room_the_building_does_not_have_is_refused_without_a_lookup(monkeypatch):
    _twin(
        monkeypatch,
        _responds({"id": "building-1", "domains": ["unibo.it"], "rooms": [{"id": "room-1"}]}),
    )

    result = await GetRoomTool().run(
        GetRoomArgs(building_id="building-1", room_id="room-404"), _context()
    )

    assert result.is_error
    assert result.content == "room unavailable or inaccessible"


@pytest.mark.asyncio
async def test_a_transport_error_is_retried_once_then_succeeds(monkeypatch):
    monkeypatch.setattr(downstream_module.asyncio, "sleep", _no_sleep)
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) == 1:
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(200, json={"ok": True})

    client = httpx.AsyncClient(base_url="http://t.test", transport=httpx.MockTransport(handler))

    response = await get_with_retry(client, "/thing")

    assert response.status_code == 200
    assert len(attempts) == 2


@pytest.mark.asyncio
async def test_a_transport_error_on_the_retry_is_raised_rather_than_looping(monkeypatch):
    monkeypatch.setattr(downstream_module.asyncio, "sleep", _no_sleep)
    attempts = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        raise httpx.ConnectError("refused", request=request)

    client = httpx.AsyncClient(base_url="http://t.test", transport=httpx.MockTransport(handler))

    with pytest.raises(httpx.ConnectError):
        await get_with_retry(client, "/thing")

    # Bounded: the caller sees the failure rather than the tool retrying forever.
    assert len(attempts) == 2


@pytest.mark.asyncio
async def test_a_transient_gateway_status_is_retried_and_the_second_answer_returned(monkeypatch):
    monkeypatch.setattr(downstream_module.asyncio, "sleep", _no_sleep)
    statuses = iter([503, 200])

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(next(statuses), json={})

    client = httpx.AsyncClient(base_url="http://t.test", transport=httpx.MockTransport(handler))

    response = await get_with_retry(client, "/thing")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_a_transient_status_that_persists_is_returned_rather_than_raised(monkeypatch):
    monkeypatch.setattr(downstream_module.asyncio, "sleep", _no_sleep)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={})

    client = httpx.AsyncClient(base_url="http://t.test", transport=httpx.MockTransport(handler))

    response = await get_with_retry(client, "/thing")

    # The tool turns this into downstream_error; get_with_retry must not raise.
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_closing_the_downstream_clients_lets_the_next_call_build_fresh_ones():
    first = downstream_module.get_twin_client()
    assert downstream_module.get_twin_client() is first  # cached while open

    await close_downstream_clients()

    assert first.is_closed
    assert downstream_module.get_twin_client() is not first


async def _no_sleep(_seconds: float) -> None:
    return None


@pytest.mark.asyncio
async def test_list_buildings_keeps_only_buildings_carrying_the_requested_domain(monkeypatch):
    # The twin is asked for one domain, but the tool re-checks every row: a twin that
    # over-answers must not widen what the model gets to see.
    body = [
        {"id": "b1", "name": "In scope", "domains": ["unibo.it"], "rooms": []},
        {"id": "b2", "name": "Other tenant", "domains": ["other.it"], "rooms": []},
        {"id": "b3", "name": "Domains not a list", "domains": "unibo.it", "rooms": []},
        "not even an object",
    ]
    client = httpx.AsyncClient(
        base_url="http://twin.test", transport=httpx.MockTransport(_responds(body))
    )
    monkeypatch.setattr(twin_module, "get_twin_client", lambda: client)

    result = await twin_module.ListBuildingsTool().run(
        twin_module.ListBuildingsArgs(domain="unibo.it"), _context()
    )

    assert not result.is_error
    assert [b["id"] for b in result.content["buildings"]] == ["b1"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler_body", "status", "expected"),
    [
        pytest.param({"detail": "boom"}, 500, "500", id="upstream-error"),
        pytest.param("not json", 200, INVALID, id="not-json"),
        pytest.param({"buildings": []}, 200, INVALID, id="not-a-list"),
    ],
)
async def test_list_buildings_reports_a_bad_answer_rather_than_an_empty_list(
    monkeypatch, handler_body, status, expected
):
    # An empty list would read to the model as "this domain has no buildings",
    # which is a different — and wrong — answer than "the twin is broken".
    client = httpx.AsyncClient(
        base_url="http://twin.test",
        transport=httpx.MockTransport(_responds(handler_body, status=status)),
    )
    monkeypatch.setattr(twin_module, "get_twin_client", lambda: client)

    result = await twin_module.ListBuildingsTool().run(
        twin_module.ListBuildingsArgs(domain="unibo.it"), _context()
    )

    assert result.is_error
    assert expected in str(result.content)


@pytest.mark.asyncio
async def test_list_buildings_reports_an_unreachable_twin(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    client = httpx.AsyncClient(base_url="http://twin.test", transport=httpx.MockTransport(handler))
    monkeypatch.setattr(twin_module, "get_twin_client", lambda: client)

    result = await twin_module.ListBuildingsTool().run(
        twin_module.ListBuildingsArgs(domain="unibo.it"), _context()
    )

    assert result.is_error
    assert result.content == "digital-twin is unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invoke",
    [
        pytest.param(
            lambda ctx: twin_module.GetBuildingTool().run(
                twin_module.GetBuildingArgs(building_id="building-1"), ctx
            ),
            id="get_building",
        ),
        pytest.param(
            lambda ctx: twin_module.ListRoomsTool().run(
                twin_module.ListRoomsArgs(building_id="building-1"), ctx
            ),
            id="list_rooms",
        ),
        pytest.param(
            lambda ctx: GetRoomTool().run(
                GetRoomArgs(building_id="building-1", room_id="room-1"), ctx
            ),
            id="get_room",
        ),
    ],
)
async def test_every_building_scoped_tool_forwards_the_authorization_refusal(monkeypatch, invoke):
    _twin(monkeypatch, _responds({"detail": "not found"}, status=404))

    result = await invoke(_context())

    assert result.is_error
    assert result.content == NOT_FOUND_OR_FORBIDDEN


@pytest.mark.asyncio
async def test_get_building_reports_only_the_domains_the_caller_may_see(monkeypatch):
    _twin(
        monkeypatch,
        _responds(
            {
                "id": "building-1",
                "name": "Engineering",
                "domains": ["unibo.it", "other.it"],
                "rooms": [{"id": "room-1", "name": "Lab", "capacity": 30}],
                "_id": "internal-mongo-id",
            }
        ),
    )

    result = await twin_module.GetBuildingTool().run(
        twin_module.GetBuildingArgs(building_id="building-1"), _context(domains=["unibo.it"])
    )

    assert not result.is_error
    assert result.content["domains"] == ["unibo.it"]
    assert "_id" not in result.content, "the twin's internal id is not the model's business"
