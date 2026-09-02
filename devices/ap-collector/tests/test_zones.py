from app.zones import assign_zones, zone_counts

AP_ZONES = {"ap-lobby": "lobby", "ap-floor2": "floor-2", "ap-canteen": "canteen"}


def test_device_heard_by_three_aps_is_counted_once_in_its_loudest_zone():
    readings = [
        ("ap-lobby", "aa:bb", -70),
        ("ap-floor2", "aa:bb", -48),
        ("ap-canteen", "aa:bb", -81),
    ]

    assert assign_zones(readings, AP_ZONES) == {"aa:bb": "floor-2"}
    assert zone_counts(assign_zones(readings, AP_ZONES), AP_ZONES.values()) == {
        "lobby": 0,
        "floor-2": 1,
        "canteen": 0,
    }


def test_equal_rssi_resolves_the_same_way_whatever_the_poll_order():
    forward = [("ap-lobby", "aa:bb", -60), ("ap-floor2", "aa:bb", -60)]
    reverse = list(reversed(forward))

    assert assign_zones(forward, AP_ZONES) == assign_zones(reverse, AP_ZONES)


def test_unmapped_ap_is_ignored_rather_than_crashing_the_tick():
    readings = [("ap-guest-unmapped", "aa:bb", -40), ("ap-lobby", "aa:bb", -70)]

    assert assign_zones(readings, AP_ZONES) == {"aa:bb": "lobby"}


def test_empty_zones_report_zero_not_absence():
    assert zone_counts({}, AP_ZONES.values()) == {"lobby": 0, "floor-2": 0, "canteen": 0}
