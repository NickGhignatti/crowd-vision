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
        """Connects and blocks until socket-service confirms the room join.

        `subscribe_building` is acknowledged because the join is not immediate
        — the handler resolves the building's domains through twin-service
        first. Emitting without waiting leaves a window in which telemetry is
        published to a room this client has not joined yet, and socket.io
        drops it silently: no buffer, no replay.
        """
        self._client.connect(url, headers=headers, wait_timeout=10)
        ack = self._client.call(
            "subscribe_building", self._building_id, timeout=10
        )
        assert ack.get("subscribed") is True, (
            f"subscribe_building refused for {self._building_id}: {ack}"
        )

    def wait_for_telemetry(self, timeout: float = 10.0) -> dict:
        envelope = self.wait_for_tick(timeout=timeout)
        readings = envelope["readings"]
        assert len(readings) == 1, f"expected a single-reading tick, got {len(readings)}"
        return readings[0]

    def wait_for_tick(self, timeout: float = 10.0) -> dict:
        event, data = self._client.receive(timeout=timeout)
        assert event == "telemetry", f"expected a 'telemetry' event, got {event!r}"
        assert "readings" in data, f"telemetry is always a tick, got {data!r}"
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
