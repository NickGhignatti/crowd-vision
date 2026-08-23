use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use telemetry_service::adapters::driven::dispatch::HttpDispatch;
use telemetry_service::adapters::driven::kafka_producer::KafkaEvents;
use telemetry_service::adapters::driven::postgres::{
    PgBuildings, PgReadings, PgSensors, PgThresholds,
};
use telemetry_service::adapters::driven::redis_fanout::RedisFanout;
use telemetry_service::adapters::driven::threshold_cache::CachedThresholds;
use telemetry_service::adapters::driven::twin_directory::TwinDirectory;
use telemetry_service::adapters::driving::kafka_consumer;
use telemetry_service::adapters::ingest_auth::IngestKey;
use telemetry_service::kernel::actions::Actions;
use telemetry_service::kernel::ingest::Ingest;
use telemetry_service::kernel::ports::{
    Alerts, BuildingDirectory, BuildingStore, Clock, Fanout, ReadingStore, RegistrationEvents,
    SensorStore, ThresholdStore,
};
use telemetry_service::kernel::readings::Readings;
use telemetry_service::kernel::registration::Registration;
use telemetry_service::kernel::registry::PluginRegistry;
use telemetry_service::kernel::sensors::Sensors;
use telemetry_service::kernel::thresholds::Thresholds;
use telemetry_service::plugins::air_quality::AirQualityPlugin;
use telemetry_service::plugins::people_count::PeopleCountPlugin;
use telemetry_service::plugins::temperature::TemperaturePlugin;
use telemetry_service::state::{AppState, SystemClock};

const BINDINGS: &str = include_str!("../bindings.json");

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_owned())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    let database_url = std::env::var("DATABASE_URL")?;
    let ingest_key = IngestKey::new(&std::env::var("TELEMETRY_INGEST_SECRET")?)?;
    let redis_url = env_or("REDIS_URL", "redis://redis:6379");
    let brokers = env_or("KAFKA_BROKERS", "kafka:9092");
    let twin_url = env_or("TWIN_SERVICE_URL", "http://twin-service:3000");
    let port = env_or("PORT", "3000");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let registry = Arc::new(
        PluginRegistry::new(vec![
            Box::new(TemperaturePlugin),
            Box::new(PeopleCountPlugin),
            Box::new(AirQualityPlugin),
        ])
        .map_err(|error| anyhow::anyhow!(error))?,
    );

    let readings_store = Arc::new(PgReadings::new(pool.clone(), registry.clone()));
    // Wrapped once and shared: writes have to travel the same instance as
    // reads or the cache would never learn that a threshold changed.
    let thresholds_store = Arc::new(CachedThresholds::new(Arc::new(PgThresholds::new(
        pool.clone(),
    ))));
    let sensors_store = Arc::new(PgSensors::new(pool.clone()));
    let buildings_store = Arc::new(PgBuildings::new(pool.clone()));
    let dispatch = Arc::new(HttpDispatch::from_json(pool.clone(), BINDINGS)?);
    let fanout = Arc::new(RedisFanout::connect(&redis_url).await?);
    let directory = Arc::new(TwinDirectory::new(twin_url));

    let kafka = match KafkaEvents::connect(&brokers).await {
        Ok(producer) => Arc::new(producer),
        Err(error) => {
            log::error!(
                "kafka producer unavailable, registration acks and alerts disabled: {error}"
            );
            Arc::new(KafkaEvents::disabled())
        }
    };
    let events: Arc<dyn RegistrationEvents> = kafka.clone();

    let registration = Arc::new(Registration {
        buildings: buildings_store.clone() as Arc<dyn BuildingStore>,
        thresholds: thresholds_store.clone() as Arc<dyn ThresholdStore>,
        events,
    });

    let state = Arc::new(AppState {
        registry: registry.clone(),
        directory: directory.clone() as Arc<dyn BuildingDirectory>,
        dispatch: dispatch.clone(),
        pool: pool.clone(),
        ingest_key,
        ingest: Ingest {
            registry: registry.clone(),
            readings: readings_store.clone() as Arc<dyn ReadingStore>,
            thresholds: thresholds_store.clone() as Arc<dyn ThresholdStore>,
            fanout: fanout.clone() as Arc<dyn Fanout>,
            alerts: kafka.clone() as Arc<dyn Alerts>,
            clock: Arc::new(SystemClock) as Arc<dyn Clock>,
        },
        readings: Readings {
            registry: registry.clone(),
            store: readings_store.clone() as Arc<dyn ReadingStore>,
            clock: Arc::new(SystemClock) as Arc<dyn Clock>,
        },
        thresholds: Thresholds {
            registry: registry.clone(),
            store: thresholds_store.clone() as Arc<dyn ThresholdStore>,
        },
        sensors: Sensors {
            registry: registry.clone(),
            store: sensors_store.clone() as Arc<dyn SensorStore>,
        },
        actions: Actions {
            registry: registry.clone(),
            dispatch: dispatch.clone(),
        },
        registration: Registration {
            buildings: buildings_store.clone() as Arc<dyn BuildingStore>,
            thresholds: thresholds_store.clone() as Arc<dyn ThresholdStore>,
            events: registration.events.clone(),
        },
    });

    kafka_consumer::spawn(&brokers, kafka_consumer::GROUP_ID, registration);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    log::info!("telemetry-service listening on {port}");
    axum::serve(listener, telemetry_service::router(state))
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let _ = tokio::signal::ctrl_c().await;
    log::info!("shutting down");
}
