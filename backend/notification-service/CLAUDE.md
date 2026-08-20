# notification-service

Rust / Axum / MongoDB / Kafka / Redis. Alerting, Web Push.

## Shape

Ports & Adapters:

- `src/domain/` — pure
- `src/service/` — use cases + `Arc<dyn Port>`
- `src/adapters/driving/` — HTTP + Kafka `alerts` consumer
- `src/adapters/driven/` — Mongo, Redis bus + cooldown, web-push, twin lookup
- wired in `main.rs`

Test-enforced by `tests/architecture_fitness.rs`; `x-gateway-claims` literal only in
`domain/identity.rs`.

## Alerts consumer

Group `notification-service-alerts`, `auto.offset.reset=earliest`, filters `type ==
"temperature"` — a breach produced while it is down is processed on return. Auto-commit and
concurrent handling are deliberate: no record blocks the next. Duplicates are absorbed by the
Redis cooldown (`temp_alert:<b>:<r>`, 300s).

`on_temperature_breach` returns `BreachOutcome`, labelled onto
`notification_alerts_consumed_total{outcome}`. **`unroutable`** = no domain resolved (twin
lookup failed, or the building is in no domain): falls back to an unscoped Redis broadcast, so
it reaches open tabs and nothing else — no web push, because there is no domain to target and
pushing to every subscription would be a cross-tenant leak. Logged at `error`. Alert on that
counter.

The cooldown is armed on the unroutable path too, so an unrouted breach still suppresses the
next 300s.

System callers (`system:` subject prefix) bypass the membership filter — see
`documentation/developer/architecture/notification-architecture.qd`.

## Tests

- `src/` = unit only (`just test notification`)
- `tests/*.rs` = integration, real Mongo+Redis (`just test notification-integration`)
