"""Risk Engine.

Rule-based, and labelled as such. NIRMAN AI does not claim predictive flood
forecasting: these are transparent classifications over the supplied
indicators, plus a live-sensor overlay when IoT data exists for a location.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines import normalize as nz
from app.models.spatial import RiskAssessment, Site

RISK_COMPONENT_WEIGHTS: dict[str, float] = {
    "flood": 40.0,
    "terrain": 25.0,
    "accessibility": 20.0,
    "construction_delay": 15.0,
}


@dataclass
class RiskComponent:
    name: str
    label: str
    level: str
    score: float
    weight: float
    contribution: float
    rationale: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "level": self.level,
            "score": round(self.score, 1),
            "weight": self.weight,
            "contribution": round(self.contribution, 2),
            "rationale": self.rationale,
        }


@dataclass
class RiskResult:
    location: str
    overall_score: float
    overall_level: str
    components: list[RiskComponent] = field(default_factory=list)
    annual_rainfall_mm: int | None = None
    method: str = "rule_based"
    data_status: str = DataStatus.DEMO
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "location": self.location,
            "overall_score": round(self.overall_score, 1),
            "overall_level": self.overall_level,
            "components": [c.as_dict() for c in self.components],
            "annual_rainfall_mm": self.annual_rainfall_mm,
            "method": self.method,
            "data_status": self.data_status,
            "notes": self.notes,
        }


def assess(record: RiskAssessment) -> RiskResult:
    """Classify one locality from its published risk indicators."""
    components = [
        RiskComponent(
            name="flood",
            label="Flood vulnerability",
            level=record.flood_vulnerability,
            score=nz.risk_level_score(record.flood_vulnerability),
            weight=RISK_COMPONENT_WEIGHTS["flood"],
            contribution=0.0,
            rationale=f"Flood vulnerability rated {record.flood_vulnerability}"
            + (f" with {record.annual_rainfall_mm} mm annual rainfall." if record.annual_rainfall_mm else "."),
        ),
        RiskComponent(
            name="terrain",
            label="Terrain risk",
            level=_invert_level(record.terrain_suitability),
            # Terrain *suitability* is inverted to become terrain *risk*.
            score=100.0 - nz.terrain_score(record.terrain_suitability),
            weight=RISK_COMPONENT_WEIGHTS["terrain"],
            contribution=0.0,
            rationale=f"Terrain suitability rated {record.terrain_suitability}; "
            "low suitability indicates marshland or low elevation.",
        ),
        RiskComponent(
            name="accessibility",
            label="Accessibility risk",
            level=record.accessibility_risk,
            score=nz.risk_level_score(record.accessibility_risk),
            weight=RISK_COMPONENT_WEIGHTS["accessibility"],
            contribution=0.0,
            rationale=f"Monsoon accessibility risk rated {record.accessibility_risk}.",
        ),
        RiskComponent(
            name="construction_delay",
            label="Construction delay risk",
            level=record.construction_delay_risk,
            score=nz.risk_level_score(record.construction_delay_risk),
            weight=RISK_COMPONENT_WEIGHTS["construction_delay"],
            contribution=0.0,
            rationale=f"Construction delay risk rated {record.construction_delay_risk}.",
        ),
    ]

    overall = 0.0
    for component in components:
        component.contribution = component.score * (component.weight / 100.0)
        overall += component.contribution

    result = RiskResult(
        location=record.location,
        overall_score=nz.clamp(overall),
        overall_level=nz.risk_band(overall),
        components=components,
        annual_rainfall_mm=record.annual_rainfall_mm,
        data_status=DataStatus.DEMO if record.is_demo_data else DataStatus.DERIVED,
    )
    result.notes.append(
        "Rule-based classification over supplied indicators. No validated predictive "
        "flood model is in use; this is not a flood forecast."
    )
    if record.is_demo_data:
        result.notes.append("Demonstration data - requires validation before real-world use.")
    return result


def assess_site(site: Site) -> RiskResult:
    """Fallback classification for a site with no matching risk record."""
    flood_level = site.flood_risk or "Medium"
    terrain_level = site.terrain_suitability or nz.terrain_level_from(site.slope_deg, site.elevation_m)
    synthetic = RiskAssessment(
        location=site.name,
        flood_vulnerability=flood_level,
        annual_rainfall_mm=None,
        terrain_suitability=terrain_level,
        accessibility_risk="Low" if (site.distance_major_road_km or 1.0) <= 0.5 else "Medium",
        construction_delay_risk=flood_level,
        is_demo_data=site.is_demo_data,
    )
    result = assess(synthetic)
    result.notes.insert(
        0, "No climate-risk record matched this locality; classified from site attributes instead."
    )
    return result


def _invert_level(suitability: str) -> str:
    return {"High": "Low", "Medium": "Medium", "Moderate": "Medium", "Low": "High"}.get(
        (suitability or "").strip(), "Medium"
    )


def sensor_status(value: float, warning: float | None, critical: float | None) -> str:
    """Threshold rule shared by the IoT ingest path and the dashboard."""
    if critical is not None and value >= critical:
        return "CRITICAL"
    if warning is not None and value >= warning:
        return "WARNING"
    return "NORMAL"


def sensor_trend(values: list[float]) -> str:
    """Coarse trend over the recent window - rising, falling or steady."""
    if len(values) < 2:
        return "steady"
    delta = values[-1] - values[0]
    span = max(abs(values[0]), 1e-6)
    if delta / span > 0.05:
        return "rising"
    if delta / span < -0.05:
        return "falling"
    return "steady"
