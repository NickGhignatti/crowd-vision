import json

from building import Station
from ubus import hostapd_clients, iwinfo_assoclist, sse

STATION = Station(
    mac="02:aa:bb:cc:dd:ee",
    signal=-61,
    aid=3,
    connected_s=120,
    inactive_ms=40,
    rx_packets=900,
    tx_packets=450,
    stale=False,
)


def test_get_clients_is_keyed_by_mac_and_carries_hostapds_own_fields():
    payload = hostapd_clients(5180, [STATION])
    assert payload["freq"] == 5180
    client = payload["clients"]["02:aa:bb:cc:dd:ee"]
    assert client["signal"] == -61 and client["aid"] == 3
    assert client["assoc"] is True and client["authorized"] is True
    assert client["packets"] == {"rx": 900, "tx": 450}
    assert {"bytes", "airtime", "rate", "rrm", "extended_capabilities"} <= set(client)


def test_assoclist_is_a_list_with_iwinfos_uppercase_mac_and_inactive_time():
    (row,) = iwinfo_assoclist([STATION])["results"]
    assert row["mac"] == "02:AA:BB:CC:DD:EE"
    assert (row["signal"], row["inactive"], row["connected_time"]) == (-61, 40, 120)


def test_an_event_is_framed_the_way_uhttpd_streams_a_subscription():
    framed = sse("probe", {"address": "02:00:00:00:00:01", "signal": -70})
    head, data = framed.split("\n", 1)
    assert head == "event: probe"
    assert data.startswith("data: ") and data.endswith("\n\n")
    assert json.loads(data[len("data: ") :]) == {"address": "02:00:00:00:00:01", "signal": -70}
