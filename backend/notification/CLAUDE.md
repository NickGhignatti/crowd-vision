# notification

Rust / Axum / MongoDB / Kafka / Redis. Consumes threshold breaches, decides who should hear
about them, delivers by Web Push and by a Redis message socket relays. Route
`/notification/*`, gated at the edge.
Docs: `documentation/architecture/notification-architecture.qd`,
`domain/alerting.qd`.

## Layout

Ports & Adapters, enforced by `tests/architecture_fitness.rs` — read it before restructuring.

| Path | Holds |
|---|---|
| `src/domain/` | `Notification`, `Audience`, `PushPayload`, preferences, subscriptions, identity. No framework, no `crate::{service,adapters}`. |
| `src/service/` | `alerts`, `push`, `preferences` + `ports.rs`. No framework, no adapters. `fakes.rs` = doubles. |
| `src/adapters/driving/` | HTTP API + `alert_listener.rs` (Kafka). Must not reach into `driven`. |
| `src/adapters/driven/` | Mongo persistence, Web Push sender, Redis bus, twin client. |

## Invariants

**Alerts arrive on Kafka, not Redis.** `alert_listener` consumes
`telemetry_schema::ALERTS_TOPIC`; the payload is `telemetry_schema::AlertEvent`, produced by
telemetry. A message that is not the shape the producer writes is invalid, not best-effort
parsed.

**Only `temperature` has a delivery path.** Any other metric is dropped and counted
`unsupported_metric` (`BreachOutcome::label`) — visible, never silently skipped. Adding a
metric here means adding its delivery, not loosening the check.

**Redelivery is expected, so delivery is cooldown-guarded**: a breach arms a Redis cooldown
of `COOLDOWN_SECONDS` (300) keyed by building and room; while it is active the lookup, the
publish and the re-arm are all suppressed. Kafka redelivery and a renamed consumer group
(which replays the topic from the beginning) are both absorbed by this.

**Delivery is domain-scoped.** `Audience::permits` decides which domains a notification may
reach; `Unrestricted` means every domain. A push with no type reaches every subscriber of
the domain, a typed push only those subscribed to that type.

**A `Gone` subscription is deleted, any other send failure leaves it in place**, and one dead
endpoint never stops the rest of the batch.

**`system:notification-service` is a pinned identity, not a name to refresh.** It is the
`sub` this service presents when calling other services with no end user
(`domain/identity.rs`), asserted byte-for-byte by test. Renaming it changes a trust boundary.

## Tests

```bash
just test notification               # unit, in-module #[cfg(test)]
just test notification-integration   # tests/*.rs against throwaway Mongo + Redis, composed
```

`tests/` covers `alerts_flow`, `persistence`, `architecture_fitness`.
