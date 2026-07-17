"""CrowdVision's shared Cedar authorization bundle, embedded in agent-service
(Decision A — no authz network call on the data path). See
server/auth-policy/policy.cedar for the rules this module evaluates against.

agent-service's AuthUser has always flattened domain+role into two unpaired
lists (roles: list[str], domains: list[str] — a real architectural fact, not
a bug here: see access.py's can_access_domain, which never needed the
pairing). That means the Account entity built here only ever populates
domainsAsStandardCustomer (= user.domains, since presence there already
meant "some membership") and maxRoleWeight (= the caller's highest role
weight, for the global checks) — the business_staff/business_admin/admin
per-domain tier sets other languages compute don't apply to any check
agent-service actually makes, so they're left empty rather than
reconstructed from data that was never kept paired.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import cedarpy

if TYPE_CHECKING:
    from app.auth import AuthUser

_AUTH_POLICY_DIR = Path(__file__).resolve().parent.parent.parent / "auth-policy"

_SCHEMA = (_AUTH_POLICY_DIR / "schema.cedarschema").read_text()
_POLICY = (_AUTH_POLICY_DIR / "policy.cedar").read_text()
_ROLE_WEIGHTS: dict[str, int] = json.loads(
    (_AUTH_POLICY_DIR / ".." / "auth-contracts" / "roles.json").read_text()
)


def _account_entity(user: AuthUser) -> dict:
    max_weight = max((_ROLE_WEIGHTS.get(r, 0) for r in user.roles), default=0)
    return {
        "uid": {"type": "Account", "id": "caller"},
        "attrs": {
            "domainsAsStandardCustomer": list(user.domains),
            "domainsAsBusinessStaff": [],
            "domainsAsBusinessAdmin": [],
            "domainsAsAdmin": [],
            "maxRoleWeight": max_weight,
        },
        "parents": [],
    }


def _resource_entity(domain: str) -> dict:
    return {
        "uid": {"type": "Resource", "id": domain or "global"},
        "attrs": {"domain": domain},
        "parents": [],
    }


def _authorize(user: AuthUser, action: str, domain: str, context: dict | None = None) -> bool:
    principal = _account_entity(user)
    resource = _resource_entity(domain)
    request = {
        "principal": f'Account::"{principal["uid"]["id"]}"',
        "action": f'Action::"{action}"',
        "resource": f'Resource::"{resource["uid"]["id"]}"',
        "context": context or {},
    }
    result = cedarpy.is_authorized(request, _POLICY, [principal, resource], _SCHEMA)
    return result.allowed


def can_access_domain(user: AuthUser, domain: str) -> bool:
    """Domain membership, OR a global admin role anywhere — replaces
    access.py's hand-rolled can_access_domain (the twin RAG tool's gate)."""
    return _authorize(user, "ReadWithAdminBypass", domain)


def accessible_domains(user: AuthUser, domains: list[str]) -> list[str]:
    """Filters a domain list down to the ones the caller can read — replaces
    access.py's accessible_domains, same admin-bypass semantics as
    can_access_domain."""
    return [d for d in domains if can_access_domain(user, d)]


def can_override_model(user: AuthUser, required_role: str) -> bool:
    """A global (non-domain-scoped) role-weight gate — replaces AuthUser's
    former has_role_at_least for the MODEL_OVERRIDE_MIN_ROLE check
    (routes/ask.py). The required tier is operator-configurable, so it
    travels as Cedar context rather than being hardcoded in policy.cedar."""
    required_weight = _ROLE_WEIGHTS.get(required_role, 101)
    return _authorize(user, "ModelOverride", "", {"requiredWeight": required_weight})


def can_ingest_documents(user: AuthUser) -> bool:
    """Admin-only, global (non-domain-scoped) gate on POST /ingest —
    re-ingesting the assistant's knowledge base isn't scoped to any one
    domain, so this checks the caller's role only, the same shape as
    can_access_domain's admin bypass."""
    return _authorize(user, "IngestDocuments", "")
