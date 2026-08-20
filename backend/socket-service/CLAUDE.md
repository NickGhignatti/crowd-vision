# socket-service

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

- `shell/twin.rs` resolves building → domains from twin-service (`TWIN_SERVICE_URL`, caller's
  claims forwarded, 2s timeout, 60s cache — authoritative answers cached incl. empty, failures
  not)
- `core::auth::may_read_building` requires a shared domain
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
