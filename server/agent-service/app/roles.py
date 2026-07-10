# Mirrors the shared role ladder in `auth-contracts/roles.json` (Go). Hierarchical
# RBAC: a caller satisfies a required role iff their maximum role weight meets or
# exceeds the required weight.
ROLE_WEIGHTS: dict[str, int] = {
    "admin": 100,
    "business_admin": 80,
    "business_staff": 60,
    "standard_customer": 10,
}
