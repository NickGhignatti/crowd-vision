# socket

Rust / Axum / socketioxide / Redis. The only real-time transport to the browser: subscribes
to Redis, decides which room a message belongs to, relays it. Owns no data.
Route `/socket.io/*`, gated at the edge.
Docs: `documentation/architecture/socket-architecture.qd`.

## Layout

Functional core / imperative shell, enforced by `tests/architecture.rs` — read it before
restructuring. Every source file must be classified as core or shell; there is no third place.

| Path | Holds | Rules |
|---|---|---|
| `src/core/` | `auth`, `relay`, `rooms`, `session`, `subscription`. Pure decisions. | **synchronous** (no `async`), no IO crate, never reaches into `shell` |
| `src/shell/` | `server`, `handlers`, `twin`, `metrics`. Sockets, Redis, HTTP. | may call core |
| `src/main.rs` | Composition only — delegates to the server. | test-enforced |

## Invariants

**Relay decides, it does not reshape.** `get_telemetry_delivery_plan` /
`get_notification_delivery_plan` return a `Delivery` (room + payload); the bytes received
from Redis are relayed opaquely. Malformed input is skipped, never partially delivered.

**Room names are built only in `core/rooms.rs`** (`room_for_building`, `room_for_domain`),
test-enforced. A building id is the channel minus the telemetry prefix, and colons that
belong to the id survive that split.

**Subscription ack fields are built only in `core/subscription.rs`**, test-enforced — the
browser's contract lives in one file.

**A notification with no domain (absent, null, or empty) is a broadcast**; a scoped one goes
to its domain room. That is deliberate, not a missing check.

**The claims header name comes from `claims_schema::CLAIMS_HEADER`**, never a literal
`"x-gateway-claims"` in this crate. Test-enforced.

## Tests

```bash
just test socket               # unit, in-module #[cfg(test)]
just test socket-integration   # tests/*.rs against a throwaway Redis, composed then torn down
```

`tests/` covers `relay_redis`, `architecture`.
