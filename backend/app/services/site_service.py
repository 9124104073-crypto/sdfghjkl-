"""Site recommendation service.

Wraps the suitability, explainability, risk and demand engines so the API
layer never composes engine calls itself.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus
from app.engines import demand, explain, risk as risk_engine
from app.engines.suitability import Calibration, SuitabilityResult, evaluate_site, rank_sites
from app.services import persistence_service
from app.models.spatial import Site

FLOOD_RISK_ORDER = ["Very Low", "Low", "Moderate", "Medium", "High", "Very High"]

INFRASTRUCTURE_TYPES = [
    "Hospital",
    "School",
    "Fire Station",
    "Water Facility",
    "Road",
    "Community Centre",
    "Health Centre",
    "Other",
]


def site_to_dict(site: Site) -> dict[str, Any]:
    return {
        "id": site.id,
        "site_code": site.site_code,
        "name": site.name,
        "zone": site.zone,
        "district": site.district,
        "latitude": site.latitude,
        "longitude": site.longitude,
        "population_catchment_5km": site.population_catchment_5km,
        "population_density": site.population_density,
        "existing_hospitals": site.existing_hospitals,
        "existing_schools": site.existing_schools,
        "distance_major_road_km": site.distance_major_road_km,
        "transit_access": site.transit_access,
        "road_connectivity": site.road_connectivity,
        "flood_risk": site.flood_risk,
        "elevation_m": site.elevation_m,
        "slope_deg": site.slope_deg,
        "terrain_suitability": site.terrain_suitability,
        "land_use": site.land_use,
        "land_available_acres": site.land_available_acres,
        "land_cost_cr_per_acre": site.land_cost_cr_per_acre,
        "utility_infrastructure": site.utility_infrastructure,
        "water_availability": site.water_availability,
        "electricity_availability": site.electricity_availability,
        "internet_availability": site.internet_availability,
        "recommended_infrastructure": site.recommended_infrastructure,
        "dataset": {
            "ai_score": site.dataset_ai_score,
            "confidence": site.dataset_confidence,
            "recommendation": site.dataset_recommendation,
            "road_score": site.road_score,
            "access_score": site.access_score,
            "infra_score": site.infra_score,
            "environment_score": site.environment_score,
            "cost_score": site.cost_score,
            "note": "Scores exactly as published in the source dataset, before any NIRMAN engine run.",
        },
        "source": {
            "source_name": site.source_name,
            "source_type": site.source_type,
            "source_url": site.source_url,
            "verification_status": site.verification_status,
            "is_demo_data": site.is_demo_data,
            "coordinate_note": "Latitude/longitude are approximate locality centroids for map display.",
        },
    }


def _filter(sites: list[Site], zone: str | None, max_flood_risk: str | None) -> list[Site]:
    result = sites
    if zone:
        result = [s for s in result if (s.zone or "").lower() == zone.lower()]
    if max_flood_risk:
        try:
            ceiling = FLOOD_RISK_ORDER.index(max_flood_risk)
        except ValueError:
            ceiling = len(FLOOD_RISK_ORDER) - 1
        result = [
            s
            for s in result
            if s.flood_risk in FLOOD_RISK_ORDER and FLOOD_RISK_ORDER.index(s.flood_risk) <= ceiling
        ]
    return result


def recommend(
    db: Session,
    infrastructure_type: str = "Hospital",
    weights: dict[str, float] | None = None,
    limit: int = 5,
    zone: str | None = None,
    max_flood_risk: str | None = None,
    persist: bool = True,
) -> dict[str, Any]:
    """Top-N candidate sites for an infrastructure type, with explanations."""
    sites = _filter(repo.all_sites(db), zone, max_flood_risk)
    if not sites:
        return {
            "infrastructure_type": infrastructure_type,
            "results": [],
            "data_status": DataStatus.DERIVED,
            "notes": ["No candidate sites matched the supplied filters."],
        }

    results = rank_sites(sites, infrastructure_type, weights, limit=limit)
    risk_lookup = repo.risk_by_location(db)
    population_lookup = repo.population_by_location(db)
    by_id = {s.id: s for s in sites}

    enriched = []
    for result in results:
        site = by_id[result.site_id]
        payload = result.as_dict()
        payload["site"] = site_to_dict(site)
        risk_record = risk_lookup.get(site.name)
        payload["risk"] = (
            risk_engine.assess(risk_record).as_dict()
            if risk_record
            else risk_engine.assess_site(site).as_dict()
        )
        population = population_lookup.get(site.name)
        payload["demand"] = demand.analyse(population).as_dict() if population else None
        payload["infrastructure_gaps"] = [
            {
                "infrastructure_type": g.infrastructure_type,
                "gap_score": g.gap_score,
                "facilities_per_100k": g.facilities_per_100k,
                "notes": g.notes,
            }
            for g in repo.gaps_for_site(db, site.id)
        ]
        enriched.append(payload)

    # Persist the run so a recommendation can be reviewed after the fact.
    recorded = 0
    if persist and enriched:
        recorded = persistence_service.record_site_scores(
            db, enriched, infrastructure_type, provider="mcda"
        )
        persistence_service.audit(
            db,
            action="sites.recommend",
            entity_type="infrastructure_type",
            entity_id=infrastructure_type,
            detail=f"{len(enriched)} of {len(sites)} candidates returned",
        )

    return {
        "infrastructure_type": infrastructure_type,
        "weights": results[0].weights if results else {},
        "candidates_evaluated": len(sites),
        "scores_recorded": recorded,
        "results": enriched,
        "comparison": explain.explain_comparison(results),
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Scores are produced by the deterministic NIRMAN Site Suitability Engine, not by a "
            "language model.",
            "Underlying site attributes are demonstration data - requires validation before "
            "real-world use.",
        ],
    }


def evaluate(
    db: Session,
    site_id: int,
    infrastructure_type: str = "Hospital",
    weights: dict[str, float] | None = None,
) -> SuitabilityResult | None:
    """Score one site against the full candidate set.

    The calibration is always built from every site, so a score shown on a
    detail page matches the score the same site receives in the ranked list.
    """
    site = repo.site_by_id(db, site_id)
    if site is None:
        return None
    calibration = Calibration.from_sites(repo.all_sites(db), infrastructure_type)
    return evaluate_site(site, infrastructure_type, weights, calibration)


def explanation(
    db: Session,
    site_id: int,
    infrastructure_type: str = "Hospital",
    weights: dict[str, float] | None = None,
) -> dict[str, Any] | None:
    result = evaluate(db, site_id, infrastructure_type, weights)
    if result is None:
        return None
    payload = explain.explain_site(result)
    site = repo.site_by_id(db, site_id)
    payload["source"] = site_to_dict(site)["source"] if site else {}
    return payload


def detail(db: Session, site_id: int) -> dict[str, Any] | None:
    site = repo.site_by_id(db, site_id)
    if site is None:
        return None
    payload = site_to_dict(site)
    risk_record = repo.risk_by_location(db).get(site.name)
    payload["risk"] = (
        risk_engine.assess(risk_record).as_dict() if risk_record else risk_engine.assess_site(site).as_dict()
    )
    population = repo.population_by_location(db).get(site.name)
    payload["demand"] = demand.analyse(population).as_dict() if population else None
    infrastructure = site.recommended_infrastructure or "Hospital"
    payload["suitability"] = evaluate_site(
        site, infrastructure, None, Calibration.from_sites(repo.all_sites(db), infrastructure)
    ).as_dict()
    payload["infrastructure_gaps"] = [
        {
            "infrastructure_type": g.infrastructure_type,
            "gap_score": g.gap_score,
            "facilities_per_100k": g.facilities_per_100k,
            "notes": g.notes,
        }
        for g in repo.gaps_for_site(db, site.id)
    ]
    return payload
