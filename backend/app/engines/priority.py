"""Infrastructure Priority Engine.

Re-ranks the project portfolio using configurable impact, urgency, population
benefit, risk, infrastructure-gap and feasibility weights. The published
impact score is one input, not the answer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines import normalize as nz
from app.engines.weights import DEFAULT_PRIORITY_WEIGHTS, resolve_weights
from app.models.planning import PriorityProject
from app.models.spatial import PopulationData, RiskAssessment

# Sectors whose works reduce life-safety exposure score higher on urgency.
URGENT_SECTORS = {
    "Flood Mitigation & Drainage": 95.0,
    "Healthcare": 90.0,
    "Water & Sanitation": 85.0,
    "Emergency Services": 88.0,
    "Education": 70.0,
    "Environment & Sustainability": 65.0,
    "Transport & Connectivity": 60.0,
    "Public Amenities": 45.0,
    "Housing": 70.0,
}

# Larger, more complex sectors are slower to deliver.
FEASIBILITY_BY_SECTOR = {
    "Public Amenities": 90.0,
    "Environment & Sustainability": 75.0,
    "Education": 78.0,
    "Water & Sanitation": 65.0,
    "Healthcare": 60.0,
    "Flood Mitigation & Drainage": 55.0,
    "Transport & Connectivity": 50.0,
    "Emergency Services": 70.0,
    "Housing": 45.0,
}


@dataclass
class PriorityRow:
    published_priority: int
    area: str
    project_name: str
    sector: str
    impact_score: float
    computed_score: float
    computed_rank: int
    factors: dict[str, float] = field(default_factory=dict)
    risk_level: str | None = None
    growth_priority: str | None = None
    project_id: int | None = None
    explanation: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "published_priority": self.published_priority,
            "computed_rank": self.computed_rank,
            "rank_change": self.published_priority - self.computed_rank,
            "area": self.area,
            "project": self.project_name,
            "sector": self.sector,
            "impact_score": self.impact_score,
            "computed_score": round(self.computed_score, 2),
            "factors": {k: round(v, 2) for k, v in self.factors.items()},
            "risk_level": self.risk_level,
            "growth_priority": self.growth_priority,
            "project_id": self.project_id,
            "explanation": self.explanation,
        }


def rank(
    projects: list[PriorityProject],
    risk_by_location: dict[str, RiskAssessment] | None = None,
    population_by_location: dict[str, PopulationData] | None = None,
    weights: dict[str, float] | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    resolved = resolve_weights(weights, DEFAULT_PRIORITY_WEIGHTS)
    risk_by_location = risk_by_location or {}
    population_by_location = population_by_location or {}

    rows: list[PriorityRow] = []
    for project in projects:
        risk_record = risk_by_location.get(project.area)
        population = population_by_location.get(project.area)

        impact = nz.clamp(project.impact_score)
        urgency = URGENT_SECTORS.get(project.sector, 60.0)
        feasibility = FEASIBILITY_BY_SECTOR.get(project.sector, 60.0)

        if population:
            growth = nz.growth_priority_score(population.growth_priority)
            size = nz.scale(population.population_2026, 50_000, 320_000)
            population_benefit = 0.55 * size + 0.45 * growth
        else:
            population_benefit = 55.0

        if risk_record:
            risk_score = nz.risk_level_score(risk_record.flood_vulnerability)
        else:
            risk_score = 50.0

        # A larger service gap is inferred from unmet urgency at low feasibility.
        gap = nz.clamp(0.6 * impact + 0.4 * (100.0 - feasibility))

        components = {
            "impact": impact,
            "urgency": urgency,
            "population_benefit": population_benefit,
            "risk": risk_score,
            "infrastructure_gap": gap,
            "feasibility": feasibility,
        }
        score = sum(components[k] * (w / 100.0) for k, w in resolved.items())

        rows.append(
            PriorityRow(
                published_priority=project.published_priority,
                area=project.area,
                project_name=project.project_name,
                sector=project.sector,
                impact_score=project.impact_score,
                computed_score=nz.clamp(score),
                computed_rank=0,
                factors=components,
                risk_level=risk_record.flood_vulnerability if risk_record else None,
                growth_priority=population.growth_priority if population else None,
                project_id=project.project_id,
            )
        )

    rows.sort(key=lambda r: r.computed_score, reverse=True)
    for index, row in enumerate(rows):
        row.computed_rank = index + 1
        top_factor = max(row.factors, key=lambda k: row.factors[k] * resolved.get(k, 0))
        row.explanation = (
            f"{row.project_name} in {row.area} scores {row.computed_score:.1f} under the current "
            f"weighting, driven mainly by {top_factor.replace('_', ' ')} "
            f"({row.factors[top_factor]:.0f}/100)."
        )

    sectors: dict[str, list[float]] = {}
    for row in rows:
        sectors.setdefault(row.sector, []).append(row.impact_score)

    result_rows = rows[:limit] if limit else rows
    return {
        "weights": {k: round(v, 2) for k, v in resolved.items()},
        "projects_ranked": len(rows),
        "results": [r.as_dict() for r in result_rows],
        "sector_summary": [
            {
                "sector": sector,
                "count": len(scores),
                "average_impact": round(sum(scores) / len(scores), 1),
            }
            for sector, scores in sorted(sectors.items(), key=lambda kv: -len(kv[1]))
        ],
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Published impact scores are demonstration values from the Infrastructure "
            "Priority Ranking dataset and do not represent an official government priority list.",
        ],
    }
