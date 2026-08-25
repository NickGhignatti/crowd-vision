# auth-policy

The shared Cedar bundle: `policy.cedar` (rules), `schema.cedarschema` (entity shapes),
`fixtures/conformance.json` (the cases every language replays). Go API in `authz.go` /
`policy.go`. Role ladder is `../auth-contracts/roles.json`.
Docs: `documentation/developer/packages/auth-policy.qd`, `domain/identity-access.qd`.

## How it is evaluated

Locally, in every service, on the data path — no remote PDP, no authz network call. The
bundle is embedded by Go directly, by Rust (digital-twin `service/authz.rs`) and by Python
(`agent/app/cedar_authz.py`) through their own Cedar bindings. All of them replay
`fixtures/conformance.json`, so a rule change that means different things in different
languages fails immediately.

## Invariants

**`in` is entity hierarchy, `.contains()` is set membership.** Cedar's `in` asks "is this
entity a descendant of that one" — using it for a domain set silently denies everything, with
no error anywhere. Every rule here uses `.contains()`.

**Role weights are expanded before Cedar is called, never inside it.** Cedar cannot compare
role tiers, so each service turns a membership list into flat per-tier sets —
`domainsAsStandardCustomer` (any role), `domainsAsBusinessStaff` (≥60),
`domainsAsBusinessAdmin` (≥80), `domainsAsAdmin` (≥100) — plus `maxRoleWeight`. Cedar only
does containment and comparison. The thresholds stay in `policy.cedar`, not in each service.

**An unrecognised role is ignored, never a wildcard grant.** It expands into no tier.

**`Read` has no admin bypass; `ReadWithAdminBypass` does.** A platform admin is not
automatically a member of every domain — that distinction is the whole reason both actions
exist. `Read` = twin's `isMemberOf`; `ReadWithAdminBypass` = agent's `can_access_domain`.

**One generic `Resource` entity** carrying only `domain`. Every gated thing (building, room,
tenancy domain) reduces to "is the caller privileged enough in `resource.domain`?" — do not
add a near-identical entity type per resource kind.

**Fixed ceilings are literal, configurable ones travel in context.**
`ReadWithAdminBypass` and `IngestDocuments` hardcode `>= 100`; `ModelOverride` compares
`context.requiredWeight` because operators set it (`MODEL_OVERRIDE_MIN_ROLE`).

**Some checks never reach Cedar** — self-removal from a domain is an identity comparison
made before the call, not a policy decision. Don't move it into a rule.

## Changing a rule

1. Edit `policy.cedar` / `schema.cedarschema` and add the case to `fixtures/conformance.json`.
2. Run all three replays: `mise exec -- go test ./...` here,
   `mise exec -- cargo test cedar` in `backend/digital-twin`, `just test agent`.
3. Actions are a contract too — adding one means every language's binding learns it.
