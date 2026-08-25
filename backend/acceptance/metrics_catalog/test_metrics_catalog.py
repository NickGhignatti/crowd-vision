"""
Migrated from the former backend/acceptance/metrics.test.ts (Node/Jest). Verifies
dashboard's metrics catalog. Not one of the LD-4 acceptance criteria
— kept in its own folder since it predates LD-4 and covers a different
concern (metric catalog shape, not dashboard freshness).

The catalog endpoint is actually GET / (get_dashboard_tables in
api/dashboard.rs), not GET /contracts — that route doesn't exist on
dashboard at all (grepped main.rs's route table directly to
confirm: /health, /, /preferences/{id}, /preferences/init/{id}, /metrics).
The old JS test's URL was already stale; this is the corrected version, same
response shape ({"metrics": [...]}, camelCase fields per models.rs).
"""

import httpx
import pytest

from support.claims import claims_header
from support.config import DASHBOARD_URL


@pytest.fixture(scope="module")
def metrics_catalog() -> dict:
    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            DASHBOARD_URL, headers={"x-gateway-claims": claims_header()}
        )
        response.raise_for_status()
        return response.json()


def test_returns_200():
    with httpx.Client(timeout=10.0) as client:
        response = client.get(
            DASHBOARD_URL, headers={"x-gateway-claims": claims_header()}
        )
        assert response.status_code == 200


def test_response_has_a_metrics_array(metrics_catalog: dict):
    assert isinstance(metrics_catalog["metrics"], list)
    assert len(metrics_catalog["metrics"]) > 0


def test_contains_all_three_sensor_metrics(metrics_catalog: dict):
    keys = {metric["metricKey"] for metric in metrics_catalog["metrics"]}
    assert "temperature" in keys
    assert "airQuality" in keys
    assert "peopleCount" in keys


def test_every_metric_has_a_source_service(metrics_catalog: dict):
    for metric in metrics_catalog["metrics"]:
        assert isinstance(metric["sourceService"], str)
        assert len(metric["sourceService"]) > 0


def test_every_metric_has_at_least_one_field(metrics_catalog: dict):
    for metric in metrics_catalog["metrics"]:
        assert isinstance(metric["fields"], list)
        assert len(metric["fields"]) > 0
