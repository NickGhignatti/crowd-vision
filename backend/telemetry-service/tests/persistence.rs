mod support;

use serde_json::json;
use std::sync::Arc;
use support::{fresh_db, seed_building};
use telemetry_service::adapters::driven::postgres::{
    PgBuildings, PgReadings, PgSensors, PgThresholds,
};
use telemetry_service::contracts::building::{RegisteredBuilding, Room};
use telemetry_service::contracts::reading::Reading;
use telemetry_service::contracts::sensor::Sensor;
use telemetry_service::kernel::ports::{
    BuildingStore, ReadingStore, RegisterError, SensorStore, ThresholdStore,
};
use telemetry_service::kernel::registry::PluginRegistry;
use telemetry_service::plugins::air_quality::AirQualityPlugin;
use telemetry_service::plugins::temperature::TemperaturePlugin;

const HOUR_MS: i64 = 3_600_000;
const BASE_MS: i64 = 1_700_000_000_000;

fn registry() -> Arc<PluginRegistry> {
    Arc::new(
        PluginRegistry::new(vec![
            Box::new(TemperaturePlugin),
            Box::new(AirQualityPlugin),
        ])
        .unwrap(),
    )
}

fn reading(
    metric: &str,
    room: &str,
    ts_ms: i64,
    value: f64,
    payload: serde_json::Value,
) -> Reading {
    Reading {
        building_id: "b1".to_owned(),
        room_id: room.to_owned(),
        metric: metric.to_owned(),
        ts_ms,
        value,
        payload: payload.as_object().cloned().unwrap_or_default(),
    }
}

fn temperature(room: &str, ts_ms: i64, value: f64) -> Reading {
    reading(
        "temperature",
        room,
        ts_ms,
        value,
        json!({ "buildingId": "b1", "roomId": room, "timestamp": ts_ms, "temperature": value }),
    )
}

fn bounds(value: serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    value.as_object().cloned().unwrap()
}

#[tokio::test]
async fn a_reading_round_trips_with_millisecond_timestamp_fidelity() {
    let pool = fresh_db("roundtrip").await;
    let readings = PgReadings::new(pool, registry());

    let ts_ms = BASE_MS + 123;
    readings
        .insert(&temperature("r1", ts_ms, 21.5))
        .await
        .unwrap();

    let stored = readings
        .latest("b1", "temperature", "r1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.ts_ms, ts_ms);
    assert_eq!(stored.value, 21.5);
    assert_eq!(stored.building_id, "b1");
    assert_eq!(stored.room_id, "r1");
}

#[tokio::test]
async fn an_inserted_reading_stores_no_envelope_keys_in_its_payload() {
    let pool = fresh_db("trim").await;
    let readings = PgReadings::new(pool.clone(), registry());
    readings
        .insert(&temperature("r1", BASE_MS, 21.5))
        .await
        .unwrap();

    let payload: serde_json::Value = sqlx::query_scalar("select payload from readings")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(payload, json!({}));
}

#[tokio::test]
async fn a_read_reading_carries_its_envelope_back() {
    let pool = fresh_db("reinflate").await;
    let readings = PgReadings::new(pool, registry());
    readings
        .insert(&temperature("r1", BASE_MS, 21.5))
        .await
        .unwrap();

    let stored = readings
        .latest("b1", "temperature", "r1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.payload["buildingId"], json!("b1"));
    assert_eq!(stored.payload["roomId"], json!("r1"));
    assert_eq!(stored.payload["timestamp"], json!(BASE_MS));
    assert_eq!(stored.payload["temperature"], json!(21.5));
}

#[tokio::test]
async fn an_air_quality_reading_keeps_its_eight_extra_measurements() {
    let pool = fresh_db("airquality").await;
    let readings = PgReadings::new(pool.clone(), registry());

    let payload = json!({
        "buildingId": "b1", "roomId": "r1", "timestamp": BASE_MS,
        "scenario": "rush-hour", "pm25": 12.0, "pm10": 20.0, "co2": 800.0,
        "voc": 0.3, "temperature": 22.0, "humidity": 41.0, "aqi": 55.0, "indoor_aqi": 61.0
    });
    readings
        .insert(&reading("airQuality", "r1", BASE_MS, 61.0, payload))
        .await
        .unwrap();

    let stored: serde_json::Value = sqlx::query_scalar("select payload from readings")
        .fetch_one(&pool)
        .await
        .unwrap();
    let stored = stored.as_object().unwrap();
    assert_eq!(stored.len(), 8);
    assert_eq!(stored["co2"], json!(800.0));
    assert!(!stored.contains_key("buildingId"));
    assert!(!stored.contains_key("indoor_aqi"));
}

#[tokio::test]
async fn latest_per_room_returns_the_newest_row_for_each_room_and_nothing_else() {
    let pool = fresh_db("latestperroom").await;
    let readings = PgReadings::new(pool, registry());

    for (room, ts, value) in [
        ("r1", BASE_MS, 20.0),
        ("r1", BASE_MS + 1000, 21.0),
        ("r2", BASE_MS + 500, 19.0),
    ] {
        readings
            .insert(&temperature(room, ts, value))
            .await
            .unwrap();
    }

    let rows = readings.latest_per_room("b1", "temperature").await.unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].room_id, "r1");
    assert_eq!(rows[0].value, 21.0);
    assert_eq!(rows[1].room_id, "r2");
}

#[tokio::test]
async fn series_buckets_hourly_for_a_one_day_range() {
    let pool = fresh_db("series").await;
    let readings = PgReadings::new(pool, registry());

    for (offset, value) in [(0, 20.0), (60_000, 22.0), (HOUR_MS, 30.0)] {
        readings
            .insert(&temperature("r1", BASE_MS + offset, value))
            .await
            .unwrap();
    }

    let buckets = readings
        .series(
            "b1",
            "temperature",
            None,
            (BASE_MS - 1000, BASE_MS + 2 * HOUR_MS),
            "1 hour",
            "avg",
        )
        .await
        .unwrap();

    assert_eq!(buckets.len(), 2);
    assert!(buckets[0].ts_ms < buckets[1].ts_ms);
    assert_eq!(buckets[0].value, 21.0);
    assert_eq!(buckets[1].value, 30.0);
}

#[tokio::test]
async fn each_agg_mode_produces_its_own_aggregate() {
    let pool = fresh_db("aggmodes").await;
    let readings = PgReadings::new(pool, registry());

    for (offset, value) in [(0, 10.0), (60_000, 20.0), (120_000, 30.0)] {
        readings
            .insert(&temperature("r1", BASE_MS + offset, value))
            .await
            .unwrap();
    }

    let window = (BASE_MS - 1000, BASE_MS + HOUR_MS);
    for (agg, expected) in [("avg", 20.0), ("sum", 60.0), ("min", 10.0), ("max", 30.0)] {
        let buckets = readings
            .series("b1", "temperature", None, window, "1 hour", agg)
            .await
            .unwrap();
        assert_eq!(buckets[0].value, expected, "agg mode {agg}");
    }
}

#[tokio::test]
async fn a_room_filter_narrows_the_series() {
    let pool = fresh_db("seriesroom").await;
    let readings = PgReadings::new(pool, registry());
    readings
        .insert(&temperature("r1", BASE_MS, 10.0))
        .await
        .unwrap();
    readings
        .insert(&temperature("r2", BASE_MS, 30.0))
        .await
        .unwrap();

    let buckets = readings
        .series(
            "b1",
            "temperature",
            Some("r1"),
            (BASE_MS - 1000, BASE_MS + HOUR_MS),
            "1 hour",
            "avg",
        )
        .await
        .unwrap();
    assert_eq!(buckets[0].value, 10.0);
}

#[tokio::test]
async fn a_room_threshold_and_a_building_threshold_coexist_and_room_wins() {
    let pool = fresh_db("w1").await;
    let thresholds = PgThresholds::new(pool);

    thresholds
        .upsert(
            "b1",
            None,
            "temperature",
            &bounds(json!({ "maxTemp": 25.0 })),
        )
        .await
        .unwrap();
    thresholds
        .upsert(
            "b1",
            Some("r1"),
            "temperature",
            &bounds(json!({ "maxTemp": 30.0 })),
        )
        .await
        .unwrap();

    let room = thresholds
        .resolve("b1", "temperature", "r1")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(room["maxTemp"], 30.0);

    let other_room = thresholds
        .resolve("b1", "temperature", "r9")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(other_room["maxTemp"], 25.0);

    let building = thresholds
        .building_bounds("b1", "temperature")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(building["maxTemp"], 25.0);
}

#[tokio::test]
async fn upserting_the_same_threshold_twice_updates_rather_than_duplicates() {
    let pool = fresh_db("upsert").await;
    let thresholds = PgThresholds::new(pool.clone());

    thresholds
        .upsert(
            "b1",
            None,
            "temperature",
            &bounds(json!({ "maxTemp": 25.0 })),
        )
        .await
        .unwrap();
    let merged = thresholds
        .upsert(
            "b1",
            None,
            "temperature",
            &bounds(json!({ "minTemp": 18.0 })),
        )
        .await
        .unwrap();

    assert_eq!(merged["maxTemp"], 25.0);
    assert_eq!(merged["minTemp"], 18.0);

    let count: i64 = sqlx::query_scalar("select count(*) from thresholds")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn temperature_limits_joins_rooms_and_bounds() {
    let pool = fresh_db("limits").await;
    seed_building(&pool, "b1", &["r1", "r2"]).await;
    let thresholds = PgThresholds::new(pool);

    thresholds
        .upsert(
            "b1",
            None,
            "temperature",
            &bounds(json!({ "maxTemp": 25.0 })),
        )
        .await
        .unwrap();
    thresholds
        .upsert(
            "b1",
            Some("r1"),
            "temperature",
            &bounds(json!({ "maxTemp": 30.0 })),
        )
        .await
        .unwrap();

    let view = thresholds.temperature_limits("b1").await.unwrap().unwrap();
    assert_eq!(view.max_temperature, Some(25.0));
    assert_eq!(view.rooms.len(), 2);
    assert_eq!(view.rooms[0].room_id, "r1");
    assert_eq!(view.rooms[0].max_temperature, Some(30.0));
    assert_eq!(view.rooms[1].room_id, "r2");
    assert_eq!(view.rooms[1].max_temperature, None);
}

#[tokio::test]
async fn temperature_limits_of_an_unregistered_building_is_absent() {
    let pool = fresh_db("nolimits").await;
    let thresholds = PgThresholds::new(pool);
    assert!(thresholds.temperature_limits("b1").await.unwrap().is_none());
}

#[tokio::test]
async fn registering_a_duplicate_sensor_violates_the_primary_key() {
    let pool = fresh_db("dupsensor").await;
    let sensors = PgSensors::new(pool);

    let sensor = Sensor {
        building_id: "b1".to_owned(),
        room_id: "r1".to_owned(),
        sensor_id: "s1".to_owned(),
        sensor_type: "temperature".to_owned(),
        driver: Some("tp-simulator".to_owned()),
        endpoint: Some("http://gateway/simulator/tp".to_owned()),
    };
    sensors.register(&sensor).await.unwrap();

    let error = sensors.register(&sensor).await.unwrap_err();
    assert!(matches!(error, RegisterError::AlreadyExists));

    let elsewhere = Sensor {
        room_id: "r2".to_owned(),
        ..sensor
    };
    sensors.register(&elsewhere).await.unwrap();
    assert_eq!(sensors.by_building("b1").await.unwrap().len(), 2);
    assert_eq!(sensors.by_room("b1", "r1").await.unwrap().len(), 1);
}

#[tokio::test]
async fn registering_a_building_twice_converges() {
    let pool = fresh_db("rereg").await;
    let buildings = PgBuildings::new(pool.clone());

    let building = RegisteredBuilding {
        id: "b1".to_owned(),
        name: "HQ".to_owned(),
        rooms: vec![Room {
            id: "r1".to_owned(),
            name: "Lobby".to_owned(),
        }],
    };
    buildings.upsert(&building).await.unwrap();

    let renamed = RegisteredBuilding {
        name: "Head Office".to_owned(),
        rooms: vec![
            Room {
                id: "r1".to_owned(),
                name: "Reception".to_owned(),
            },
            Room {
                id: "r2".to_owned(),
                name: "Lab".to_owned(),
            },
        ],
        ..building
    };
    buildings.upsert(&renamed).await.unwrap();

    let name: String = sqlx::query_scalar("select name from buildings where id = 'b1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "Head Office");

    let rooms: Vec<String> = sqlx::query_scalar(
        "select name from building_rooms where building_id = 'b1' order by room_id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(rooms, vec!["Reception", "Lab"]);
}

#[tokio::test]
async fn a_week_range_reads_from_readings_hourly_not_readings() {
    let pool = fresh_db("rollup").await;
    let readings = PgReadings::new(pool.clone(), registry());

    let midnight_ms = 1_699_920_000_000;
    for hour in 0..3 {
        readings
            .insert(&temperature(
                "r1",
                midnight_ms + hour * HOUR_MS,
                20.0 + hour as f64,
            ))
            .await
            .unwrap();
    }

    sqlx::query("call refresh_continuous_aggregate('readings_hourly', null, null)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("delete from readings")
        .execute(&pool)
        .await
        .unwrap();

    let buckets = readings
        .series(
            "b1",
            "temperature",
            None,
            (midnight_ms, midnight_ms + 5 * HOUR_MS),
            "1 day",
            "avg",
        )
        .await
        .unwrap();

    assert_eq!(buckets.len(), 1);
    assert_eq!(buckets[0].ts_ms, midnight_ms);
    assert_eq!(buckets[0].value, 21.0);
}
