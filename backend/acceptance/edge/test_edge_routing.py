"""
The only tests in this suite that cross the edge (issue #374).

Every other test addresses a service directly — support/config.py's
TELEMETRY_URL, SOCKET_URL, DASHBOARD_URL are compose service names — so Caddy
is never in the path and its routing table is unverified. These three send
their requests to the gateway container, which mounts the repo-root Caddyfile
itself, not a copy.

claims-gateway is stubbed here (stubs/claims-gateway.conf). The real one needs
Keycloak and tenancy to boot, and what these tests assert is *which paths reach
require_gateway_auth* — not how a JWT is verified, which is claims-gateway's own
Go suite. The stub answers /verify with a fixed 401 carrying a marker string;
Caddy's forward_auth copies a non-2xx auth response back to the client verbatim,
so that marker arriving at the test is what distinguishes "the edge rejected
this" from "telemetry's own claims extractor rejected this". Both are 401, and
only the first is what these tests are about.
"""

import httpx
import pytest

from support import telemetry
from support.config import EDGE_URL
from support.http_client import wait_until_ready

TELEMETRY_VIA_EDGE = f"{EDGE_URL}/telemetry"

# stubs/claims-gateway.conf's /verify response body.
EDGE_REJECTION_MARKER = "claims-gateway stub"


@pytest.fixture(scope="module", autouse=True)
def _edge_ready() -> None:
    """Deliberately a routed path, not just the listener: /gateway/* is the one
    prefix Caddy proxies without require_gateway_auth, so a 200 here proves the
    Caddyfile parsed and is routing, which a bare TCP connect would not.
    """
    wait_until_ready(f"{EDGE_URL}/gateway/health")


def test_ingest_crosses_the_edge_ungated():
    """Devices and simulators carry no user JWT. /telemetry/ingest is the single
    path the edge lets through unauthenticated; it is HMAC-verified inside
    telemetry instead (adapters/ingest_auth.rs).
    """
    building_id, room_id = telemetry.new_room()

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.ingest_temperature(
            client,
            building_id,
            room_id,
            value=21.5,
            ingest_url=f"{TELEMETRY_VIA_EDGE}/ingest",
        )

    assert response.status_code == 202


def test_a_gated_route_without_claims_is_rejected_at_the_edge():
    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            f"{TELEMETRY_VIA_EDGE}/temperature/latest",
            params={"building": "any-building", "roomId": "any-room"},
        )

    assert response.status_code == 401
    assert EDGE_REJECTION_MARKER in response.text


def test_the_ingest_ungate_is_an_exact_path_not_a_prefix():
    """The near-miss this whole file exists for. While #357 was in flight the
    ingest route was briefly POST /telemetry/ingest/batch. The Caddyfile ungates
    it with `handle /telemetry/ingest` — exact, not a prefix — and
    k8s/istio-request-authentication.yml lists the same exact path in its
    no-principal exception, so the sub-path fell through to require_gateway_auth
    and would have 401'd every gateway. The suite was green throughout, because
    nothing crossed Caddy.

    If this test ever fails because an ingest sub-path was added on purpose, the
    fix is to add that path to BOTH of those files, not to delete the test.
    """
    building_id, room_id = telemetry.new_room()

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.ingest_temperature(
            client,
            building_id,
            room_id,
            value=21.5,
            ingest_url=f"{TELEMETRY_VIA_EDGE}/ingest/batch",
        )

    assert response.status_code == 401
    assert EDGE_REJECTION_MARKER in response.text
