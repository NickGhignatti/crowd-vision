"""Runs the Stable Claims Contract fixture shared with the Go binding
(auth-contracts/conformance_test.go) and the Rust one
(claims-contracts/tests/conformance.rs) through agent-service's own decoder.
A renamed or added claim fails in all three languages at once, instead of
turning into a header one service silently cannot read.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from app.auth import _claims_from_payload, _decode_claims_header

_FIXTURE = Path(__file__).resolve().parents[3] / "contracts-fixtures" / "standard-claims.json"


def _header() -> str:
    return base64.b64encode(_FIXTURE.read_bytes()).decode()


def test_the_shared_fixture_decodes_into_the_claims_this_service_reads() -> None:
    payload = _decode_claims_header(_header())

    assert payload == json.loads(_FIXTURE.read_text())
    assert payload["sub"]
    assert payload["accountName"]
    assert payload["sid"]


def test_every_fixture_membership_yields_a_role_and_a_domain() -> None:
    payload = _decode_claims_header(_header())
    roles, domains = _claims_from_payload(payload)

    memberships = payload["memberships"]
    assert memberships
    assert roles == [m["role"] for m in memberships]
    assert domains == [m["domain"] for m in memberships]
