"""Demand / Population Engine.

Turns population estimates and projections into a demand signal the other
engines can weigh, plus the growth arithmetic the frontend charts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines import normalize as nz
from app.models.spatial import PopulationData

BASE_YEAR = 2026
HORIZON_YEAR = 2045


@dataclass
class DemandResult:
    location: str
    population_2026: int
    projected_2045: int
    growth_pct: float
    cagr_pct: float
    growth_priority: str
    demand_score: float
    series: list[dict[str, int]] = field(default_factory=list)
    explanation: str = ""
    data_status: str = DataStatus.DEMO
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "location": self.location,
            "population_2026": self.population_2026,
            "projected_2045": self.projected_2045,
            "growth_pct": round(self.growth_pct, 1),
            "cagr_pct": round(self.cagr_pct, 2),
            "growth_priority": self.growth_priority,
            "demand_score": round(self.demand_score, 1),
            "series": self.series,
            "explanation": self.explanation,
            "data_status": self.data_status,
            "notes": self.notes,
        }


def analyse(record: PopulationData) -> DemandResult:
    base = record.population_2026
    horizon = record.projected_2045
    growth_pct = ((horizon - base) / base) * 100.0 if base else 0.0
    years = HORIZON_YEAR - BASE_YEAR
    cagr = (((horizon / base) ** (1 / years)) - 1) * 100.0 if base and years else 0.0

    size_score = nz.scale(base, 50_000, 320_000)
    growth_score = nz.scale(growth_pct, 10.0, 100.0)
    priority_score = nz.growth_priority_score(record.growth_priority)
    demand_score = 0.4 * size_score + 0.35 * growth_score + 0.25 * priority_score

    result = DemandResult(
        location=record.location,
        population_2026=base,
        projected_2045=horizon,
        growth_pct=growth_pct,
        cagr_pct=cagr,
        growth_priority=record.growth_priority,
        demand_score=nz.clamp(demand_score),
        series=[
            {"year": 2026, "population": record.population_2026},
            {"year": 2030, "population": record.projected_2030},
            {"year": 2035, "population": record.projected_2035},
            {"year": 2045, "population": record.projected_2045},
        ],
        data_status=DataStatus.DEMO if record.is_demo_data else DataStatus.DERIVED,
    )
    result.explanation = (
        f"{record.location} is projected to grow {growth_pct:.0f}% between 2026 and 2045 "
        f"({cagr:.2f}% CAGR), from {base:,} to {horizon:,} residents, and is rated "
        f"{record.growth_priority} growth priority. Demand score {result.demand_score:.0f}/100."
    )
    if record.is_demo_data:
        result.notes.append(
            "Projections are realistic demonstration values inspired by Census and WorldPop "
            "patterns - not official ward-wise forecasts."
        )
    return result


def portfolio_summary(records: list[PopulationData]) -> dict[str, Any]:
    if not records:
        return {"locations": 0, "data_status": DataStatus.DEMO}

    totals = {
        "2026": sum(r.population_2026 for r in records),
        "2030": sum(r.projected_2030 for r in records),
        "2035": sum(r.projected_2035 for r in records),
        "2045": sum(r.projected_2045 for r in records),
    }
    analysed = sorted((analyse(r) for r in records), key=lambda d: d.growth_pct, reverse=True)
    distribution: dict[str, int] = {}
    for record in records:
        distribution[record.growth_priority] = distribution.get(record.growth_priority, 0) + 1

    return {
        "locations": len(records),
        "totals": totals,
        "overall_growth_pct": round(((totals["2045"] - totals["2026"]) / totals["2026"]) * 100.0, 1),
        "fastest_growing": [d.as_dict() for d in analysed[:5]],
        "slowest_growing": [d.as_dict() for d in analysed[-5:]],
        "growth_priority_distribution": distribution,
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Aggregated from the Population Growth Projection demonstration dataset.",
            "Replace with Census of India and WorldPop layers before real-world use.",
        ],
    }
