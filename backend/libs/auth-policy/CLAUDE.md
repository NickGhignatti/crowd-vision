# auth-policy

Shared Cedar policy bundle. Copied into each build, embedded not deployed.

- Local evaluation, no remote PDP. Consumers: `tenancy` (cedar-go), `digital-twin`
  (cedar-policy, compile-time `include_str!`).
- Role weights pre-expanded to flat domain sets **before** Cedar runs — Cedar does set
  membership, not rank.
- **`in` = entity-hierarchy, `.contains()` = set membership.** Using `in` for the latter
  silently denies everything.
