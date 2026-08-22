# telemetry-contracts

Wire types for the metric catalog, shared by `telemetry-service` (produces) and
`contracts-service` (parses). Path dependency, embedded not deployed.

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
| `telemetry-service` | `controllers::contracts` returns `ServiceMetricsContract` |
| `contracts-service` | `models.rs` re-exports; `api/dashboard.rs` parses `MetricsDiscoveryResponse` |

Seam test: `telemetry-service/tests/api.rs::the_catalog_deserialises_into_the_shape_contracts_service_parses`.
