"""Decision-engine unit tests."""

from __future__ import annotations

import pytest

from app import repositories as repo
from app.engines import cost, demand, priority, risk, schemes, whatif
from app.engines.suitability import (
    Calibration,
    evaluate_site,
    rank_sites,
    recommendation_tier,
)
from app.engines.weights import (
    DEFAULT_SITE_WEIGHTS,
    DEFAULT_WHAT_IF_WEIGHTS,
    InvalidWeightsError,
    resolve_weights,
    validate_weights,
)


# -- recommendation tiers ------------------------------------------------


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (100.0, "Recommended"),
        (83.0, "Recommended"),
        (82.9, "Consider"),
        (75.0, "Consider"),
        (74.9, "Further Assessment Required"),
        (70.0, "Further Assessment Required"),
        (69.9, "Not Recommended"),
        (0.0, "Not Recommended"),
    ],
)
def test_recommendation_tier_boundaries(score: float, expected: str) -> None:
    assert recommendation_tier(score) == expected


# -- weights -------------------------------------------------------------


def test_weights_must_total_100() -> None:
    with pytest.raises(InvalidWeightsError):
        validate_weights({"budget": 50.0, "accessibility": 30.0}, set(DEFAULT_WHAT_IF_WEIGHTS))


def test_weights_reject_unknown_keys() -> None:
    with pytest.raises(InvalidWeightsError):
        validate_weights({"nonsense": 100.0}, set(DEFAULT_WHAT_IF_WEIGHTS))


def test_weights_reject_negative() -> None:
    with pytest.raises(InvalidWeightsError):
        validate_weights(
            {"budget": -10.0, "accessibility": 110.0}, set(DEFAULT_WHAT_IF_WEIGHTS)
        )


def test_weights_normalise_to_exactly_100() -> None:
    resolved = validate_weights(
        {
            "budget": 20.2,
            "accessibility": 20.0,
            "flood_safety": 20.0,
            "population_coverage": 20.0,
            "sustainability": 20.0,
        },
        set(DEFAULT_WHAT_IF_WEIGHTS),
    )
    assert sum(resolved.values()) == pytest.approx(100.0)


def test_resolve_weights_falls_back_to_defaults() -> None:
    assert resolve_weights(None, DEFAULT_SITE_WEIGHTS) == DEFAULT_SITE_WEIGHTS


# -- site suitability ----------------------------------------------------


def test_site_score_within_bounds_and_factors_sum_to_score(db) -> None:
    site = repo.all_sites(db)[0]
    result = evaluate_site(site, "Hospital")
    assert 0.0 <= result.score <= 100.0
    assert 40.0 <= result.confidence <= 99.0
    assert sum(f.contribution for f in result.factors) == pytest.approx(result.score, abs=0.01)
    assert result.recommendation == recommendation_tier(result.score)


def test_all_nine_factors_are_scored(db) -> None:
    site = repo.all_sites(db)[0]
    result = evaluate_site(site, "Hospital")
    assert {f.name for f in result.factors} == set(DEFAULT_SITE_WEIGHTS)


def test_weighting_changes_the_ranking(db) -> None:
    sites = repo.all_sites(db)
    flood_first = rank_sites(
        sites,
        "Hospital",
        {
            "population_coverage": 5.0,
            "accessibility": 5.0,
            "flood_safety": 60.0,
            "land_suitability": 10.0,
            "infrastructure_gap": 5.0,
            "terrain": 5.0,
            "water_availability": 4.0,
            "electricity_availability": 3.0,
            "existing_facility_distance": 3.0,
        },
        limit=1,
    )
    population_first = rank_sites(
        sites,
        "Hospital",
        {
            "population_coverage": 60.0,
            "accessibility": 10.0,
            "flood_safety": 5.0,
            "land_suitability": 5.0,
            "infrastructure_gap": 5.0,
            "terrain": 5.0,
            "water_availability": 4.0,
            "electricity_availability": 3.0,
            "existing_facility_distance": 3.0,
        },
        limit=1,
    )
    assert flood_first[0].site_name != population_first[0].site_name


def test_ranking_is_ordered_descending(db) -> None:
    results = rank_sites(repo.all_sites(db), "Hospital")
    scores = [r.score for r in results]
    assert scores == sorted(scores, reverse=True)


def test_calibration_is_consistent_between_single_and_ranked(db) -> None:
    sites = repo.all_sites(db)
    calibration = Calibration.from_sites(sites, "Hospital")
    ranked = rank_sites(sites, "Hospital", calibration=calibration)
    top = ranked[0]
    site = next(s for s in sites if s.id == top.site_id)
    standalone = evaluate_site(site, "Hospital", None, calibration)
    assert standalone.score == pytest.approx(top.score)


def test_land_requirement_varies_by_infrastructure_type(db) -> None:
    """A compact plot suits a health centre better than a hospital."""
    site = next(s for s in repo.all_sites(db) if s.land_available_acres and s.land_available_acres < 5)
    hospital = evaluate_site(site, "Hospital")
    health_centre = evaluate_site(site, "Health Centre")
    land_h = next(f for f in hospital.factors if f.name == "land_suitability")
    land_c = next(f for f in health_centre.factors if f.name == "land_suitability")
    assert land_c.normalized > land_h.normalized


# -- what-if -------------------------------------------------------------


def test_what_if_reranks_and_reports_movement(db) -> None:
    rows = repo.what_if_areas(db)
    result = whatif.simulate(
        rows,
        {
            "budget": 15.0,
            "accessibility": 15.0,
            "flood_safety": 40.0,
            "population_coverage": 20.0,
            "sustainability": 10.0,
        },
    )
    assert result["areas_evaluated"] == len(rows)
    assert result["dominant_parameter"] == "Flood Safety"
    ranks = [r["new_rank"] for r in result["results"]]
    assert ranks == list(range(1, len(rows) + 1))
    # Weighting flood safety heavily must promote a high-flood-safety area.
    top = result["results"][0]
    assert top["parameters"]["flood_safety"] >= 95


def test_what_if_equal_weights_matches_baseline(db) -> None:
    result = whatif.simulate(repo.what_if_areas(db), DEFAULT_WHAT_IF_WEIGHTS)
    for row in result["results"]:
        assert row["score_change"] == pytest.approx(0.0, abs=0.01)
        assert row["rank_change"] == 0


def test_what_if_rejects_bad_weights(db) -> None:
    with pytest.raises(InvalidWeightsError):
        whatif.simulate(repo.what_if_areas(db), {"budget": 100.0, "accessibility": 50.0})


# -- risk ----------------------------------------------------------------


def test_risk_classification_orders_correctly(db) -> None:
    records = {r.location: r for r in repo.risk_records(db)}
    very_high = risk.assess(records["Pallikaranai"])
    low = risk.assess(records["Anna Nagar"])
    assert very_high.overall_score > low.overall_score
    assert very_high.overall_level in ("High", "Very High")
    assert low.overall_level == "Low"


def test_risk_components_are_weighted_to_100(db) -> None:
    result = risk.assess(repo.risk_records(db)[0])
    assert sum(c.weight for c in result.components) == pytest.approx(100.0)
    assert sum(c.contribution for c in result.components) == pytest.approx(
        result.overall_score, abs=0.01
    )


def test_risk_output_is_labelled_rule_based(db) -> None:
    result = risk.assess(repo.risk_records(db)[0])
    assert result.method == "rule_based"
    assert any("not a flood forecast" in note for note in result.notes)


@pytest.mark.parametrize(
    ("value", "warning", "critical", "expected"),
    [(0.5, 1.8, 2.6, "NORMAL"), (1.9, 1.8, 2.6, "WARNING"), (2.7, 1.8, 2.6, "CRITICAL")],
)
def test_sensor_status_thresholds(value, warning, critical, expected) -> None:
    assert risk.sensor_status(value, warning, critical) == expected


def test_sensor_trend() -> None:
    assert risk.sensor_trend([1.0, 1.2, 1.5]) == "rising"
    assert risk.sensor_trend([1.5, 1.2, 1.0]) == "falling"
    assert risk.sensor_trend([1.0, 1.0, 1.0]) == "steady"


# -- priority ------------------------------------------------------------


def test_priority_ranking_is_complete_and_ordered(db) -> None:
    result = priority.rank(
        repo.priority_projects(db), repo.risk_by_location(db), repo.population_by_location(db)
    )
    assert result["projects_ranked"] == 40
    ranks = [r["computed_rank"] for r in result["results"]]
    assert ranks == list(range(1, 41))
    scores = [r["computed_score"] for r in result["results"]]
    assert scores == sorted(scores, reverse=True)


def test_priority_sector_summary_matches_source_averages(db) -> None:
    """Sector labels were reconciled against the published report averages."""
    result = priority.rank(repo.priority_projects(db))
    by_sector = {s["sector"]: s for s in result["sector_summary"]}
    assert by_sector["Healthcare"]["count"] == 4
    assert by_sector["Healthcare"]["average_impact"] == pytest.approx(84.8, abs=0.05)
    assert by_sector["Transport & Connectivity"]["count"] == 11
    assert by_sector["Transport & Connectivity"]["average_impact"] == pytest.approx(78.2, abs=0.05)
    assert by_sector["Education"]["average_impact"] == pytest.approx(77.7, abs=0.05)


# -- cost ----------------------------------------------------------------


def test_cost_breakdown_partitions_the_total() -> None:
    result = cost.estimate_cost("Hospital", risk_level="Medium", known_budget_cr=120.0)
    assert result.estimate_cr == pytest.approx(120.0)
    assert sum(result.breakdown.values()) == pytest.approx(120.0, abs=0.05)
    assert result.low_cr < result.estimate_cr < result.high_cr


def test_derived_cost_includes_contingency_on_top() -> None:
    result = cost.estimate_cost("School", scale="standard", risk_level="Low")
    base = cost.BASE_RATE_CR["School"]
    assert result.estimate_cr == pytest.approx(base * 1.08, abs=0.01)
    assert sum(result.breakdown.values()) == pytest.approx(result.estimate_cr, abs=0.05)


def test_higher_risk_widens_contingency() -> None:
    low = cost.estimate_cost("Bridge", risk_level="Low")
    high = cost.estimate_cost("Bridge", risk_level="High")
    assert high.contingency_pct > low.contingency_pct
    assert (high.high_cr - high.low_cr) > (low.high_cr - low.low_cr)


def test_cost_never_claims_approval() -> None:
    result = cost.estimate_cost("Hospital")
    assert any("not an approved government cost" in n for n in result.notes)


def test_timeline_phases_cover_the_duration() -> None:
    plan = cost.plan_timeline(total_months=24, peak_labour=220, machinery="Tower Crane")
    assert sum(p["duration_months"] for p in plan.phases) == pytest.approx(24, abs=2)
    assert max(p["labour"] for p in plan.phases) == 220
    assert plan.machinery == ["Tower Crane"]


# -- schemes -------------------------------------------------------------


def test_scheme_mapping_by_project_type(db) -> None:
    catalogue = repo.schemes(db)
    result = schemes.recommend(catalogue, "Drainage")
    assert result.matches
    assert result.matches[0].scheme_name == "AMRUT 2.0"


def test_scheme_inference_prefers_the_longest_keyword(db) -> None:
    """'storm water drain' is drainage, not water supply."""
    assert schemes.infer_project_type("Storm Water Drain") == "Drainage"
    result = schemes.recommend(repo.schemes(db), "Other", "Storm Water Drain")
    assert result.matches[0].scheme_name == "AMRUT 2.0"


def test_scheme_engine_reports_no_match_rather_than_guessing(db) -> None:
    result = schemes.recommend(repo.schemes(db), "Orbital Launch Pad")
    assert not result.matches
    assert any("Insufficient verified data available" in n for n in result.notes)


def test_scheme_matches_carry_source_and_verification(db) -> None:
    result = schemes.recommend(repo.schemes(db), "Hospital")
    match = result.matches[0]
    assert match.source_url
    assert match.verification_status == "pending_verification"


# -- demand --------------------------------------------------------------


def test_demand_growth_arithmetic(db) -> None:
    record = next(r for r in repo.population_records(db) if r.location == "Mudichur")
    result = demand.analyse(record)
    # 76,000 -> 178,000 is roughly 134% growth over 2026-2045.
    assert result.growth_pct == pytest.approx(134.2, abs=0.5)
    assert result.cagr_pct > 0
    assert len(result.series) == 4


def test_demand_portfolio_summary(db) -> None:
    summary = demand.portfolio_summary(repo.population_records(db))
    assert summary["locations"] == 30
    assert summary["totals"]["2026"] == 4_206_000
    assert summary["overall_growth_pct"] == pytest.approx(39.5, abs=0.2)
