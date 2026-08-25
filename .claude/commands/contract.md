---
description: Change a shape that crosses a service boundary, keeping all three defence layers in sync.
argument-hint: <which shape, and what should change>
---

Change requested: $ARGUMENTS

Read `schemas/CLAUDE.md` first. Then work in this order — the order is what keeps the three
languages from silently disagreeing.

1. **Decide where it belongs.** Two or more services parse it → `schemas/`. Only one parses
   it → it is a type, leave it in that service and stop here.
2. **Change the Rust definition** (`schemas/{claims,telemetry,twin}-schema/src/`). Rust
   consumers now fail to compile until updated — that is the first layer working.
3. **Update every Rust consumer** found via `path = "../../schemas/…"` in the `Cargo.toml`s.
4. **Update `schemas/fixtures/*.json`**, and `schemas/json/*.schema.json` if the shape has a
   written contract.
5. **Update the other languages' parsers** where the shape is claims- or Cedar-related:
   Go `backend/libs/auth-contracts`, Python `backend/agent/app/auth.py`.
6. **Run every conformance replay**, not just the one you touched:
   - `mise exec -- cargo test conformance` in the crate and in `backend/digital-twin`
   - `mise exec -- go test ./...` in `backend/libs/auth-contracts` and `backend/libs/auth-policy`
   - `just test agent`
7. **Update the docs in the same change**: `schemas/CLAUDE.md`, the affected service's
   `CLAUDE.md`, and `documentation/developer/packages/*.qd`.

Watch for:

- Hand-written serde exists for a reason (`AlertEvent` keys the value by its own metric name).
  Do not replace it with a derive.
- A wire rename is a runtime break for whichever language you forget — that is the failure
  mode this whole layer exists to prevent (`key`/`metricKey`, `kind`/`type`).
- Kafka topic names and Redis channel names are part of the contract and live in the crate.
