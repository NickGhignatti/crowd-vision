from __future__ import annotations

import scenarios
from ubus import NULL_SESSION, UBUS_OK, UBUS_PERMISSION_DENIED
from world import World


def main() -> None:
    world = World(scenarios.corridor(), seed=1)

    # Wrong credentials are rejected.
    assert world.login("ap-a", "collector", "wrong") is None

    # Right credentials issue a token that authorises subsequent calls.
    token = world.login("ap-a", "collector", "collector")
    assert token is not None
    assert world.check_session("ap-a", token)
    assert not world.check_session("ap-a", "not-a-real-token")

    # The walking phone is seen by at least one AP.
    clients_a = world.clients("ap-a")
    clients_b = world.clients("ap-b")
    seen_macs = {mac for mac, _ in clients_a} | {mac for mac, _ in clients_b}
    assert "aa:bb:cc:00:00:01" in seen_macs

    # A killed AP answers nothing until revived.
    world.kill("ap-a")
    assert world.is_down("ap-a")
    world.revive("ap-a")
    assert not world.is_down("ap-a")

    assert UBUS_OK == 0
    assert UBUS_PERMISSION_DENIED == 6
    assert len(NULL_SESSION) == 32

    print("ok")


if __name__ == "__main__":
    main()
