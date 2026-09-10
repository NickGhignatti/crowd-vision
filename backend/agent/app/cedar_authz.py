from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import cedarpy

from app.roles import ROLE_WEIGHTS as _ROLE_WEIGHTS

if TYPE_CHECKING:
    from app.auth import AuthUser

_AUTH_POLICY_DIR = Path(__file__).resolve().parent.parent.parent / "libs" / "auth-policy"

_SCHEMA = (_AUTH_POLICY_DIR / "schema.cedarschema").read_text()
_POLICY = (_AUTH_POLICY_DIR / "policy.cedar").read_text()


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
