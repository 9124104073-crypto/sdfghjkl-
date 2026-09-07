"""Tests for the ML, geospatial, retrieval, persistence and MQTT layers."""

from __future__ import annotations

import pytest

from app import repositories as repo
from app.engines import ml as ml_engine
from app.providers.recommendation import (
    DEFAULT_PROVIDER,
    RecommendationProvider,
    get_recommendation_provider,
    list_providers,
    resolve,
)
from app.services import gis_service, mqtt_service, persistence_service, rag_service


# -- RecommendationProvider ---------------------------------------------


def test_all_four_named_interfaces_exist() -> None:
    """Prompt 1 names AIProvider, LLMProvider, RecommendationProvider, DataProvider."""
    from app.providers.ai.base import AIProvider, LLMProvider
    from app.providers.data import DataProvider

    for interface in (AIProvider, LLMProvider, RecommendationProvider, DataProvider):
        assert isinstance(interface, type)


def test_mcda_is_the_default_provider() -> None:
    assert get_recommendation_provider().key == DEFAULT_PROVIDER == "mcda"
    keys = {p["key"] for p in list_providers()}
    assert {"mcda", "ml"} <= keys


def test_providers_share_a_contract(db) -> None:
    sites = repo.all_sites(db)
    for key in ("mcda", "ml"):
        provider = get_recommendation_provider(key)
        ranked = provider.rank(sites, "Hospital", limit=3)
        assert len(ranked) == 3
        for row in ranked:
            assert {"site_id", "site_name", "score", "recommendation"} <= set(row)
        scores = [r["score"] for r in ranked]
        assert scores == sorted(scores, reverse=True)


def test_unknown_provider_falls_back_to_mcda(db) -> None:
    provider, notes = resolve(db, "does-not-exist")
    assert provider.key == "mcda"
    assert notes


# -- ML + SHAP -----------------------------------------------------------


def test_surrogate_trains_on_sampled_engine_output_not_the_40_seed_rows(db) -> None:
    """The model must be fitted on a sampled input space, not the seed table.

    Forty rows cannot support a generalisable model, so the surrogate is
    trained on thousands of (attributes, weights) -> engine score pairs.
    """
    sites = repo.all_sites(db)
    payload = ml_engine.site_model.importances(sites)
    assert payload["model"]["training_rows"] >= 1000
    assert payload["model"]["training_rows"] != len(sites)
    # Weight columns must be features: the engine's score depends on them.
    assert any(f["factor"].startswith("w_") for f in payload["features"])


def test_surrogate_generalises_on_held_out_data(db) -> None:
    """A held-out score that is actually meaningful, unlike CV over 40 rows."""
    sites = repo.all_sites(db)
    model = ml_engine.site_model.importances(sites)["model"]
    assert model["cross_validated_r2"] is not None
    assert model["cross_validated_r2"] > 0.6
    assert model["cross_validated_mae"] < 8.0


def test_surrogate_row_matches_the_training_contract(db) -> None:
    """Inference and training must build identical feature vectors."""
    from app.engines.ml_training import build_training_set
    from app.engines.weights import DEFAULT_SITE_WEIGHTS

    sites = repo.all_sites(db)
    training = build_training_set(sites, ["Hospital"], samples=25)
    row = ml_engine.surrogate_row(sites[0], "Hospital", dict(DEFAULT_SITE_WEIGHTS))
    assert len(row) == len(training.feature_names) == training.X.shape[1]


def test_shap_values_are_additive(db) -> None:
    """base value + every SHAP contribution must equal the prediction."""
    sites = repo.all_sites(db)
    prediction = ml_engine.site_model.predict(sites[0], sites).as_dict()
    total = prediction["base_value"] + sum(f["shap_value"] for f in prediction["all_factors"])
    assert total == pytest.approx(prediction["score"], abs=0.05)


def test_ml_output_is_labelled_as_illustrative(db) -> None:
    sites = repo.all_sites(db)
    prediction = ml_engine.site_model.predict(sites[0], sites).as_dict()
    assert prediction["data_status"] == "ai_generated"
    # It must say what it actually is: an emulator of the engine, and not a
    # claim about real-world suitability.
    notes = " ".join(prediction["notes"]).lower()
    assert "surrogate" in notes
    assert "not trained on real-world outcomes" in notes
    assert "scorer of record" in notes


def test_ml_never_replaces_the_deterministic_default(db) -> None:
    """The MVP must not require a model for core site scoring."""
    from app.services import site_service

    payload = site_service.recommend(db, "Hospital", limit=3, persist=False)
    assert payload["data_status"] == "derived"
    assert all("model" not in r for r in payload["results"])


# -- geospatial ----------------------------------------------------------


def test_distances_are_metric_not_degrees(db) -> None:
    result = gis_service.nearest_neighbours(db, limit=2)
    first = result["results"][0]
    assert first["neighbours"]
    # Chennai localities sit within tens of kilometres of one another.
    for n in first["neighbours"]:
        assert 0 < n["distance_km"] < 80


def test_catchment_buffers_have_the_right_area(db) -> None:
    result = gis_service.catchment_analysis(db, radius_km=5)
    # A 5 km buffer is pi * 25 = 78.5 km2.
    for row in result["results"][:5]:
        assert row["catchment_area_km2"] == pytest.approx(78.5, abs=1.0)


def test_coverage_gaps_flag_distant_localities(db) -> None:
    result = gis_service.coverage_gaps(db, radius_km=5)
    assert result["total_localities"] > 0
    names = {u["locality"] for u in result["uncovered"]}
    # Nemmeli is the far-southern desalination site with no nearby candidate.
    assert "Nemmeli" in names


def test_spatial_summary_bounds_cover_chennai(db) -> None:
    summary = gis_service.spatial_summary(db)
    assert 12.5 < summary["centroid"]["latitude"] < 13.5
    assert 79.9 < summary["centroid"]["longitude"] < 80.6
    assert summary["convex_hull_area_km2"] > 100


# -- RAG -----------------------------------------------------------------


def test_corpus_is_populated(db) -> None:
    stats = rag_service.corpus_stats(db)
    assert stats["documents"] > 0
    assert stats["chunks"] > 0
    assert stats["embeddings"] == stats["chunks"]


def test_retrieval_finds_the_right_scheme(db) -> None:
    hits = rag_service.search(db, "Which scheme funds a storm water drain?", top_k=3)
    assert hits
    assert "AMRUT" in hits[0].document_title


def test_retrieval_finds_methodology(db) -> None:
    hits = rag_service.search(db, "how are recommendation tiers decided", top_k=3)
    assert any("methodology" in h.doc_type for h in hits)


def test_every_passage_carries_provenance(db) -> None:
    for hit in rag_service.search(db, "contingency for a high risk project", top_k=3):
        payload = hit.as_dict()
        assert payload["verification_status"]
        assert "is_demo_data" in payload


def test_empty_query_returns_nothing(db) -> None:
    assert rag_service.search(db, "   ") == []


# -- persistence and audit ----------------------------------------------


def test_scoring_run_is_persisted(db) -> None:
    from app.services import site_service

    before = len(persistence_service.recent_scores(db, limit=500))
    site_service.recommend(db, "School", limit=4, persist=True)
    after = persistence_service.recent_scores(db, limit=500)
    assert len(after) >= before + 4
    assert after[0]["infrastructure_type"] == "School"
    assert after[0]["recommendation"]


def test_audit_entries_are_written(db) -> None:
    persistence_service.audit(db, action="test.action", entity_type="test", entity_id="1", detail="x")
    entries = persistence_service.recent_audit(db, limit=10)
    assert entries[0]["action"] == "test.action"


def test_ai_output_is_recorded(db) -> None:
    persistence_service.record_ai_output(
        db, entity_type="site", entity_id=1, recommendation_type="unit_test", payload={"ok": True}
    )
    rows = persistence_service.recent_ai_outputs(db, limit=10)
    assert rows[0]["recommendation_type"] == "unit_test"


# -- MQTT ----------------------------------------------------------------


def test_mqtt_is_optional_and_reports_status() -> None:
    status = mqtt_service.ingestor.status()
    assert status["configured"] is False
    assert status["connected"] is False
    assert any("optional" in n for n in status["notes"])


def test_mqtt_payload_shares_the_http_ingest_path(db) -> None:
    """An MQTT reading must be stored exactly like an HTTP one."""
    result = mqtt_service.ingestor.handle_payload(
        {"device_id": "NIR-WL-001", "sensor_type": "water_level", "value": 0.95, "unit": "m"}
    )
    assert result["status"] in ("NORMAL", "WARNING", "CRITICAL")
    assert result["device_id"] == "NIR-WL-001"


def test_mqtt_rejects_unknown_device_and_bad_payload() -> None:
    assert "error" in mqtt_service.ingestor.handle_payload({"device_id": "NOPE", "value": 1})
    assert "error" in mqtt_service.ingestor.handle_payload({"value": 1})
    assert "error" in mqtt_service.ingestor.handle_payload(
        {"device_id": "NIR-WL-001", "value": "not-a-number"}
    )


# -- API surface ---------------------------------------------------------


def test_advanced_endpoints_respond(client) -> None:
    for url in (
        "/api/v1/ml/providers",
        "/api/v1/ml/model",
        "/api/v1/ml/sites/1/explain",
        "/api/v1/ml/sites/ranked?provider=ml&limit=3",
        "/api/v1/spatial/summary",
        "/api/v1/spatial/neighbours",
        "/api/v1/spatial/catchments",
        "/api/v1/spatial/coverage-gaps",
        "/api/v1/knowledge/search?q=drainage%20scheme",
        "/api/v1/knowledge/stats",
        "/api/v1/history/site-scores",
        "/api/v1/history/ai-recommendations",
        "/api/v1/history/audit-log",
        "/api/v1/iot/mqtt-status",
    ):
        assert client.get(url).status_code == 200, url


def test_ml_explain_404s_for_unknown_site(client) -> None:
    assert client.get("/api/v1/ml/sites/99999/explain").status_code == 404


def test_knowledge_search_validates_input(client) -> None:
    assert client.get("/api/v1/knowledge/search?q=a").status_code == 422


def test_copilot_answers_carry_retrieved_passages(client) -> None:
    body = client.post(
        "/api/v1/copilot/query",
        json={"question": "Which government scheme is relevant for a storm water drain?"},
    ).json()
    assert body["retrieved"]
    assert any("AMRUT" in r["document"] for r in body["retrieved"])
