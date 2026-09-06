"""API contract, validation and error-handling tests."""

from __future__ import annotations

import pytest


def test_health_reports_database_and_seed_state(client) -> None:
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["seeded"] is True
    assert body["record_counts"]["sites"] == 40


def test_seed_counts_match_the_source_datasets(client) -> None:
    counts = client.get("/health").json()["record_counts"]
    assert counts["sites"] == 40
    assert counts["mcda_scores"] == 30
    assert counts["projects"] == 40
    assert counts["priority_projects"] == 40
    assert counts["what_if_areas"] == 45
    assert counts["risk_assessments"] == 30
    assert counts["population_records"] == 30
    assert counts["scheme_recommendations"] == 40
    assert counts["government_schemes"] == 20


def test_every_list_response_declares_data_status(client) -> None:
    for url in ("/api/v1/sites", "/api/v1/what-if/areas", "/api/v1/data-sources"):
        body = client.get(url).json()
        assert body["data_status"] in ("demo", "source", "derived", "ai_generated")
        assert "disclaimer" in body


def test_demo_data_is_labelled(client) -> None:
    body = client.get("/api/v1/sites").json()
    assert body["is_demo_data"] is True
    assert any("Demonstration data" in n for n in body["notes"])


def test_site_detail_and_404(client) -> None:
    assert client.get("/api/v1/sites/1").status_code == 200
    assert client.get("/api/v1/sites/99999").status_code == 404


def test_recommended_sites_shape(client) -> None:
    body = client.get("/api/v1/sites/recommended?infrastructure_type=Hospital&limit=5").json()
    assert len(body["results"]) == 5
    first = body["results"][0]
    for key in ("site_id", "score", "confidence", "recommendation", "factors", "site", "risk"):
        assert key in first
    assert body["results"] == sorted(body["results"], key=lambda r: -r["score"])


def test_recommendation_rejects_invalid_weights(client) -> None:
    response = client.post(
        "/api/v1/sites/recommended",
        json={"infrastructure_type": "Hospital", "weights": {"population_coverage": 50.0}},
    )
    assert response.status_code == 422
    assert response.json()["error"] == "invalid_weights"


def test_recommendation_rejects_out_of_range_weight(client) -> None:
    response = client.post(
        "/api/v1/sites/recommended",
        json={"infrastructure_type": "Hospital", "weights": {"population_coverage": 150.0}},
    )
    assert response.status_code == 422


def test_recommendation_limit_is_validated(client) -> None:
    assert client.get("/api/v1/sites/recommended?limit=0").status_code == 422
    assert client.get("/api/v1/sites/recommended?limit=999").status_code == 422


def test_explainability_returns_signed_contributions(client) -> None:
    body = client.get("/api/v1/sites/1/explain?infrastructure_type=Hospital").json()
    assert body["method"] == "deterministic_mcda_weighted_contribution"
    assert body["score_breakdown"]["baseline"] + body["score_breakdown"]["net_factor_effect"] == pytest.approx(
        body["score_breakdown"]["final"], abs=0.01
    )
    assert len(body["all_factors"]) == 9


def test_what_if_simulation(client) -> None:
    body = client.post(
        "/api/v1/what-if/simulate",
        json={
            "weights": {
                "budget": 40.0,
                "accessibility": 10.0,
                "flood_safety": 30.0,
                "population_coverage": 15.0,
                "sustainability": 5.0,
            },
            "top_n": 5,
        },
    ).json()
    assert len(body["results"]) == 5
    assert body["areas_evaluated"] == 45
    assert "scenario_summary" in body
    assert body["movers"]["biggest_gain"]["rank_change"] >= 0


def test_what_if_invalid_weights_rejected(client) -> None:
    response = client.post("/api/v1/what-if/simulate", json={"weights": {"budget": 10.0}})
    assert response.status_code == 422


def test_priority_ranking(client) -> None:
    body = client.get("/api/v1/priority-projects?limit=10").json()
    assert len(body["results"]) == 10
    assert body["projects_ranked"] == 40
    assert body["sector_summary"]


def test_risk_endpoint_includes_coordinates_for_mapping(client) -> None:
    body = client.get("/api/v1/risk").json()
    assert body["summary"]["locations"] == 30
    plotted = [r for r in body["results"] if r["latitude"] is not None]
    assert len(plotted) == 30


def test_project_detail_has_cost_timeline_and_scheme(client) -> None:
    body = client.get("/api/v1/projects/15").json()
    assert body["cost"]["estimate_cr"] > 0
    assert body["timeline"]["phases"]
    assert body["scheme"]["primary"]["scheme_name"]
    assert client.get("/api/v1/projects/99999").status_code == 404


def test_dpr_generation_and_pdf_download(client) -> None:
    body = client.post("/api/v1/dpr/15/generate", json={"include_explainability": True}).json()
    for section in ("executive_summary", "cost", "timeline", "scheme", "risk", "data_sources", "disclaimer"):
        assert section in body
    assert "decision-support prototype" in body["disclaimer"]

    pdf = client.get("/api/v1/dpr/15/download")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "attachment" in pdf.headers["content-disposition"]


def test_dpr_missing_project_returns_404(client) -> None:
    assert client.post("/api/v1/dpr/99999/generate", json={}).status_code == 404
    assert client.get("/api/v1/dpr/99999/download").status_code == 404


def test_scheme_recommendation_endpoint(client) -> None:
    body = client.get("/api/v1/schemes/recommend?project_type=Housing").json()
    assert body["matched"] is True
    assert "Awas" in body["primary"]["scheme_name"]


def test_iot_simulation_escalates_to_warning(client) -> None:
    before = client.get("/api/v1/iot/devices").json()
    device = next(d for d in before["devices"] if d["device_id"] == "NIR-WL-001")
    assert device["is_demo_data"] is True

    status = None
    for _ in range(6):
        body = client.post(
            "/api/v1/iot/simulate", json={"device_id": "NIR-WL-001", "readings": 1, "escalate": 0.8}
        ).json()
        status = body["devices"][0]["status"]
        if status in ("WARNING", "CRITICAL"):
            break
    assert status in ("WARNING", "CRITICAL")


def test_iot_ingest_unknown_device_is_404(client) -> None:
    response = client.post(
        "/api/v1/iot/ingest",
        json={"device_id": "NOT-A-DEVICE", "sensor_type": "water_level", "value": 1.0, "unit": "m"},
    )
    assert response.status_code == 404


def test_copilot_works_without_an_llm(client) -> None:
    body = client.post(
        "/api/v1/copilot/query", json={"question": "Which area is best for a new hospital?"}
    ).json()
    assert body["provider"] == "mock"
    assert body["intent"] == "best_site"
    assert body["answer"]
    assert body["data_status"] == "ai_generated"


def test_copilot_says_insufficient_data_rather_than_inventing(client) -> None:
    body = client.post(
        "/api/v1/copilot/query",
        json={"question": "Which government scheme funds an orbital launch pad?"},
    ).json()
    assert "Insufficient verified data available" in body["answer"]


def test_copilot_validates_input(client) -> None:
    assert client.post("/api/v1/copilot/query", json={"question": "hi"}).status_code == 422
    assert client.post("/api/v1/copilot/query", json={}).status_code == 422


def test_data_lineage_is_published(client) -> None:
    body = client.get("/api/v1/data-sources/lineage").json()
    entry = body["data"][0]
    for key in ("metric", "source", "processing", "engine", "output"):
        assert key in entry


def test_declared_providers_report_configuration_state(client) -> None:
    body = client.get("/api/v1/data-sources/providers").json()
    keys = {p["key"] for p in body["data"]}
    assert {"demo", "gcc", "cmda", "osm", "bhuvan", "imd", "census"} <= keys
    demo = next(p for p in body["data"] if p["key"] == "demo")
    assert demo["configured"] is True


def test_gis_layers_keep_regions_separate(client) -> None:
    body = client.get("/api/v1/gis/layers").json()
    hospitals = body["layers"].get("hospital", [])
    assert hospitals
    # The supplied facility layer pack is Coimbatore data and must stay tagged.
    assert all(h["region"].startswith("Coimbatore study box") for h in hospitals)
    assert all(s["district"] == "Chennai" for s in body["sites"])
    # Chennai locality centroids must not be filed under the Coimbatore region.
    centroids = body["layers"]["locality_centroid"]
    assert all(c["region"] == "Chennai" for c in centroids)


def test_dashboard_rollup(client) -> None:
    body = client.get("/api/v1/dashboard").json()
    metrics = body["metrics"]
    assert metrics["sites_assessed"] == 40
    assert metrics["projects"] == 40
    assert metrics["total_budget_cr"] > 0
    assert len(body["top_sites"]) == 5


def test_openapi_docs_are_enabled(client) -> None:
    assert client.get("/docs").status_code == 200
    schema = client.get("/openapi.json").json()
    assert schema["info"]["title"] == "NIRMAN AI"
