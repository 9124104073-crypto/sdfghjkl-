"""Cost & Timeline Engine.

Planning-level estimates only. Every output carries a range, its assumptions
and a confidence value, and is never described as an approved government cost.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines import normalize as nz

# Indicative base rates in Rs crore, by project type, for a nominal unit of
# scale. Demonstration values for portfolio comparison only.
BASE_RATE_CR: dict[str, float] = {
    "Hospital": 120.0,
    "Hospital Expansion": 95.0,
    "Health Centre": 17.0,
    "Community Health Centre": 20.0,
    "School": 25.0,
    "Anganwadi": 5.0,
    "Skill Centre": 18.0,
    "Digital Infrastructure": 9.0,
    "Road": 38.0,
    "Bridge": 80.0,
    "Railway Over Bridge": 110.0,
    "Airport Link Road": 85.0,
    "Metro Access Road": 35.0,
    "Heritage Road": 14.0,
    "Drainage": 18.0,
    "Sewerage": 55.0,
    "Water Supply": 15.0,
    "Water Tank": 10.0,
    "Reservoir": 45.0,
    "Desalination Support": 180.0,
    "Sanitation": 5.0,
    "Solid Waste": 32.0,
    "Housing": 160.0,
    "Coastal Infrastructure": 92.0,
    "Sea Wall": 88.0,
    "Fishing Harbour": 60.0,
    "Disaster Shelter": 18.0,
    "Transit Facility": 30.0,
    "Smart Infrastructure": 8.0,
    "Environmental Monitoring": 6.0,
    "Public Amenity": 12.0,
    "Renewable Energy": 10.0,
    "Other": 25.0,
}

# Risk drives the contingency band, not the base estimate.
CONTINGENCY_BY_RISK = {"Low": 8.0, "Medium": 12.0, "High": 18.0, "Very High": 24.0}

SCALE_MULTIPLIER = {"small": 0.6, "standard": 1.0, "large": 1.6}


@dataclass
class CostEstimate:
    project_type: str
    scale: str
    estimate_cr: float
    low_cr: float
    high_cr: float
    contingency_pct: float
    breakdown: dict[str, float] = field(default_factory=dict)
    assumptions: list[str] = field(default_factory=list)
    confidence: float = 60.0
    data_status: str = DataStatus.DERIVED
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "project_type": self.project_type,
            "scale": self.scale,
            "estimate_cr": round(self.estimate_cr, 2),
            "range_cr": [round(self.low_cr, 2), round(self.high_cr, 2)],
            "contingency_pct": self.contingency_pct,
            "breakdown_cr": {k: round(v, 2) for k, v in self.breakdown.items()},
            "assumptions": self.assumptions,
            "confidence": self.confidence,
            "data_status": self.data_status,
            "notes": self.notes,
        }


@dataclass
class TimelinePlan:
    total_months: int
    peak_labour: int
    machinery: list[str]
    phases: list[dict[str, Any]] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    data_status: str = DataStatus.DERIVED

    def as_dict(self) -> dict[str, Any]:
        return {
            "total_months": self.total_months,
            "peak_labour": self.peak_labour,
            "machinery": self.machinery,
            "phases": self.phases,
            "assumptions": self.assumptions,
            "data_status": self.data_status,
        }


def estimate_cost(
    project_type: str,
    scale: str = "standard",
    risk_level: str = "Medium",
    labour: int | None = None,
    machinery: str | None = None,
    known_budget_cr: float | None = None,
) -> CostEstimate:
    """Produce a planning-level cost estimate with an explicit range."""
    scale = scale if scale in SCALE_MULTIPLIER else "standard"
    base = BASE_RATE_CR.get(project_type, BASE_RATE_CR["Other"])
    contingency = CONTINGENCY_BY_RISK.get(risk_level, 12.0)

    spread = contingency / 100.0

    if known_budget_cr is not None:
        # A dataset budget is treated as the all-in total: the engine splits it
        # into components and supplies the uncertainty band around it, rather
        # than inflating a figure that already represents the whole project.
        total = float(known_budget_cr)
        source_note = (
            "Anchored on the portfolio dataset budget for this project, which is treated as the "
            "all-in total and decomposed into indicative components."
        )
        confidence = 68.0
    else:
        estimate = base * SCALE_MULTIPLIER[scale]
        if labour:
            # Labour-heavy works carry more schedule and wage exposure. This
            # only applies to derived estimates - an anchored budget already
            # reflects the project's actual labour plan.
            estimate *= 1.0 + nz.clamp(labour - 100, 0, 150) / 1000.0
        total = estimate * (1.0 + spread)
        source_note = f"Derived from the indicative base rate for '{project_type}' works."
        confidence = 52.0

    # Component shares partition the total exactly, contingency included.
    contingency_share = spread / (1.0 + spread)
    works_share = 1.0 - contingency_share
    breakdown = {
        "civil_works": total * works_share * 0.56,
        "labour": total * works_share * 0.20,
        "machinery": total * works_share * 0.13,
        "materials_and_utilities": total * works_share * 0.11,
        "contingency": total * contingency_share,
    }

    assumptions = [
        source_note,
        f"{contingency:.0f}% contingency applied for a '{risk_level}' risk classification.",
        "Region-adjusted demonstration cost norms; no tender or schedule-of-rates input.",
        "Excludes land acquisition, rehabilitation, statutory fees and price escalation.",
    ]
    if machinery:
        assumptions.append(f"Assumes availability of: {machinery}.")

    return CostEstimate(
        project_type=project_type,
        scale=scale,
        estimate_cr=total,
        low_cr=total * (1.0 - spread),
        high_cr=total * (1.0 + spread * 1.6),
        contingency_pct=contingency,
        breakdown=breakdown,
        assumptions=assumptions,
        confidence=confidence,
        data_status=DataStatus.DERIVED,
        notes=[
            "Planning-level decision support only. This is not an approved government "
            "cost and must be reconciled through a detailed engineering DPR before tender.",
        ],
    )


def plan_timeline(
    total_months: int,
    peak_labour: int,
    machinery: str | None = None,
    project_type: str = "Other",
) -> TimelinePlan:
    """Split a duration into standard construction phases."""
    machinery_list = [m.strip() for m in (machinery or "").split(";") if m.strip()]

    # Phase shares sum to 1.0; mobilisation and closeout are fixed-ish.
    shares = [
        ("Survey, design and clearances", 0.18, 0.15),
        ("Mobilisation and site establishment", 0.10, 0.45),
        ("Main construction", 0.52, 1.00),
        ("Services, finishing and testing", 0.14, 0.60),
        ("Commissioning and handover", 0.06, 0.25),
    ]

    phases: list[dict[str, Any]] = []
    elapsed = 0.0
    for name, share, labour_share in shares:
        months = max(1, round(total_months * share))
        phases.append(
            {
                "phase": name,
                "start_month": round(elapsed, 1) + 1,
                "duration_months": months,
                "labour": int(peak_labour * labour_share),
            }
        )
        elapsed += months

    band = (
        "Fast-track (<= 10 months)"
        if total_months <= 10
        else "Standard (11-18 months)"
        if total_months <= 18
        else "Long-gestation (19-24 months)"
    )

    return TimelinePlan(
        total_months=total_months,
        peak_labour=peak_labour,
        machinery=machinery_list,
        phases=phases,
        assumptions=[
            f"Execution band: {band}.",
            "Assumes uninterrupted clearances and no monsoon shutdown beyond normal allowance.",
            "Phase durations are proportional model outputs, not a contractor-agreed programme.",
            f"Peak labour of {peak_labour} is reached during main construction.",
        ],
    )
