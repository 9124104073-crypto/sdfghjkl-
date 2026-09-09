"""Tests for request timing, metrics and ETag handling."""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from app.core.observability import Metrics, _percentile
from app.main import app

client = TestClient(app)


def test_responses_carry_timing_headers():
    response = client.get("/health")
    assert response.status_code == 200
    assert float(response.headers["X-Process-Time-Ms"]) >= 0
    assert response.headers["Server-Timing"].startswith("app;dur=")


def test_metrics_endpoint_reports_the_routes_that_were_called():
    client.get("/api/v1/dashboard")
    body = client.get("/health/metrics").json()

    assert body["data_status"] == "derived"
    data = body["data"]
    assert data["total_requests"] >= 1
    routes = {row["route"] for row in data["routes"]}
    assert "GET /api/v1/dashboard" in routes

    row = next(r for r in data["routes"] if r["route"] == "GET /api/v1/dashboard")
    # p95 cannot be below p50, and neither can exceed the observed maximum.
    assert row["p50_ms"] <= row["p95_ms"] <= row["max_ms"]
    assert row["errors"] == 0


def test_routes_are_aggregated_by_template_not_by_id():
    """/sites/1 and /sites/2 must land in one bucket, not two."""
    client.get("/api/v1/sites/1")
    client.get("/api/v1/sites/2")

    routes = {row["route"] for row in client.get("/health/metrics").json()["data"]["routes"]}
    # Literal routes such as /sites/recommended legitimately appear as
    # themselves; it is the id-bearing paths that must be collapsed.
    numeric = [r for r in routes if re.fullmatch(r"GET /api/v1/sites/\d+", r)]
    assert not numeric, f"routes were not templated: {numeric}"
    assert any("/api/v1/sites/{" in r for r in routes)


def test_get_responses_carry_a_stable_etag():
    first = client.get("/api/v1/dashboard")
    second = client.get("/api/v1/dashboard")

    assert "etag" in first.headers
    # The engines are deterministic, so the same request must hash the same.
    assert first.headers["etag"] == second.headers["etag"]


def test_matching_if_none_match_returns_304_with_no_body():
    first = client.get("/api/v1/dashboard")
    etag = first.headers["etag"]

    cached = client.get("/api/v1/dashboard", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    assert cached.content == b""


def test_stale_etag_is_ignored_and_the_body_is_served():
    response = client.get("/api/v1/dashboard", headers={"If-None-Match": '"not-the-current-hash"'})
    assert response.status_code == 200
    assert response.json()["metrics"]["sites_assessed"] > 0


def test_post_requests_are_not_etagged():
    """A write must never be answered from a validator."""
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Which area is best for a new hospital?"},
    )
    assert response.status_code == 200
    assert "etag" not in response.headers


def test_percentile_uses_nearest_rank():
    ordered = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert _percentile(ordered, 0.0) == 1.0
    assert _percentile(ordered, 0.5) == 3.0
    assert _percentile(ordered, 1.0) == 5.0
    assert _percentile([], 0.5) == 0.0


def test_metrics_counts_server_errors_separately():
    m = Metrics()
    m.record("GET /x", 0.01, 200)
    m.record("GET /x", 0.02, 500)
    m.record("GET /x", 0.03, 404)

    row = next(r for r in m.snapshot()["routes"] if r["route"] == "GET /x")
    assert row["requests"] == 3
    # 404 is the caller's problem, not the server's, and must not count here.
    assert row["errors"] == 1


def test_metrics_window_is_bounded():
    m = Metrics()
    for i in range(500):
        m.record("GET /y", i / 1000, 200)
    row = next(r for r in m.snapshot()["routes"] if r["route"] == "GET /y")
    assert row["requests"] == 500  # the count is complete
    assert row["max_ms"] == 499.0  # but only the last 200 samples are held
