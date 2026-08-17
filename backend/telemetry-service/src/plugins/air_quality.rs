use crate::contracts::plugin::{
    BoundDirection, BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin, check_fields,
};
use crate::contracts::reading::Reading;
use crate::plugins::common::reading;
use serde_json::Value;

static DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    key: "airQuality",
    label: "Air Quality",
    interface_name: "IAirQuality",
    unit: None,
    fields: &[
        FieldSpec {
            name: "buildingId",
            kind: FieldKind::NonEmptyString,
            required: true,
        },
        FieldSpec {
            name: "roomId",
            kind: FieldKind::NonEmptyString,
            required: true,
        },
        FieldSpec {
            name: "timestamp",
            kind: FieldKind::Finite,
            required: true,
        },
        FieldSpec {
            name: "scenario",
            kind: FieldKind::NonEmptyString,
            required: false,
        },
        FieldSpec {
            name: "pm25",
            kind: FieldKind::Finite,
            required: true,
        },
        FieldSpec {
            name: "co2",
            kind: FieldKind::Finite,
            required: true,
        },
        FieldSpec {
            name: "pm10",
            kind: FieldKind::Finite,
            required: false,
        },
        FieldSpec {
            name: "voc",
            kind: FieldKind::Finite,
            required: false,
        },
        FieldSpec {
            name: "temperature",
            kind: FieldKind::Finite,
            required: false,
        },
        FieldSpec {
            name: "humidity",
            kind: FieldKind::Finite,
            required: false,
        },
        FieldSpec {
            name: "aqi",
            kind: FieldKind::Finite,
            required: false,
        },
        FieldSpec {
            name: "indoor_aqi",
            kind: FieldKind::Finite,
            required: false,
        },
    ],
};

static BOUNDS: &[BoundSpec] = &[
    BoundSpec {
        key: "maxCo2",
        direction: BoundDirection::Above,
    },
    BoundSpec {
        key: "maxAqi",
        direction: BoundDirection::Above,
    },
];

pub struct AirQualityPlugin;

impl SensorPlugin for AirQualityPlugin {
    fn key(&self) -> &'static str {
        DESCRIPTOR.key
    }

    fn descriptor(&self) -> &MetricDescriptor {
        &DESCRIPTOR
    }

    fn validate(&self, payload: &Value) -> Result<Reading, Vec<String>> {
        let errors = check_fields(DESCRIPTOR.fields, payload);
        if !errors.is_empty() {
            return Err(errors);
        }
        let value = payload["indoor_aqi"].as_f64().unwrap_or_default();
        Ok(reading(payload, DESCRIPTOR.key, value))
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        BOUNDS
    }

    fn alert_channel(&self) -> &'static str {
        "alerts:airQuality"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payload() -> Value {
        json!({
            "buildingId": "b1",
            "roomId": "r1",
            "timestamp": 1_700_000_000_000i64,
            "pm25": 8.2,
            "co2": 615.0,
            "indoor_aqi": 31.0
        })
    }

    #[test]
    fn a_valid_payload_becomes_a_reading_carrying_the_indoor_aqi_as_its_value() {
        let reading = AirQualityPlugin.validate(&payload()).unwrap();
        assert_eq!(reading.metric, "airQuality");
        assert_eq!(reading.ts_ms, 1_700_000_000_000);
        assert_eq!(reading.value, 31.0);
    }

    #[test]
    fn a_payload_without_an_indoor_aqi_reads_as_zero() {
        let mut payload = payload();
        payload.as_object_mut().unwrap().remove("indoor_aqi");
        assert_eq!(AirQualityPlugin.validate(&payload).unwrap().value, 0.0);
    }

    #[test]
    fn only_the_envelope_pm25_and_co2_are_required() {
        let minimal = json!({
            "buildingId": "b1",
            "roomId": "r1",
            "timestamp": 1_700_000_000_000i64,
            "pm25": 8.2,
            "co2": 615.0
        });
        assert!(AirQualityPlugin.validate(&minimal).is_ok());
    }

    #[test]
    fn a_payload_missing_pm25_and_co2_reports_both() {
        let errors = AirQualityPlugin
            .validate(&json!({
                "buildingId": "b1",
                "roomId": "r1",
                "timestamp": 1_700_000_000_000i64
            }))
            .unwrap_err();
        assert_eq!(
            errors,
            vec![
                "pm25: must be a finite number.",
                "co2: must be a finite number.",
            ]
        );
    }

    #[test]
    fn an_optional_field_that_is_present_is_still_checked() {
        let mut payload = payload();
        payload["humidity"] = json!("47");
        assert_eq!(
            AirQualityPlugin.validate(&payload).unwrap_err(),
            vec!["humidity: must be a finite number."]
        );
    }

    #[test]
    fn the_full_snapshot_is_carried_through_for_the_dashboard() {
        let mut payload = payload();
        payload["voc"] = json!(0.3);
        let reading = AirQualityPlugin.validate(&payload).unwrap();
        assert_eq!(reading.payload["voc"], json!(0.3));
        assert_eq!(reading.payload["pm25"], json!(8.2));
    }

    #[test]
    fn breaches_are_bounded_above_by_max_co2_and_max_aqi() {
        assert_eq!(
            AirQualityPlugin.bounds(),
            &[
                BoundSpec {
                    key: "maxCo2",
                    direction: BoundDirection::Above
                },
                BoundSpec {
                    key: "maxAqi",
                    direction: BoundDirection::Above
                },
            ]
        );
    }

    #[test]
    fn breaches_are_published_to_the_air_quality_alert_channel() {
        assert_eq!(AirQualityPlugin.alert_channel(), "alerts:airQuality");
    }
}
