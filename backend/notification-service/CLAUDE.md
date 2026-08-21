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
"temperature"` — a breach produced while it is down is processed on return. Concurrent handling
(`IN_FLIGHT` 16) is deliberate: no record blocks the next. Duplicates are absorbed by the Redis
cooldown (`temp_alert:<b>:<r>`, 300s).

`enable.auto.commit=false`. Offsets advance because a record was handled, not because a timer
fired — auto-commit plus concurrency loses records: offset 20 committing while 12 is still in
flight puts the group past a breach nobody delivered.

Commit is a **contiguous watermark per partition**, `Watermarks` in `alert_listener.rs`: only
the run below the lowest in-flight offset is committable. Records complete out of order;
committed offsets are a watermark, not a set. Committed value is `watermark + 1` — a commit
names the next record to read.

**Dead letters**: `alerts.dlq`, original payload and key, `reason` header. Parked on
`undecodable` (not UTF-8) and on `BreachOutcome` `invalid`/`failed` — neither is fixed by
reading the same record again. Counted on `notification_alerts_parked_total{reason}`; alert on
it. A failed DLQ produce leaves the offset uncommitted, so the record is redelivered rather
than lost.

Crash-redelivery has no automated test — it needs process control the suite does not have. The
offset arithmetic that makes it correct is unit-tested in `alert_listener.rs`.

`on_temperature_breach` returns `BreachOutcome`, labelled onto
`notification_alerts_consumed_total{outcome}`. **`unroutable`** = no domain resolved (twin
lookup failed, or the building is in no domain): falls back to an unscoped Redis broadcast, so
it reaches open tabs and nothing else — no web push, because there is no domain to target and
pushing to every subscription would be a cross-tenant leak. Logged at `error`. Alert on that
counter.

The cooldown is armed on the unroutable path too, so an unrouted breach still suppresses the
next 300s.

## Twin lookup

`adapters/driven/twin.rs`: 2s timeout, in-process `Mutex<HashMap>` cache, `TTL` 15min, per pod.

**Do not raise `TTL` to hours.** The 300s cooldown already caps lookups at one per
building+room per 5min, so a longer TTL saves ~4 HTTP calls/hour/building — nothing — while
multiplying the window in which a *removed* domain still gets pushed alerts. The Kafka path
runs as `system:` (`Audience::Unrestricted`), so nothing filters that. Want an indefinite
cache? Invalidate on a building-updated event, not a longer timer.
Empty and failed results are **not** cached — a just-provisioned building must not stay
unroutable for a whole TTL. No eviction sweep; bounded by building count.

System callers (`system:` subject prefix) bypass the membership filter — see
`documentation/developer/architecture/notification-architecture.qd`.

## Tests

- `src/` = unit only (`just test notification`)
- `tests/*.rs` = integration, real Mongo+Redis (`just test notification-integration`)
