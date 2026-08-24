# claims-contracts

Rust half of the Stable Claims Contract (`{sub, accountName, sid, memberships}`). Parses the
`x-gateway-claims` header the edge injects. Path dependency, embedded not deployed.

Go half: `backend/auth-contracts` (`StandardClaims` + the `roles.json` ladder). Same wire
shape, one shared fixture — `backend/contracts-fixtures/standard-claims.json`, asserted by
`tests/conformance.rs` here and `auth-contracts/conformance_test.go` there.

## Rules

- **serde + base64 only.** No axum, no reqwest.
- **The `GatewayClaims` wrapper stays in the service.** `FromRequestParts` is a foreign
  trait, so the orphan rule forbids implementing it for a type from this crate — each
  service owns a three-line `GatewayClaims { payload, raw }` and its own extractor.
  Rejection types differ anyway (`StatusCode` vs `DomainError`).
- **Parse, not policy.** `is_system`, admin checks, Cedar entities stay in the service.
- Field names are the contract. `accountName`/`externalId` are camelCase on the wire.
- Every field is optional at the type level; requiring one is the service's decision, taken
  in its extractor. `claims-gateway` is the only signature verifier — by the time the header
  reaches a service it is already trusted.

## Why the parsing is shaped the way it is

- **Four base64 alphabets** (`STANDARD`, `URL_SAFE`, both `NO_PAD`). Node's
  `Buffer.from(header, "base64")` accepts all four; a Rust engine accepts one. Trying only
  `STANDARD` rejects tokens the edge legitimately emits.
- **Memberships deserialise leniently**: a malformed entry is dropped, the rest survive. A
  whole-payload reject on one bad entry turns a 403 into a 401 and hides the real cause.
  A `memberships` that is not a list is still fatal.

## Consumers

`chat-service`, `contracts-service`, `notification-service`, `socket-service`,
`telemetry-service`, `twin-service`. All build from **repo-root context** so the sibling path
dep resolves — `.github/services.json` carries `cd_context: "."` + explicit `dockerfile`, and
each `Dockerfile` copies the crate before `cargo chef prepare` **and** before each `cook`.
