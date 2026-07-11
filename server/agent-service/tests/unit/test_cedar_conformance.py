"""Runs the golden fixture shared with every other language binding
(server/auth-policy/fixtures/conformance.json) through the real cedarpy
engine — the identical-outcomes guarantee that justifies one shared policy
bundle at all. See app/cedar_authz.py for the entity shapes agent-service
actually uses; this test exercises every action the bundle defines, not just
agent-service's subset, the same way server/auth-policy's own Go test does.
"""

from __future__ import annotations

import json
from pathlib import Path

import cedarpy
import pytest

_AUTH_POLICY_DIR = Path(__file__).resolve().parents[3] / "auth-policy"
_SCHEMA = (_AUTH_POLICY_DIR / "schema.cedarschema").read_text()
_POLICY = (_AUTH_POLICY_DIR / "policy.cedar").read_text()
_ROLE_WEIGHTS: dict[str, int] = json.loads(
    (_AUTH_POLICY_DIR / ".." / "auth-contracts" / "roles.json").read_text()
)
_FIXTURE = json.loads((_AUTH_POLICY_DIR / "fixtures" / "conformance.json").read_text())


def _account_entity(memberships: list[dict]) -> dict:
    standard_customer, business_staff, business_admin, admin = [], [], [], []
    max_weight = 0
    for m in memberships:
        weight = _ROLE_WEIGHTS.get(m["role"])
        if weight is None:
            continue
        max_weight = max(max_weight, weight)
        standard_customer.append(m["domain"])
        if weight >= _ROLE_WEIGHTS["business_staff"]:
            business_staff.append(m["domain"])
        if weight >= _ROLE_WEIGHTS["business_admin"]:
            business_admin.append(m["domain"])
        if weight >= _ROLE_WEIGHTS["admin"]:
            admin.append(m["domain"])

    return {
        "uid": {"type": "Account", "id": "caller"},
        "attrs": {
            "domainsAsStandardCustomer": standard_customer,
            "domainsAsBusinessStaff": business_staff,
            "domainsAsBusinessAdmin": business_admin,
            "domainsAsAdmin": admin,
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


@pytest.mark.parametrize("case", _FIXTURE["cases"], ids=lambda c: c["name"])
def test_conformance(case: dict) -> None:
    principal = _account_entity(case["memberships"])
    resource = _resource_entity(case["domain"])
    request = {
        "principal": f'Account::"{principal["uid"]["id"]}"',
        "action": f'Action::"{case["action"]}"',
        "resource": f'Resource::"{resource["uid"]["id"]}"',
        "context": case.get("context") or {},
    }
    result = cedarpy.is_authorized(request, _POLICY, [principal, resource], _SCHEMA)
    expected = case["expected"] == "allow"
    assert result.allowed == expected, case["name"]
