# Mirrors the shared role ladder in `auth-contracts/roles.json` (Go). A caller
# satisfies a required role iff their max role weight meets or exceeds it.
ROLE_WEIGHTS: dict[str, int] = {
    "admin": 100,
    "business_admin": 80,
    "business_staff": 60,
    "standard_customer": 10,
}
