# telemetry-schema

Wire types shared between telemetry and its consumers. Path dependency, embedded not
deployed. Two contracts, one crate:

- `lib.rs` — metric catalog: `telemetry` `/contracts` produces, `dashboard` parses.
- `alerts.rs` — the `alerts` Kafka topic (and `ALERTS_TOPIC` / `ALERTS_DLQ_TOPIC`):
  `telemetry` produces, `notification` consumes.
- `telemetry.rs` — the Redis fan-out envelope and both channel names: `telemetry`
  publishes on `telemetry:raw`, `dashboard` republishes on `telemetry:filtered:{id}`,
  `socket` reads the building back out of that name.

## Rules

- **serde only.** No axum, sqlx, reqwest, tokio. Adding I/O here couples two services'
  runtimes, not just their wire shape.
- Field names are the contract. `rename_all = "camelCase"`, and the frontend
  (`frontend/src/models/table.ts`) reads the same names — check it before renaming anything.
- Producer builds the struct; nobody hand-rolls `json!` for these shapes. That is how
  `key`/`metricKey` and `kind`/`type` drifted and emptied the dashboard catalog (#341 fallout).

## Consumers

Both build from **repo-root context** so the sibling path dep resolves —
`.github/services.json` carries `cd_context: "."` + explicit `dockerfile` for each.

| Consumer | Uses |
|---|---|
| `telemetry` | `controllers::contracts` returns `ServiceMetricsContract` |
| `dashboard` | `models.rs` re-exports; `api/dashboard.rs` parses `MetricsDiscoveryResponse` |
| `notification` | `service/alerts.rs` parses `AlertEvent`; `domain/notification.rs` renders it |
| `socket` | `core/rooms.rs` re-exports `building_of_filtered_channel`; `shell/server.rs` psubscribes `FILTERED_CHANNEL_PATTERN` |

Seam test: `telemetry/tests/api.rs::the_catalog_deserialises_into_the_shape_dashboard_parses`.

## AlertEvent

Hand-written `Serialize`/`Deserialize`, not derives, because the wire shape puts the reading
under a key named after its own metric:

```json
{"buildingId":"b1","roomId":"r1","temperature":40.0,"type":"temperature",
 "direction":"high","threshold":25.0,"timestamp":1700000000000}
```

`type` is the metric; the value is under `<metric>`. A `type` naming a key the object does not
carry is a parse error, not a `None`. Every field is required — the producer always sets all of
them, so a missing one means a malformed record, which the consumer parks in the DLQ rather
than delivering as a half-rendered notification.

Keep the shape as it is unless both services ship together: this exact JSON is what sits in
Kafka during a rollout.

**Every metric's breaches reach the topic; only `temperature` has a delivery path.**
notification answers `BreachOutcome::Unsupported` for anything else — logged, counted
`unsupported_metric`, settled, not parked. Adding a metric is a match arm plus a message
template, not archaeology.

## TelemetryEnvelope

```json
{"buildingId":"b1","ingestedAt":1700000000500,
 "readings":[{"type":"temperature","buildingId":"b1","roomId":"r1",
              "timestamp":1700000000000,"value":21.5,"ingestedAt":1700000000500,
              "...plugin fields":"flattened in"}]}
```

`readings` is `Vec<Value>` on the envelope on purpose: a reading's fields belong to the plugin
that produced it, and this crate has no business enumerating them. `TelemetryReading` types the
part that *is* fixed — the six names the browser reads — and flattens the rest, so it round-trips
whatever a plugin emitted.

**dashboard parses the envelope to route it, then republishes the bytes it received.**
It never re-serialises: routing is a decision about `buildingId`, not a licence to rebuild a
payload it does not own.

`ingestedAt` is **required**. It was optional before (used only for the fan-out latency metric,
skipped when absent); one service produces this envelope and always sets it, so a missing one
means a broken publisher, and forwarding a broken tick is the failure this crate exists to stop.
