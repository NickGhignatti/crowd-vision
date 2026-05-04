from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.agent.tools.sensor import GetOccupancyHistoryArgs, GetOccupancyHistoryTool


class _FakeResponse:
    def __init__(self, status_code: int, payload: Any = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self) -> Any:
        return self._payload


class _FakeClient:
    """Minimal async-context-manager stand-in for httpx.AsyncClient."""

    def __init__(self, response: _FakeResponse) -> None:
        self._response = response
        self.last_url: str | None = None
        self.last_params: dict[str, Any] | None = None

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def get(self, url: str, params: dict[str, Any] | None = None) -> _FakeResponse:
        self.last_url = url
        self.last_params = params
        return self._response


@pytest.mark.asyncio
async def test_happy_path_projects_buckets_and_summary():
    payload = {
        "peopleCount": [
            {"timestamp": "2026-05-04T10:00:00Z", "avg": 4, "min": 2, "max": 6, "sum": 80},
            {"timestamp": "2026-05-04T11:00:00Z", "avg": 8, "min": 5, "max": 12, "sum": 160},
            {"timestamp": "2026-05-04T12:00:00Z", "avg": 3, "min": 1, "max": 5, "sum": 60},
        ]
    }
    fake = _FakeClient(_FakeResponse(200, payload))
    args = GetOccupancyHistoryArgs(building_id="b1", room_id="r1", time_range="1D")

    with patch("app.agent.tools.sensor._client", return_value=fake):
        result = await GetOccupancyHistoryTool().run(args, ctx=AsyncMock())

    assert result.is_error is False
    assert fake.last_url == "/peopleCount/dashboard"
    assert fake.last_params == {"building": "b1", "roomId": "r1", "timeRange": "1D"}

    content = result.content
    assert content["building_id"] == "b1"
    assert content["room_id"] == "r1"
    assert content["time_range"] == "1D"
    assert len(content["buckets"]) == 3
    # Slim projection drops `sum`.
    assert "sum" not in content["buckets"][0]

    summary = content["summary"]
    assert summary["bucket_count"] == 3
    assert summary["avg_overall"] == 5.0  # (4 + 8 + 3) / 3
    assert summary["peak"] == {"timestamp": "2026-05-04T11:00:00Z", "value": 12}


@pytest.mark.asyncio
async def test_empty_series_yields_empty_summary():
    fake = _FakeClient(_FakeResponse(200, {"peopleCount": []}))
    args = GetOccupancyHistoryArgs(building_id="b1", room_id="r1", time_range="1W")

    with patch("app.agent.tools.sensor._client", return_value=fake):
        result = await GetOccupancyHistoryTool().run(args, ctx=AsyncMock())

    assert result.is_error is False
    assert result.content["buckets"] == []
    assert result.content["summary"] == {"bucket_count": 0}


@pytest.mark.asyncio
async def test_upstream_error_surfaces_as_tool_error():
    fake = _FakeClient(_FakeResponse(503, payload=None, text="upstream down"))
    args = GetOccupancyHistoryArgs(building_id="b1", room_id="r1", time_range="1D")

    with patch("app.agent.tools.sensor._client", return_value=fake):
        result = await GetOccupancyHistoryTool().run(args, ctx=AsyncMock())

    assert result.is_error is True
    assert "503" in result.content
    assert "upstream down" in result.content
