use telemetry_schema::{TelemetryEnvelope, TelemetryReading};

const FIXTURE: &str = include_str!("../../fixtures/telemetry-envelope.json");

#[test]
fn every_tick_and_every_reading_round_trips_byte_for_byte() {
    for case in cases("cases") {
        let envelope: TelemetryEnvelope = serde_json::from_value(case["body"].clone())
            .unwrap_or_else(|e| panic!("{}: {e}", case["name"]));
        assert_eq!(
            serde_json::to_value(&envelope).unwrap(),
            case["body"],
            "{}",
            case["name"]
        );

        for reading in &envelope.readings {
            let parsed: TelemetryReading = serde_json::from_value(reading.clone())
                .unwrap_or_else(|e| panic!("{}: {e}", case["name"]));
            assert_eq!(
                &serde_json::to_value(parsed).unwrap(),
                reading,
                "{}",
                case["name"]
            );
        }
    }
}

#[test]
fn every_rejected_tick_fails_to_parse() {
    for case in cases("rejected") {
        let parsed = serde_json::from_value::<TelemetryEnvelope>(case["body"].clone());
        let refused = match parsed {
            Err(_) => true,
            Ok(envelope) => envelope
                .readings
                .into_iter()
                .any(|r| serde_json::from_value::<TelemetryReading>(r).is_err()),
        };
        assert!(refused, "{} parsed: {}", case["name"], case["reason"]);
    }
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture[group]
        .as_array()
        .expect("fixture group is an array")
        .clone()
}
