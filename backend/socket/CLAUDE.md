# socket

Rust / Axum / socketioxide / Redis. Real-time transport to browser.

## Shape

Functional core / imperative shell, split as directories:

- `src/core/` — `auth`/`rooms`/`relay`/`session`, pure + unit-tested
- `src/shell/` — `handlers`/`server`/`metrics`/`twin`
- `src/main.rs` — binds only

Test-enforced (`tests/architecture.rs`): every `src/*.rs` lives in `core/` or `shell/`; core
imports no I/O crate, no `async fn`, never names `crate::shell`; room-name literals only in
`core/rooms.rs`; `x-gateway-claims` only in `core/auth.rs`.

## Per-building authz

`subscribe_building` authorizes per building, not on membership existing:

- `shell/twin.rs` resolves building → domains from digital-twin (`DIGITAL_TWIN_URL`, caller's
  claims forwarded, 2s timeout, 60s cache — authoritative answers cached incl. empty, failures
  not)
- **one retry** on transport failure or 5xx, ~50-100ms jittered. Not on 4xx: a 404 means the
  building is not there. Jitter comes off the clock, not a `rand` dep
- **single-flight per building** (`gates`): one lookup at a time per id, others wait and read
  the cache the winner filled. A subscribe storm after a deploy is when digital-twin is
  slowest; without this every socket in it asks separately. Bounded by building count, like
  the cache
- `core::auth::may_read_building` requires a shared domain
- **acknowledged**: the handler answers `{subscribed, buildingId}` (+ `reason` when refused).
  The join waits on an HTTP lookup, so without the ack no caller can tell "joined" from "about
  to join", and events published in that window go to an empty room and are lost — socket.io
  has no buffer or replay. Ack shape and the reason vocabulary live in `core/subscription.rs`
  (one source, fitness-tested like room names); `shell/metrics.rs` labels its counter from the
  same enum. Additive: an emitting client is unaffected.
- lookup failure = reject, not fallthrough; both rejection paths counted

Emit path unchanged, no per-message check.

## Socket lifetime

Dropped after `SOCKET_MAX_LIFETIME_SECS` (default 900, = gateway `TokenTTL`) by a sweep in
`server.rs`. `core/session.rs` jitters per socket so a deploy's clients don't re-expire in
lockstep. Reconnect re-reads the cookie — that is the re-validation.

Authz is evaluated at subscribe only; a revoked membership keeps receiving until the socket is
dropped.

## Tests

- `src/` = unit only (`just test socket`)
- `tests/*.rs` = integration, real Redis (`just test socket-integration`)
