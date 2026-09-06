"""NIRMAN AI REST API (v1).

Every scoring, ranking and estimating decision happens behind these endpoints.
The frontend calls them; it never implements decision logic itself.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.config import settings
from app.core.constants import DataStatus
from app.core.database import get_db
from app.engines import cost as cost_engine
from app.engines import demand as demand_engine
from app.engines import priority as priority_engine
from app.engines import risk as risk_engine
from app.engines import schemes as scheme_engine
from app.engines import whatif as whatif_engine
from app.engines.weights import (
    DEFAULT_PRIORITY_WEIGHTS,
    DEFAULT_SITE_WEIGHTS,
    DEFAULT_WHAT_IF_WEIGHTS,
    MCDA_WEIGHTS,
)
from app.api.v1.advanced import router as advanced_router
from app.providers.data import lineage, list_providers
from app.schemas import (
    CopilotRequest,
    CostRequest,
    DprRequest,
    Envelope,
    IotIngestRequest,
    IotSimulateRequest,
    PriorityRequest,
    RecommendationRequest,
    WhatIfRequest,
)
from app.services import copilot_service, dpr_service, iot_service, project_service, site_service
from app.services.site_service import INFRASTRUCTURE_TYPES

router = APIRouter(prefix="/api/v1")


# -- sites ---------------------------------------------------------------

sites_router = APIRouter(prefix="/sites", tags=["Sites"])


@sites_router.get("", summary="List candidate sites")
def list_sites(db: Session = Depends(get_db), zone: str | None = None) -> Envelope:
    rows = [site_service.site_to_dict(s) for s in repo.all_sites(db, zone)]
    return Envelope.of(rows, data_status=DataStatus.DEMO, is_demo_data=True)


@sites_router.get("/recommended", summary="Top-ranked sites for an infrastructure type")
def recommended_sites(
    db: Session = Depends(get_db),
    infrastructure_type: str = Query(default="Hospital"),
    limit: int = Query(default=5, ge=1, le=40),
    zone: str | None = None,
    max_flood_risk: str | None = None,
    persist: bool = Query(default=True, description="Record the run in site_scores"),
) -> dict[str, Any]:
    return site_service.recommend(
        db, infrastructure_type, None, limit=limit, zone=zone,
        max_flood_risk=max_flood_risk, persist=persist,
    )


@sites_router.post("/recommended", summary="Top-ranked sites with custom weights")
def recommended_sites_weighted(
    payload: RecommendationRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    return site_service.recommend(
        db,
        payload.infrastructure_type,
        payload.weights,
        limit=payload.limit,
        zone=payload.zone,
        max_flood_risk=payload.max_flood_risk,
    )


@sites_router.get("/infrastructure-types", summary="Supported infrastructure types")
def infrastructure_types() -> Envelope:
    return Envelope.of(INFRASTRUCTURE_TYPES, data_status=DataStatus.SOURCE, is_demo_data=False)


@sites_router.get("/mcda", summary="Published 30-site MCDA scorecard")
def mcda(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = repo.mcda_scores(db)
    return {
        "weights": MCDA_WEIGHTS,
        "results": [
            {
                "mcda_code": r.mcda_code,
                "locality": r.locality,
                "site_id": r.site_id,
                "population_coverage": r.population_coverage,
                "accessibility": r.accessibility,
                "flood_safety": r.flood_safety,
                "land_suitability": r.land_suitability,
                "infrastructure_readiness": r.infrastructure_readiness,
                "composite_score": r.composite_score,
                "published_rank": r.published_rank,
            }
            for r in rows
        ],
        "data_status": DataStatus.DEMO,
        "notes": ["Composite scores recomputed from criterion scores using the published weights."],
    }


@sites_router.get("/{site_id}", summary="Full site detail")
def site_detail(site_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    payload = site_service.detail(db, site_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Site {site_id} not found.")
    return payload


@sites_router.get("/{site_id}/explain", summary="Explainable AI breakdown for a site")
def site_explain(
    site_id: int,
    db: Session = Depends(get_db),
    infrastructure_type: str = Query(default="Hospital"),
) -> dict[str, Any]:
    payload = site_service.explanation(db, site_id, infrastructure_type)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Site {site_id} not found.")
    return payload


# -- priority ------------------------------------------------------------

priority_router = APIRouter(prefix="/priority-projects", tags=["Priority"])


@priority_router.get("", summary="Priority ranking")
def get_priority(
    db: Session = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, le=40),
    sector: str | None = None,
) -> dict[str, Any]:
    return priority_engine.rank(
        repo.priority_projects(db, sector),
        repo.risk_by_location(db),
        repo.population_by_location(db),
        limit=limit,
    )


@priority_router.post("", summary="Priority ranking with custom weights")
def post_priority(payload: PriorityRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    return priority_engine.rank(
        repo.priority_projects(db, payload.sector),
        repo.risk_by_location(db),
        repo.population_by_location(db),
        weights=payload.weights,
        limit=payload.limit,
    )


@priority_router.get("/weights", summary="Default priority weights")
def priority_weights() -> Envelope:
    return Envelope.of(DEFAULT_PRIORITY_WEIGHTS, data_status=DataStatus.SOURCE, is_demo_data=False)


# -- what-if -------------------------------------------------------------

whatif_router = APIRouter(prefix="/what-if", tags=["What-If"])


@whatif_router.get("/areas", summary="Baseline what-if parameters per area")
def whatif_areas(db: Session = Depends(get_db)) -> Envelope:
    rows = [
        {
            "area": r.area,
            "budget": r.budget,
            "accessibility": r.accessibility,
            "flood_safety": r.flood_safety,
            "population_coverage": r.population_coverage,
            "sustainability": r.sustainability,
        }
        for r in repo.what_if_areas(db)
    ]
    return Envelope.of(rows, data_status=DataStatus.DEMO, is_demo_data=True)


@whatif_router.get("/weights", summary="Default what-if weights")
def whatif_weights() -> Envelope:
    return Envelope.of(DEFAULT_WHAT_IF_WEIGHTS, data_status=DataStatus.SOURCE, is_demo_data=False)


@whatif_router.post("/simulate", summary="Recalculate the ranking under new weights")
def whatif_simulate(payload: WhatIfRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    return whatif_engine.simulate(repo.what_if_areas(db), payload.weights, top_n=payload.top_n)


# -- risk ----------------------------------------------------------------

risk_router = APIRouter(prefix="/risk", tags=["Risk & Climate"])


@risk_router.get("", summary="Risk classification for every locality")
def get_risk(db: Session = Depends(get_db)) -> dict[str, Any]:
    records = repo.risk_records(db)
    results = [risk_engine.assess(r).as_dict() for r in records]
    centroids = {
        a.name: {"latitude": a.latitude, "longitude": a.longitude}
        for a in repo.assets(db, asset_type="locality_centroid")
    }
    for site in repo.all_sites(db):
        centroids.setdefault(site.name, {"latitude": site.latitude, "longitude": site.longitude})
    for entry in results:
        entry.update(centroids.get(entry["location"], {"latitude": None, "longitude": None}))

    distribution: dict[str, int] = {}
    for record in records:
        distribution[record.flood_vulnerability] = distribution.get(record.flood_vulnerability, 0) + 1

    rainfall = [r.annual_rainfall_mm for r in records if r.annual_rainfall_mm]
    return {
        "results": results,
        "summary": {
            "locations": len(records),
            "flood_vulnerability_distribution": distribution,
            "average_rainfall_mm": round(sum(rainfall) / len(rainfall)) if rainfall else None,
            "high_risk_count": sum(
                1 for r in records if r.flood_vulnerability in ("High", "Very High")
            ),
        },
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Rule-based classification over demonstration indicators. Not a validated flood forecast.",
            "For production use, replace with Chennai Flood Monitoring System, ISRO Bhuvan, IMD and "
            "SRTM sources.",
        ],
    }


# -- population ----------------------------------------------------------

population_router = APIRouter(prefix="/population", tags=["Demand"])


@population_router.get("", summary="Population projections and demand scores")
def get_population(db: Session = Depends(get_db)) -> dict[str, Any]:
    records = repo.population_records(db)
    return {
        "results": [demand_engine.analyse(r).as_dict() for r in records],
        "summary": demand_engine.portfolio_summary(records),
        "data_status": DataStatus.DERIVED,
    }


# -- projects, cost, DPR -------------------------------------------------

projects_router = APIRouter(prefix="/projects", tags=["Projects"])


@projects_router.get("", summary="Project portfolio")
def get_projects(db: Session = Depends(get_db), sector: str | None = None) -> dict[str, Any]:
    return project_service.portfolio(db, sector)


@projects_router.get("/{project_id}", summary="Project detail with cost, timeline and scheme")
def get_project(project_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    payload = project_service.detail(db, project_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")
    return payload


cost_router = APIRouter(prefix="/cost", tags=["Cost & Construction"])


@cost_router.post("/estimate", summary="Planning-level cost estimate")
def estimate(payload: CostRequest) -> dict[str, Any]:
    result = cost_engine.estimate_cost(
        project_type=payload.project_type,
        scale=payload.scale,
        risk_level=payload.risk_level,
        labour=payload.labour,
        machinery=payload.machinery,
    )
    return result.as_dict()


@cost_router.get("/project-types", summary="Project types with an indicative base rate")
def project_types() -> Envelope:
    return Envelope.of(
        sorted(cost_engine.BASE_RATE_CR),
        data_status=DataStatus.DEMO,
        is_demo_data=True,
        notes=["Base rates are indicative demonstration norms for portfolio comparison only."],
    )


dpr_router = APIRouter(prefix="/dpr", tags=["AI DPR"])


@dpr_router.get("/projects", summary="Projects available for DPR generation")
def dpr_projects(db: Session = Depends(get_db)) -> dict[str, Any]:
    return project_service.portfolio(db)


@dpr_router.post("/{project_id}/generate", summary="Generate the DPR as structured data")
def generate_dpr(
    project_id: int, payload: DprRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    result = dpr_service.build_dpr(db, project_id, payload.include_explainability)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")
    return result


@dpr_router.get("/{project_id}/download", summary="Download the DPR as a PDF")
def download_dpr(project_id: int, db: Session = Depends(get_db)) -> Response:
    result = dpr_service.build_dpr(db, project_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found.")
    pdf = dpr_service.render_pdf(result)
    filename = f"NIRMAN_AI_DPR_{result['project']['project_code']}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# -- schemes -------------------------------------------------------------

schemes_router = APIRouter(prefix="/schemes", tags=["Government Schemes"])


@schemes_router.get("", summary="Scheme reference table and mappings")
def get_schemes(db: Session = Depends(get_db)) -> dict[str, Any]:
    return project_service.scheme_catalogue(db)


@schemes_router.get("/recommend", summary="Recommend a scheme for a project type")
def recommend_scheme(
    project_type: str = Query(...),
    project_name: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return scheme_engine.recommend(repo.schemes(db), project_type, project_name).as_dict()


# -- GIS layers ----------------------------------------------------------

gis_router = APIRouter(prefix="/gis", tags=["GIS"])


@gis_router.get("/layers", summary="Map layers")
def gis_layers(db: Session = Depends(get_db), region: str | None = None) -> dict[str, Any]:
    assets = repo.assets(db, region=region)
    grouped: dict[str, list[dict[str, Any]]] = {}
    for asset in assets:
        grouped.setdefault(asset.asset_type, []).append(
            {
                "asset_code": asset.asset_code,
                "name": asset.name,
                "category": asset.category,
                "serviced_zone": asset.serviced_zone,
                "capacity": asset.capacity,
                "capacity_unit": asset.capacity_unit,
                "latitude": asset.latitude,
                "longitude": asset.longitude,
                "region": asset.region,
                "attributes": asset.attributes_json,
            }
        )
    return {
        "layers": grouped,
        "sites": [site_service.site_to_dict(s) for s in repo.all_sites(db)],
        "data_status": DataStatus.DEMO,
        "notes": [
            "Chennai site coordinates are approximate locality centroids for map display.",
            "The ward/hospital/school/water-body layer pack supplied with the project falls in the "
            "Coimbatore region and is tagged region='Coimbatore study box' so it never mixes with "
            "Chennai analytics.",
        ],
    }


# -- IoT -----------------------------------------------------------------

iot_router = APIRouter(prefix="/iot", tags=["IoT Monitoring"])


@iot_router.get("/devices", summary="Sensor fleet status")
def iot_devices(db: Session = Depends(get_db)) -> dict[str, Any]:
    return iot_service.fleet_status(db)


@iot_router.post("/simulate", summary="Generate demonstration sensor readings")
def iot_simulate(payload: IotSimulateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    return iot_service.simulate(db, payload.device_id, payload.readings, payload.escalate)


@iot_router.post("/ingest", summary="Ingest a reading (same payload an ESP32 publishes)")
def iot_ingest(payload: IotIngestRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    result = iot_service.ingest(db, payload.device_id, payload.value, payload.unit, payload.timestamp)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Device {payload.device_id} is not registered.")
    return result


# -- Copilot -------------------------------------------------------------

copilot_router = APIRouter(prefix="/copilot", tags=["NIRMAN Copilot"])


@copilot_router.post("/query", summary="Ask the Copilot a question")
def copilot_query(payload: CopilotRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    return copilot_service.answer(
        db, payload.question, payload.project_id, payload.site_id, payload.context
    )


@copilot_router.get("/suggestions", summary="Suggested questions")
def copilot_suggestions() -> Envelope:
    return Envelope.of(
        copilot_service.suggested_questions(), data_status=DataStatus.SOURCE, is_demo_data=False
    )


# -- data governance -----------------------------------------------------

data_router = APIRouter(prefix="/data-sources", tags=["Data Governance"])


@data_router.get("", summary="Data-source registry")
def data_sources(db: Session = Depends(get_db)) -> Envelope:
    rows = [
        {
            "dataset_name": r.dataset_name,
            "source_name": r.source_name,
            "source_url": r.source_url,
            "source_type": r.source_type,
            "date_collected": r.date_collected,
            "license": r.license,
            "geographic_scope": r.geographic_scope,
            "update_frequency": r.update_frequency,
            "verification_status": r.verification_status,
            "is_demo_data": r.is_demo_data,
            "record_count": r.record_count,
            "description": r.description,
        }
        for r in repo.data_sources(db)
    ]
    return Envelope.of(rows, data_status=DataStatus.SOURCE, is_demo_data=True)


@data_router.get("/lineage", summary="Metric to output data lineage")
def data_lineage(db: Session = Depends(get_db)) -> Envelope:
    return Envelope.of(lineage(db), data_status=DataStatus.SOURCE, is_demo_data=True)


@data_router.get("/providers", summary="Declared data providers and their status")
def data_providers() -> Envelope:
    return Envelope.of(list_providers(), data_status=DataStatus.SOURCE, is_demo_data=False)


# -- dashboard -----------------------------------------------------------

dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@dashboard_router.get("", summary="Dashboard rollup")
def dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    portfolio = project_service.portfolio(db)
    risk_records = repo.risk_records(db)
    sites = repo.all_sites(db)
    recommended = site_service.recommend(db, "Hospital", limit=5)
    priority = priority_engine.rank(
        repo.priority_projects(db), repo.risk_by_location(db), repo.population_by_location(db), limit=5
    )
    population = demand_engine.portfolio_summary(repo.population_records(db))
    fleet = iot_service.fleet_status(db)

    high_risk = [
        r.location for r in risk_records if r.flood_vulnerability in ("High", "Very High")
    ]

    return {
        "metrics": {
            "sites_assessed": len(sites),
            "projects": portfolio["summary"]["count"],
            "recommended_sites": sum(
                1 for s in sites if s.dataset_recommendation in ("Highly Recommended", "Recommended")
            ),
            "high_risk_areas": len(high_risk),
            "total_budget_cr": portfolio["summary"]["total_budget_cr"],
            "average_timeline_months": portfolio["summary"]["average_timeline_months"],
            "total_labour": portfolio["summary"]["total_labour"],
            "sensors_online": fleet["summary"]["online"],
            "sensor_alerts": fleet["summary"]["WARNING"] + fleet["summary"]["CRITICAL"],
        },
        "sector_distribution": portfolio["summary"]["sector_distribution"],
        "risk_distribution": portfolio["summary"]["risk_distribution"],
        "high_risk_areas": high_risk,
        "top_sites": [
            {
                "site_id": r["site_id"],
                "site_name": r["site_name"],
                "score": r["score"],
                "recommendation": r["recommendation"],
                "latitude": r["site"]["latitude"],
                "longitude": r["site"]["longitude"],
            }
            for r in recommended["results"]
        ],
        "top_priority": priority["results"],
        "population": {
            "totals": population.get("totals"),
            "overall_growth_pct": population.get("overall_growth_pct"),
        },
        "demo_mode": settings.demo_mode,
        "data_status": DataStatus.DERIVED,
        "notes": ["Rolled up from demonstration datasets - requires validation before real-world use."],
    }


@dashboard_router.get("/weights", summary="Default site-suitability weights")
def site_weights() -> Envelope:
    return Envelope.of(DEFAULT_SITE_WEIGHTS, data_status=DataStatus.SOURCE, is_demo_data=False)


for _sub in (
    sites_router,
    priority_router,
    whatif_router,
    risk_router,
    population_router,
    projects_router,
    cost_router,
    dpr_router,
    schemes_router,
    gis_router,
    iot_router,
    copilot_router,
    data_router,
    dashboard_router,
):
    router.include_router(_sub)

# ML, geospatial, knowledge-base, history and MQTT routes.
router.include_router(advanced_router)
