"""Site Suitability Engine.

Deterministic weighted MCDA over normalised 0-100 factors. This is the core of
NIRMAN AI and runs with no LLM involved: a language model may later *explain*
these numbers, but it must never produce them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines import normalize as nz
from app.engines.weights import DEFAULT_SITE_WEIGHTS, resolve_weights
from app.models.spatial import Site

# Recommendation tiers, per the NIRMAN AI build plan.
TIER_RECOMMENDED = 83.0
TIER_CONSIDER = 75.0
TIER_FURTHER_ASSESSMENT = 70.0

# Indicative plot area a facility class needs, in acres. Land availability is
# scored against the requirement rather than a fixed acreage, so a compact
# 4-acre central plot is not treated as inadequate for a health centre.
LAND_REQUIREMENT_ACRES: dict[str, float] = {
    "Hospital": 4.0,
    "Health Centre": 1.2,
    "School": 2.5,
    "Fire Station": 1.5,
    "Water Facility": 2.0,
    "Road": 1.0,
    "Community Centre": 1.0,
    "Other": 2.0,
}

# Facility class each infrastructure type draws its service-gap signal from.
INFRA_GAP_BASIS: dict[str, str] = {
    "Hospital": "hospitals",
    "Health Centre": "hospitals",
    "Fire Station": "hospitals",
    "Community Centre": "schools",
    "School": "schools",
    "Water Facility": "utilities",
    "Road": "accessibility",
    "Other": "hospitals",
}


@dataclass
class FactorContribution:
    name: str
    label: str
    raw_value: Any
    normalized: float
    weight: float
    contribution: float
    direction: str  # positive | negative | neutral
    rationale: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "label": self.label,
            "raw_value": self.raw_value,
            "normalized": round(self.normalized, 2),
            "weight": round(self.weight, 2),
            "contribution": round(self.contribution, 2),
            "direction": self.direction,
            "rationale": self.rationale,
        }


@dataclass
class SuitabilityResult:
    site_id: int
    site_code: str
    site_name: str
    infrastructure_type: str
    score: float
    confidence: float
    recommendation: str
    factors: list[FactorContribution] = field(default_factory=list)
    weights: dict[str, float] = field(default_factory=dict)
    explanation: str = ""
    data_status: str = DataStatus.DERIVED
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "site_id": self.site_id,
            "site_code": self.site_code,
            "site_name": self.site_name,
            "infrastructure_type": self.infrastructure_type,
            "score": round(self.score, 2),
            "confidence": round(self.confidence, 1),
            "recommendation": self.recommendation,
            "factors": [f.as_dict() for f in self.factors],
            "weights": {k: round(v, 2) for k, v in self.weights.items()},
            "explanation": self.explanation,
            "data_status": self.data_status,
            "notes": self.notes,
        }


def recommendation_tier(score: float) -> str:
    if score >= TIER_RECOMMENDED:
        return "Recommended"
    if score >= TIER_CONSIDER:
        return "Consider"
    if score >= TIER_FURTHER_ASSESSMENT:
        return "Further Assessment Required"
    return "Not Recommended"


def _population_coverage(site: Site) -> tuple[float, str]:
    catchment = nz.scale(site.population_catchment_5km, 50_000, 200_000)
    density = nz.scale(site.population_density, 5_000, 28_000)
    value = 0.6 * catchment + 0.4 * density
    text = (
        f"{site.population_catchment_5km:,} residents within 5 km at "
        f"{site.population_density:,}/km2"
        if site.population_catchment_5km and site.population_density
        else "Population profile incomplete; treated as mid-range."
    )
    return value, text


def _infrastructure_gap(site: Site, infrastructure_type: str) -> tuple[float, str]:
    """Higher score = larger unmet need, which *raises* suitability."""
    if site.infrastructure_gap is not None:
        return nz.clamp(site.infrastructure_gap), "Service gap supplied by source dataset."

    basis = INFRA_GAP_BASIS.get(infrastructure_type, "hospitals")
    population = site.population_catchment_5km or 100_000
    per_100k = None

    if basis == "schools":
        facilities = site.existing_schools
        target = 12.0
    elif basis == "utilities":
        score = 100.0 - nz.utility_score(site.utility_infrastructure)
        return score, "Derived from utility-infrastructure rating."
    elif basis == "accessibility":
        score = nz.scale(site.distance_major_road_km, 0.2, 1.2)
        return score, "Derived from distance to the nearest major road."
    else:
        facilities = site.existing_hospitals
        target = 5.0

    if facilities is None:
        return 50.0, "No facility count available; treated as mid-range."

    per_100k = facilities / (population / 100_000)
    # Gap is high when facilities per 100k falls short of the target rate.
    score = nz.scale(per_100k, target * 1.6, 0.0)
    return score, f"{facilities} existing {basis} serve {population:,} residents ({per_100k:.1f} per 100k)."


def _existing_facility_distance(site: Site) -> tuple[float, str]:
    """A site far from the nearest comparable facility scores higher."""
    if site.existing_hospital_distance_km is not None:
        return (
            nz.scale(site.existing_hospital_distance_km, 0.5, 8.0),
            f"Nearest comparable facility {site.existing_hospital_distance_km} km away.",
        )
    facilities = site.existing_hospitals
    if facilities is None:
        return 50.0, "Existing-facility distance not available; treated as mid-range."
    score = nz.scale(facilities, 9, 2)
    return score, f"{facilities} comparable facilities already operate in the catchment."


class Calibration:
    """Portfolio-relative normalisation for the continuous factors.

    Site selection is a comparative exercise: "best available location for this
    facility", not "does this location clear an absolute bar". Categorical
    factors (flood risk, terrain, utilities) keep their absolute ordinal scores
    because those have real-world meaning on their own. Continuous factors are
    stretched across the observed range of the assessed candidate set, which is
    standard MCDA practice and keeps scores spread across the recommendation
    tiers instead of bunching in the middle.

    A factor whose values barely vary is left on its absolute scale, so a
    near-uniform attribute is never amplified into a false differentiator.
    """

    CONTINUOUS = (
        "population_coverage",
        "accessibility",
        "land_suitability",
        "infrastructure_gap",
        "existing_facility_distance",
    )
    MIN_SPREAD = 12.0
    # Calibrated factors land in this band rather than a raw 0-100 stretch, so
    # the weakest candidate in a strong field is not driven to zero.
    FLOOR = 25.0
    CEILING = 98.0

    def __init__(self, bounds: dict[str, tuple[float, float]] | None = None) -> None:
        self._bounds = bounds or {}

    @classmethod
    def from_sites(cls, sites: list[Site], infrastructure_type: str) -> "Calibration":
        if len(sites) < 5:
            return cls()
        collected: dict[str, list[float]] = {key: [] for key in cls.CONTINUOUS}
        for site in sites:
            for key, value in _absolute_factors(site, infrastructure_type).items():
                if key in collected:
                    collected[key].append(value[2])
        bounds = {}
        for key, values in collected.items():
            if not values:
                continue
            low, high = min(values), max(values)
            if high - low >= cls.MIN_SPREAD:
                bounds[key] = (low, high)
        return cls(bounds)

    def apply(self, key: str, value: float) -> float:
        bounds = self._bounds.get(key)
        if bounds is None:
            return value
        low, high = bounds
        pct = (value - low) / (high - low)
        return nz.clamp(self.FLOOR + pct * (self.CEILING - self.FLOOR))

    @property
    def calibrated_factors(self) -> list[str]:
        return sorted(self._bounds)


def _absolute_factors(
    site: Site, infrastructure_type: str
) -> dict[str, tuple[str, Any, float, str]]:
    """Raw, uncalibrated 0-100 score per factor: (label, raw, score, rationale)."""
    pop_value, pop_text = _population_coverage(site)
    gap_value, gap_text = _infrastructure_gap(site, infrastructure_type)
    dist_value, dist_text = _existing_facility_distance(site)

    access_value = (
        site.access_score
        if site.access_score is not None
        else 0.6 * nz.scale(site.distance_major_road_km, 0.2, 1.2, invert=True)
        + 0.4 * (90.0 if site.transit_access else 50.0)
    )
    access_text = (
        f"{site.transit_access}; {site.distance_major_road_km} km to a major road"
        if site.transit_access
        else "Transit profile incomplete."
    )

    flood_value = nz.flood_safety_score(site.flood_risk)
    terrain_level = site.terrain_suitability or nz.terrain_level_from(site.slope_deg, site.elevation_m)
    terrain_value = nz.terrain_score(terrain_level)

    # Land is scored as available acres relative to what this facility needs:
    # meeting the requirement scores well, comfortably exceeding it scores full.
    required = LAND_REQUIREMENT_ACRES.get(infrastructure_type, LAND_REQUIREMENT_ACRES["Other"])
    land_ratio = (site.land_available_acres / required) if site.land_available_acres else None
    land_value = nz.scale(land_ratio, 0.35, 1.6)
    land_text = (
        f"{site.land_available_acres} acres available against an indicative "
        f"{required} acre requirement for a {infrastructure_type.lower()}; land use {site.land_use}."
        if site.land_available_acres
        else "Land availability not recorded; treated as mid-range."
    )
    water_value = nz.utility_score(site.water_availability)
    power_value = nz.utility_score(site.electricity_availability)

    return {
        "population_coverage": ("Population coverage", site.population_catchment_5km, pop_value, pop_text),
        "accessibility": ("Accessibility", site.transit_access, access_value, access_text),
        "flood_safety": ("Flood safety", site.flood_risk, flood_value, f"Flood risk rated {site.flood_risk}."),
        "land_suitability": ("Land availability", site.land_available_acres, land_value, land_text),
        "infrastructure_gap": ("Infrastructure gap", site.infrastructure_gap, gap_value, gap_text),
        "terrain": (
            "Terrain suitability",
            terrain_level,
            terrain_value,
            f"Elevation {site.elevation_m} m at {site.slope_deg} deg slope -> {terrain_level}.",
        ),
        "water_availability": (
            "Water availability",
            site.water_availability,
            water_value,
            f"Water availability rated {site.water_availability}.",
        ),
        "electricity_availability": (
            "Electricity availability",
            site.electricity_availability,
            power_value,
            f"Power availability rated {site.electricity_availability}.",
        ),
        "existing_facility_distance": (
            "Distance from existing facilities",
            site.existing_hospitals,
            dist_value,
            dist_text,
        ),
    }


def evaluate_site(
    site: Site,
    infrastructure_type: str = "Hospital",
    weights: dict[str, float] | None = None,
    calibration: Calibration | None = None,
) -> SuitabilityResult:
    """Score one candidate site for one infrastructure type."""
    resolved = resolve_weights(weights, DEFAULT_SITE_WEIGHTS)
    calibration = calibration or Calibration()
    definitions = _absolute_factors(site, infrastructure_type)

    factors: list[FactorContribution] = []
    score = 0.0
    for key, weight in resolved.items():
        label, raw, absolute, rationale = definitions[key]
        normalized = calibration.apply(key, absolute)
        contribution = normalized * (weight / 100.0)
        score += contribution
        factors.append(
            FactorContribution(
                name=key,
                label=label,
                raw_value=raw,
                normalized=normalized,
                weight=weight,
                contribution=contribution,
                direction="positive" if normalized >= 65 else "negative" if normalized < 45 else "neutral",
                rationale=rationale,
            )
        )

    score = nz.clamp(score)
    confidence = _confidence(site, factors)
    result = SuitabilityResult(
        site_id=site.id,
        site_code=site.site_code,
        site_name=site.name,
        infrastructure_type=infrastructure_type,
        score=score,
        confidence=confidence,
        recommendation=recommendation_tier(score),
        factors=sorted(factors, key=lambda f: f.contribution, reverse=True),
        weights=resolved,
        data_status=DataStatus.DERIVED if not site.is_demo_data else DataStatus.DEMO,
    )
    result.explanation = build_explanation(result)
    if calibration.calibrated_factors:
        result.notes.append(
            "Continuous factors ("
            + ", ".join(f.replace("_", " ") for f in calibration.calibrated_factors)
            + ") are scored relative to the assessed candidate set; categorical factors "
            "(flood risk, terrain, utilities) use absolute ratings."
        )
    if site.is_demo_data:
        result.notes.append(
            "Computed from demonstration data - requires validation before real-world use."
        )
    return result


def _confidence(site: Site, factors: list[FactorContribution]) -> float:
    """Confidence reflects input completeness, not how good the site is."""
    tracked = [
        site.population_catchment_5km,
        site.population_density,
        site.distance_major_road_km,
        site.transit_access,
        site.flood_risk,
        site.elevation_m,
        site.slope_deg,
        site.land_available_acres,
        site.water_availability,
        site.electricity_availability,
    ]
    completeness = sum(1 for v in tracked if v is not None) / len(tracked)
    # Wide disagreement between factors means the site is a harder call.
    spread = max(f.normalized for f in factors) - min(f.normalized for f in factors)
    dispersion_penalty = nz.clamp(spread, 0, 100) * 0.12
    return round(nz.clamp(55.0 + completeness * 45.0 - dispersion_penalty, 40.0, 99.0), 1)


def build_explanation(result: SuitabilityResult) -> str:
    """Plain-language decision-support summary. Never prescriptive."""
    positives = [f for f in result.factors if f.direction == "positive"][:3]
    negatives = [f for f in result.factors if f.direction == "negative"][:2]

    parts = [
        f"{result.site_name} scores {result.score:.1f}/100 for a "
        f"{result.infrastructure_type.lower()} under the current weighting, "
        f"placing it in the '{result.recommendation}' band."
    ]
    if positives:
        joined = ", ".join(f"{f.label.lower()} ({f.normalized:.0f}/100)" for f in positives)
        parts.append(f"Strongest supporting factors: {joined}.")
    if negatives:
        joined = ", ".join(f"{f.label.lower()} ({f.normalized:.0f}/100)" for f in negatives)
        parts.append(f"Factors working against the site: {joined}.")
    parts.append(
        "This is planning-level decision support; site selection remains subject to "
        "survey, engineering assessment and statutory approval."
    )
    return " ".join(parts)


def rank_sites(
    sites: list[Site],
    infrastructure_type: str = "Hospital",
    weights: dict[str, float] | None = None,
    limit: int | None = None,
    calibration: Calibration | None = None,
) -> list[SuitabilityResult]:
    calibration = calibration or Calibration.from_sites(sites, infrastructure_type)
    results = [evaluate_site(s, infrastructure_type, weights, calibration) for s in sites]
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit] if limit else results
