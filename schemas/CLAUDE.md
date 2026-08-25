# schemas

Every shape that crosses a service boundary. Nothing here is deployed; everything here is
embedded by something that is.

```
schemas/
  json/              JSON Schema specs — the human-readable contract
  fixtures/          one realistic example per shape, asserted by Go, Rust and Python
  claims-schema/     Rust bindings: x-gateway-claims
  telemetry-schema/  Rust bindings: metric catalog, alerts topic, telemetry envelope + channels
  twin-schema/       Rust bindings: building-registration events + topics
```

**Not generated.** The Rust crates are hand-written serde, and stay that way — four of these
shapes cannot come out of a schema generator: the alert whose value is keyed by its own metric
name, the two lists that drop a malformed entry instead of failing, the reading that flattens
a plugin's own fields, and the untagged catalog response. Codegen would cover the easy half and
leave both halves to maintain.

## Which artefact does what

| Layer | Catches | Where it runs |
|---|---|---|
| Rust path dependency | Rust↔Rust drift, at compile time | `cargo build` in six services |
| `fixtures/` | a language's parser disagreeing with the others | Go, Rust, Python conformance tests |
| `json/` | a fixture drifting from the written contract | Rust, here in `schemas/` only; Python in `agent` |

The third layer exists because Python and TypeScript have no type enforcing the shape —
`agent` reads plain dicts, the frontend reads plain objects. Rust and Go get the shape
for free by parsing into a type; they validate against the schema anyway so the three languages
cannot drift apart through a fixture nobody re-checked.

**Schema validation lives in `schemas/`, never in a service.** `jsonschema` pulls in `reqwest`
for remote `$ref`s, and cargo unifies features across a package's whole graph — adding it to
digital-twin as a *dev*-dependency left its production client with
`No rustls crypto provider is configured` at test time. It is declared
`default-features = false` here, and validating a fixture against a schema needs no Rust type
anyway. The half that does need the type — parsing the fixture into `Building` — stays in
digital-twin.

**Go deliberately does not validate against the schema.** `libs/auth-contracts` is documented
as zero-dependency so that `claims-gateway`, `auth-middleware`, `auth-policy` and
`tenancy` can import it without dragging anything in. Its type-based conformance test
already fails on a renamed or dropped field, which is the drift that matters.

## Adding a shape

1. Write `json/<shape>.schema.json`.
2. Add `fixtures/<shape>.json` — one realistic example, not a minimal one.
3. Assert it wherever it is consumed: a Rust `include_str!` conformance test, a Go
   `os.ReadFile` one, a Python `Path(...)` one. Only the languages that actually read it.
4. Rust bindings only if **two or more Rust services** share the shape. One consumer is not a
   contract, it is a type — leave it in the service.

`.github/workflows/ci-gate.yml` re-runs every consumer when a schema crate changes, and the
Go/Rust/Python conformance legs when `fixtures/` or `json/` changes.
