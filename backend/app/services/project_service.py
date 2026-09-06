"""Project, cost, timeline and scheme orchestration."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus
from app.engines import cost as cost_engine
from app.engines import schemes as scheme_engine
from app.models.planning import Project


def project_to_dict(project: Project) -> dict[str, Any]:
    estimate = project.estimate
    resources = project.resources
    return {
        "id": project.id,
        "project_code": project.project_code,
        "area": project.area,
        "name": project.name,
        "sector": project.sector,
        "project_type": project.project_type,
        "site_id": project.site_id,
        "suitability_score": project.suitability_score,
        "dataset_recommendation": project.dataset_recommendation,
        "dataset_risk_level": project.dataset_risk_level,
        "budget_cr": estimate.budget_cr if estimate else None,
        "budget_range_cr": (
            [estimate.budget_low_cr, estimate.budget_high_cr] if estimate else None
        ),
        "timeline_months": resources.timeline_months if resources else None,
        "peak_labour": resources.peak_labour if resources else None,
        "machinery": resources.machinery if resources else None,
        "scheme": (
            project.scheme_recommendations[0].scheme_name
            if project.scheme_recommendations
            else None
        ),
        "source": {
            "source_name": project.source_name,
            "verification_status": project.verification_status,
            "is_demo_data": project.is_demo_data,
        },
    }


def portfolio(db: Session, sector: str | None = None) -> dict[str, Any]:
    projects = repo.all_projects(db, sector)
    rows = [project_to_dict(p) for p in projects]
    budgets = [r["budget_cr"] for r in rows if r["budget_cr"] is not None]
    timelines = [r["timeline_months"] for r in rows if r["timeline_months"] is not None]
    risks: dict[str, int] = {}
    recommendations: dict[str, int] = {}
    sectors: dict[str, int] = {}
    for row in rows:
        risks[row["dataset_risk_level"]] = risks.get(row["dataset_risk_level"], 0) + 1
        recommendations[row["dataset_recommendation"]] = (
            recommendations.get(row["dataset_recommendation"], 0) + 1
        )
        sectors[row["sector"]] = sectors.get(row["sector"], 0) + 1

    return {
        "projects": rows,
        "summary": {
            "count": len(rows),
            "total_budget_cr": round(sum(budgets), 2),
            "average_timeline_months": round(sum(timelines) / len(timelines), 1) if timelines else 0,
            "average_suitability": (
                round(sum(r["suitability_score"] for r in rows if r["suitability_score"]) / len(rows), 1)
                if rows
                else 0
            ),
            "total_labour": sum(r["peak_labour"] or 0 for r in rows),
            "risk_distribution": risks,
            "recommendation_distribution": recommendations,
            "sector_distribution": sectors,
        },
        "data_status": DataStatus.DEMO,
        "notes": [
            "Budgets are planning-level demonstration values, never approved government costs.",
        ],
    }


def detail(db: Session, project_id: int) -> dict[str, Any] | None:
    project = repo.project_by_id(db, project_id)
    if project is None:
        return None

    estimate = project.estimate
    resources = project.resources

    cost = cost_engine.estimate_cost(
        project_type=project.project_type,
        risk_level=project.dataset_risk_level or "Medium",
        labour=resources.peak_labour if resources else None,
        machinery=resources.machinery if resources else None,
        known_budget_cr=estimate.budget_cr if estimate else None,
    )
    timeline = cost_engine.plan_timeline(
        total_months=resources.timeline_months if resources else 12,
        peak_labour=resources.peak_labour if resources else 60,
        machinery=resources.machinery if resources else None,
        project_type=project.project_type,
    )
    scheme = scheme_engine.recommend(repo.schemes(db), project.project_type, project.name)

    risk_record = repo.risk_by_location(db).get(project.area)
    site = repo.site_by_id(db, project.site_id) if project.site_id else None

    return {
        "project": project_to_dict(project),
        "cost": cost.as_dict(),
        "timeline": timeline.as_dict(),
        "scheme": scheme.as_dict(),
        "dataset_scheme": (
            project.scheme_recommendations[0].scheme_name if project.scheme_recommendations else None
        ),
        "risks": [
            {
                "risk_type": r.risk_type,
                "level": r.level,
                "score": r.score,
                "rationale": r.rationale,
            }
            for r in project.risks
        ],
        "climate_risk_location": risk_record.location if risk_record else None,
        "site": {"id": site.id, "name": site.name, "latitude": site.latitude, "longitude": site.longitude}
        if site
        else None,
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Cost and timeline are planning-level model outputs requiring a detailed engineering "
            "DPR before tender.",
        ],
    }


def scheme_catalogue(db: Session) -> dict[str, Any]:
    rows = repo.schemes(db)
    mappings = repo.scheme_recommendations(db)
    return {
        "schemes": [
            {
                "id": s.id,
                "scheme_name": s.scheme_name,
                "short_name": s.short_name,
                "ministry": s.ministry,
                "description": s.description,
                "eligible_project_types": [
                    t.strip() for t in (s.eligible_project_types or "").split(";") if t.strip()
                ],
                "source_url": s.source_url,
                "verification_status": s.verification_status,
            }
            for s in rows
        ],
        "recommendations": [
            {
                "area": m.area,
                "proposed_project": m.proposed_project,
                "scheme_name": m.scheme_name,
                "reason": m.reason,
                "match_confidence": m.match_confidence,
                "project_id": m.project_id,
                "verification_status": m.verification_status,
                "is_demo_data": m.is_demo_data,
            }
            for m in mappings
        ],
        "data_status": DataStatus.DERIVED,
        "notes": [
            "The scheme engine may only select from this reference table. A language model is "
            "never allowed to name a scheme.",
            "Portal URLs are indicative and marked pending verification.",
        ],
    }
