use notification_schema::{NOTIFICATIONS_CHANNEL, Notification, Severity};

const FIXTURE: &str = include_str!("../../fixtures/notification.json");

#[test]
fn every_case_round_trips_byte_for_byte() {
    for case in cases("cases") {
        let parsed: Notification = serde_json::from_value(case["body"].clone())
            .unwrap_or_else(|e| panic!("{}: {e}", case["name"]));
        assert_eq!(
            serde_json::to_value(parsed).unwrap(),
            case["body"],
            "{}",
            case["name"]
        );
    }
}

#[test]
fn every_rejected_case_fails_to_parse() {
    for case in cases("rejected") {
        assert!(
            serde_json::from_value::<Notification>(case["body"].clone()).is_err(),
            "{} parsed, but it must not: {}",
            case["name"],
            case["reason"]
        );
    }
}

#[test]
fn severity_parses_from_its_wire_name_only() {
    assert_eq!("warning".parse::<Severity>().ok(), Some(Severity::Warning));
    assert!("alert".parse::<Severity>().is_err());
    assert!("Danger".parse::<Severity>().is_err());
}

#[test]
fn socket_and_notification_share_one_channel_name() {
    assert_eq!(NOTIFICATIONS_CHANNEL, "notifications");
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture[group]
        .as_array()
        .expect("fixture group is an array")
        .clone()
}
