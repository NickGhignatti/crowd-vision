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

    def drain_telemetry(self, idle_timeout: float = 5.0) -> int:
        """Count every `telemetry` event already queued, returning once
        `idle_timeout` passes with nothing new. Used to check for loss under
        sustained load, where waiting for one event at a time says nothing.
        """
        received = 0
        while True:
            try:
                event, _ = self._client.receive(timeout=idle_timeout)
            except socketio.exceptions.TimeoutError:
                return received
            if event == "telemetry":
                received += 1

    def disconnect(self) -> None:
        self._client.disconnect()
