import socketio


class DashboardSocket:
    """A test stand-in for the frontend's live-dashboard connection: join a
    building's room and wait for `telemetry` events, the same shape
    frontend/src/stores/sensorData.ts uses against the real socket-service.
    """

    def __init__(self, building_id: str):
        self._building_id = building_id
        self._client = socketio.SimpleClient()

    def connect(self, url: str, headers: dict[str, str]) -> None:
        self._client.connect(url, headers=headers, wait_timeout=10)
        self._client.emit("subscribe_building", self._building_id)

    def wait_for_telemetry(self, timeout: float = 10.0) -> dict:
        event, data = self._client.receive(timeout=timeout)
        assert event == "telemetry", f"expected a 'telemetry' event, got {event!r}"
        return data

    def disconnect(self) -> None:
        self._client.disconnect()
