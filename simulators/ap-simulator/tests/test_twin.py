import base64
import io
import json
import urllib.error
from email.message import Message

import pytest

from geometry import Point, Room
from twin import SYSTEM_CLAIMS, TwinError, fetch_geometry

URL = "http://digital-twin:3000"
BUILDING = {
    "id": "b1",
    "name": "B1",
    "domains": ["eng"],
    "rooms": [
        {
            "id": "a",
            "name": "A",
            "capacity": 10,
            "position": {"x": 5, "y": 1.5, "z": 5},
            "dimensions": {"width": 10, "height": 3, "depth": 10},
        }
    ],
}
PLACEMENTS = [{"sensorId": "r1", "position": {"x": 1, "y": 2.8, "z": 1}}]


class _Twin:
    def __init__(self, routes: dict) -> None:
        self.routes = routes
        self.requests: list = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        answer = self.routes[request.full_url]
        if isinstance(answer, Exception):
            raise answer
        return io.BytesIO(json.dumps(answer).encode())


def _http(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(URL, code, "refused", Message(), None)


def _routes(building=BUILDING, placements=PLACEMENTS, building_id: str = "b1") -> dict:
    return {
        f"{URL}/building/{building_id}": building,
        f"{URL}/building/{building_id}/placements": placements,
    }


def test_reads_rooms_and_placements_as_the_simulator_identity():
    twin = _Twin(_routes())
    rooms, placements = fetch_geometry(URL, "b1", opener=twin)
    assert rooms == [Room("a", Point(5.0, 1.5, 5.0), 10.0, 3.0, 10.0)]
    assert placements == {"r1": Point(1.0, 2.8, 1.0)}
    for request, timeout in twin.requests:
        assert request.get_header("X-gateway-claims") == SYSTEM_CLAIMS
        assert 0 < timeout <= 2.5
    assert json.loads(base64.b64decode(SYSTEM_CLAIMS))["sub"] == "system:ap-simulator"


@pytest.mark.parametrize("refusal", [_http(403), {"not": "a list"}])
def test_placements_twin_will_not_give_leave_routers_at_their_room_centre(refusal):
    rooms, placements = fetch_geometry(URL, "b1", opener=_Twin(_routes(placements=refusal)))
    assert rooms and placements is None


@pytest.mark.parametrize(
    "failure", [urllib.error.URLError("refused"), _http(404), {"rooms": "nope"}]
)
def test_a_building_twin_cannot_describe_is_an_error(failure):
    with pytest.raises(TwinError):
        fetch_geometry(URL, "b1", opener=_Twin(_routes(building=failure)))


def test_the_building_id_is_escaped_into_the_path():
    fetch_geometry(URL, "a/b", opener=_Twin(_routes(building_id="a%2Fb")))
