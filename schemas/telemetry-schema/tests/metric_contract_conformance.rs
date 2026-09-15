use telemetry_schema::{MetricsDiscoveryResponse, ServiceMetricsContract};

const FIXTURE: &str = include_str!("../../fixtures/metric-contract.json");

// The fixture is what the frontend and the acceptance suite read; they cannot share this
// crate's types, so these bytes are the only thing holding all three languages together.
#[test]
fn the_fixture_parses_into_the_catalog_every_service_serves() {
    let catalog: ServiceMetricsContract = serde_json::from_str(FIXTURE).expect("fixture parses");

    assert_eq!(catalog.service, "telemetry");
    let kinds: Vec<&str> = catalog.metrics.iter().map(|m| m.kind.as_str()).collect();
    assert_eq!(
        kinds,
        vec![
            "temperature",
            "peopleCount",
            "airQuality",
            "totalDeviceCount",
            "ratioDeviceCount"
        ]
    );
}

// A rename on either side changes these bytes; nothing else in Rust would notice, because
// both producers and the consumer build from the same struct and would still agree.
#[test]
fn re_serialising_the_fixture_reproduces_it_byte_for_byte() {
    let parsed: ServiceMetricsContract = serde_json::from_str(FIXTURE).expect("fixture parses");
    let original: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");

    assert_eq!(serde_json::to_value(parsed).unwrap(), original);
}

#[test]
fn the_wire_names_are_the_single_words_the_frontend_reads() {
    let raw: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    let metric = &raw["metrics"][0];

    assert_eq!(metric["kind"], "temperature");
    assert_eq!(metric["interface"], "ITemperature");
    assert_eq!(metric["source"], "telemetry");
    assert_eq!(metric["fields"][0]["type"], "NonEmptyString");
    assert_eq!(metric["actions"][0]["parameters"][0]["type"], "Finite");
}

// A unitless metric sends null rather than omitting the key, so a client can tell
// "no unit" from "this producer is too old to send one".
#[test]
fn a_unitless_metric_carries_an_explicit_null() {
    let raw: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    let air_quality = raw["metrics"]
        .as_array()
        .unwrap()
        .iter()
        .find(|metric| metric["kind"] == "airQuality")
        .expect("the fixture covers a unitless metric");

    assert_eq!(air_quality["unit"], serde_json::Value::Null);
}

#[test]
fn the_whole_fixture_decodes_as_the_service_variant() {
    let decoded: MetricsDiscoveryResponse =
        serde_json::from_str(FIXTURE).expect("fixture parses as a discovery response");

    assert!(matches!(
        decoded,
        MetricsDiscoveryResponse::ServiceContract(_)
    ));
}

// The same bytes minus the wrapper are the bare-array answer a source may send instead, and
// the array dashboard hands the frontend. One fixture therefore covers both hops.
#[test]
fn the_fixtures_metrics_alone_decode_as_the_bare_array_variant() {
    let raw: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    let decoded: MetricsDiscoveryResponse =
        serde_json::from_value(raw["metrics"].clone()).expect("a bare array is a valid answer");

    match decoded {
        MetricsDiscoveryResponse::Metrics(metrics) => assert_eq!(metrics.len(), 5),
        MetricsDiscoveryResponse::ServiceContract(_) => {
            panic!("a bare array must not decode as the service variant")
        }
    }
}
