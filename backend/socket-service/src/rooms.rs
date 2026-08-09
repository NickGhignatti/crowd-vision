const TELEMETRY_CHANNEL_PREFIX: &str = "telemetry:filtered:";

pub fn building_id_from_channel(channel: &str) -> &str {
    channel
        .strip_prefix(TELEMETRY_CHANNEL_PREFIX)
        .unwrap_or(channel)
}

pub fn room_for_building(building_id: &str) -> String {
    format!("building:{building_id}")
}

pub fn room_for_domain(domain_name: &str) -> String {
    format!("domain:{domain_name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn building_room_is_prefixed_with_building() {
        assert_eq!(room_for_building("b1"), "building:b1");
    }

    #[test]
    fn domain_room_is_prefixed_with_domain() {
        assert_eq!(room_for_domain("acme"), "domain:acme");
    }

    #[test]
    fn building_id_is_the_channel_minus_the_telemetry_prefix() {
        assert_eq!(building_id_from_channel("telemetry:filtered:b1"), "b1");
    }

    #[test]
    fn building_id_keeps_colons_that_belong_to_the_id() {
        assert_eq!(
            building_id_from_channel("telemetry:filtered:site:b1"),
            "site:b1"
        );
    }

    #[test]
    fn building_id_of_an_unprefixed_channel_is_the_whole_channel() {
        assert_eq!(building_id_from_channel("notifications"), "notifications");
    }
}
