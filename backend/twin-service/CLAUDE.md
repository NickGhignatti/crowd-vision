# twin-service

Rust / Axum / MongoDB / Kafka. Building spatial model.

## Shape

Ports & Adapters:

- `domain/` — entities, no axum/mongodb
- `service/` — use cases + `BuildingStore`/`UploadQueue`/`DownstreamSync`/`RegistrationEvents` ports
- `adapters/driving/` — http_api, worker, kafka_consumer
- `adapters/driven/` — persistence, outbound, kafka_producer
- `adapters/metrics.rs`/`ratelimit.rs`/`topics.rs` — cross-cutting
- wired in `main.rs`

Ports = `Arc<dyn Trait>`, not generics.

Test-enforced (`tests/architecture_fitness.rs`): `domain/` no axum/mongodb/`crate::service`;
`service/` no axum/mongodb/`crate::adapters`; `adapters/driving` no `crate::adapters::driven`.

## Registration flow

`POST /register` → `202`+handle, worker provisions from Mongo queue (`pending_uploads`),
publishes Kafka event, resolves `ready`/`failed` on telemetry-service's completion event.

`failed` (publish refused, or telemetry-service's own callback) deletes the twin
(`BuildingStore::delete`) and calls notification-service's `POST /trigger` as a system caller
(`OutboundConfig::notify_provisioning_failed`, `NOTIFICATION_SERVICE_URL`) — notify **before**
delete, since `/trigger` resolves the building's domains by calling back into twin-service.

All writes upsert — redelivery-safe.

## Tests

- `src/` = unit only, no real infra (`cargo test --lib` / `just test twin`)
- `tests/*.rs` = integration, real Mongo, no mocks at the boundary (`just test twin-integration`,
  composed via `docker-compose.test.yml` — test process and Mongo share one Docker network,
  never a host-published port)
