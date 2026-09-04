import json

import pytest

from app.config import (
    DEFAULT_POLL_INTERVAL,
    DEFAULT_REQUEST_TIMEOUT,
    READERS,
    AccessPoint,
    Building,
    Config,
)

GOOD_AP = {
    "name": "ap-a",
    "zone": "zone-a",
    "url": "http://localhost:3003/ap-a/ubus",
    "username": "collector",
    "password": "collector",
    "ifaces": ["wlan0"],
    "reader": "hostapd",
}


def _write(tmp_path, data):
    path = tmp_path / "collector.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def test_valid_building_parses_and_converts_nested_aps():
    building = Building.from_json({"name": "b1", "ap": [GOOD_AP]})

    assert building.name == "b1"
    assert len(building.ap) == 1
    assert isinstance(building.ap[0], AccessPoint)
    assert building.ap[0].url == GOOD_AP["url"]


def test_reader_defaults_to_hostapd_when_omitted():
    entry = dict(GOOD_AP)
    del entry["reader"]

    ap = AccessPoint.from_json(entry)

    assert ap.reader == "hostapd"


@pytest.mark.parametrize("field", ["name", "zone", "url", "username"])
def test_empty_required_ap_field_raises(field):
    entry = dict(GOOD_AP, **{field: ""})

    with pytest.raises(ValueError, match=field):
        AccessPoint.from_json(entry)


def test_empty_ifaces_raises():
    entry = dict(GOOD_AP, ifaces=[])

    with pytest.raises(ValueError, match=r"(?i)ifaces"):
        AccessPoint.from_json(entry)


def test_non_string_iface_raises():
    entry = dict(GOOD_AP, ifaces=[1])

    with pytest.raises(ValueError, match=r"(?i)ifaces"):
        AccessPoint.from_json(entry)


def test_unknown_reader_raises():
    entry = dict(GOOD_AP, reader="snmp")

    with pytest.raises(ValueError, match=r"(?i)reader"):
        AccessPoint.from_json(entry)


def test_every_declared_reader_is_accepted():
    for reader in READERS:
        AccessPoint.from_json(dict(GOOD_AP, reader=reader))


def test_empty_building_name_raises():
    with pytest.raises(ValueError, match=r"(?i)name"):
        Building.from_json({"name": "", "ap": [GOOD_AP]})


def test_building_with_no_aps_raises():
    with pytest.raises(ValueError, match=r"(?i)ap"):
        Building.from_json({"name": "b1", "ap": []})


def test_duplicate_ap_names_in_a_building_raise():
    second = dict(GOOD_AP, zone="zone-b", url="http://localhost:3003/ap-b/ubus")

    with pytest.raises(ValueError, match=r"(?i)ap names"):
        Building.from_json({"name": "b1", "ap": [GOOD_AP, second]})


def test_get_ap_finds_by_name_and_returns_none_for_unknown():
    building = Building.from_json({"name": "b1", "ap": [GOOD_AP]})

    assert building.get_ap("ap-a") is building.ap[0]
    assert building.get_ap("nope") is None


def test_load_from_config_file_parses_multiple_buildings(tmp_path):
    data = {
        "buildings": [
            {"name": "b1", "ap": [GOOD_AP]},
            {
                "name": "b2",
                "ap": [
                    dict(GOOD_AP, name="ap-c", zone="zone-c", url="http://localhost:3003/ap-c/ubus")
                ],
            },
        ]
    }
    path = _write(tmp_path, data)

    config = Config([])
    config.load_from_config_file(path)

    assert [b.name for b in config.buildings] == ["b1", "b2"]
    assert config.buildings[0].ap[0].name == "ap-a"
    assert config.buildings[1].ap[0].name == "ap-c"


def test_load_from_config_file_empty_buildings_raises(tmp_path):
    path = _write(tmp_path, {"buildings": []})

    with pytest.raises(ValueError, match=r"(?i)buildings"):
        Config([]).load_from_config_file(path)


def test_load_from_config_file_missing_buildings_key_raises(tmp_path):
    path = _write(tmp_path, {})

    with pytest.raises(ValueError, match=r"(?i)buildings"):
        Config([]).load_from_config_file(path)


def test_load_from_config_file_duplicate_building_names_raise(tmp_path):
    data = {"buildings": [{"name": "b1", "ap": [GOOD_AP]}, {"name": "b1", "ap": [GOOD_AP]}]}
    path = _write(tmp_path, data)

    with pytest.raises(ValueError, match=r"(?i)building names"):
        Config([]).load_from_config_file(path)


def test_a_failed_reload_does_not_clobber_the_previous_buildings(tmp_path):
    original = [Building.from_json({"name": "b1", "ap": [GOOD_AP]})]
    config = Config(original)
    bad_path = _write(tmp_path, {"buildings": []})

    with pytest.raises(ValueError):
        config.load_from_config_file(bad_path)

    assert config.buildings is original


def test_poll_interval_and_timeout_are_read_from_json(tmp_path):
    data = {
        "pollIntervalS": 10,
        "requestTimeoutS": 4,
        "buildings": [{"name": "b1", "ap": [GOOD_AP]}],
    }
    path = _write(tmp_path, data)

    config = Config([], poll_interval=60, default_timeout=600)
    config.load_from_config_file(path)

    assert config.poll_interval == 10
    assert config.default_timeout == 4


def test_poll_interval_and_timeout_default_when_omitted_from_json(tmp_path):
    """Missing from the file means the module DEFAULT_*, not whatever the instance
    already happened to hold -- a reload must not leak a previous load's values in."""
    data = {"buildings": [{"name": "b1", "ap": [GOOD_AP]}]}
    path = _write(tmp_path, data)

    config = Config([], poll_interval=999, default_timeout=999)
    config.load_from_config_file(path)

    assert config.poll_interval == DEFAULT_POLL_INTERVAL
    assert config.default_timeout == DEFAULT_REQUEST_TIMEOUT


def test_request_timeout_greater_than_poll_interval_raises(tmp_path):
    data = {
        "pollIntervalS": 2,
        "requestTimeoutS": 5,
        "buildings": [{"name": "b1", "ap": [GOOD_AP]}],
    }
    path = _write(tmp_path, data)

    with pytest.raises(ValueError, match=r"(?i)requestTimeoutS"):
        Config([]).load_from_config_file(path)


def test_a_failed_timeout_validation_does_not_clobber_previous_settings(tmp_path):
    config = Config([Building.from_json({"name": "b1", "ap": [GOOD_AP]})], poll_interval=5)
    bad_data = {
        "pollIntervalS": 2,
        "requestTimeoutS": 5,
        "buildings": [{"name": "b2", "ap": [GOOD_AP]}],
    }
    bad_path = _write(tmp_path, bad_data)

    with pytest.raises(ValueError):
        config.load_from_config_file(bad_path)

    assert config.poll_interval == 5
    assert [b.name for b in config.buildings] == ["b1"]


def test_load_env_reads_telemetry_service_url(monkeypatch):
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry:8080")
    monkeypatch.setenv("TELEMETRY_SERVICE_SECRET", "my-secret")
    config = Config([])

    config.load_env()

    assert config.telemetry_service == "http://telemetry:8080"
    assert config.telemetry_secret == "my-secret"


def test_load_env_raises_when_telemetry_service_url_is_unset(monkeypatch):
    monkeypatch.delenv("TELEMETRY_SERVICE_URL", raising=False)
    monkeypatch.setenv("TELEMETRY_SERVICE_SECRET", "my-secret")
    config = Config([])

    with pytest.raises(ValueError, match=r"(?i)TELEMETRY_SERVICE_URL must be set"):
        config.load_env()


def test_load_env_raises_when_telemetry_service_secret_is_unset(monkeypatch):
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry:8080")
    monkeypatch.delenv("TELEMETRY_SERVICE_SECRET", raising=False)
    config = Config([])

    with pytest.raises(ValueError, match=r"(?i)TELEMETRY_SERVICE_SECRET must be set"):
        config.load_env()
