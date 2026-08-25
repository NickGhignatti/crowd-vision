import base64
import json


def claims_header(
    sub: str = "integration-tests",
    domain: str = "test-domain",
    role: str = "business_admin",
) -> str:
    """The same Stable Claims Contract shape every service trusts on
    `x-gateway-claims`: {sub, accountName, memberships: [{domain, role}]},
    base64-encoded. No signing — every service inside the mesh trusts this
    header rather than re-verifying a JWT (claims-gateway is the only
    verifier in production; nothing in this compose stack re-checks it
    either), same assumption digital-twin's own test suite relies on.
    """
    payload = {
        "sub": sub,
        "accountName": "integration-tests",
        "memberships": [{"domain": domain, "role": role}],
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()
