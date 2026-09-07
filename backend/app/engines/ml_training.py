"""Training-set construction for the site-scoring model.

The honest problem with fitting on the 40 published scores is that 40 rows
cannot support a model that generalises — cross-validation on that set measures
how well a tree memorises a small table.

So the model is trained as a **surrogate of the decision engine** instead. The
MCDA engine is a real, well-defined, deterministic function of a site's
attributes and a weight vector. Sampling that function densely gives thousands
of exactly-labelled rows, and a model fitted to them genuinely generalises
*over the engine's input space* — which is a claim that can be tested and is
worth something, unlike a claim about Chennai learned from 40 rows.

What the surrogate is for:

* SHAP over it explains the engine's global behaviour — which attributes move
  a score, across the whole weight space, not just at the default weighting.
* It answers "what would the engine say" for attribute combinations that do
  not appear in the seed data.

What it is not: a predictor of real-world suitability. It reproduces the
engine, and the engine is a planning heuristic over demonstration data.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.engines import normalize as nz
from app.engines.suitability import Calibration, evaluate_site
from app.engines.weights import DEFAULT_SITE_WEIGHTS
from app.models.spatial import Site

log = logging.getLogger(__name__)

# Attribute jitter keeps the sampled sites realistic while covering ground the
# 40 seed localities leave empty.
JITTER = {
    "population_catchment_5km": (0.55, 1.5),
    "population_density": (0.55, 1.5),
    "existing_hospitals": (0.4, 1.8),
    "existing_schools": (0.4, 1.8),
    "distance_major_road_km": (0.4, 2.2),
    "elevation_m": (0.5, 1.7),
    "slope_deg": (0.5, 1.8),
    "land_available_acres": (0.4, 2.0),
    "land_cost_cr_per_acre": (0.5, 1.7),
}

CATEGORICAL_POOLS = {
    "flood_risk": ["Very Low", "Low", "Moderate", "High", "Very High"],
    "water_availability": ["Medium", "High", "Excellent"],
    "electricity_availability": ["Medium", "High", "Excellent"],
    "utility_infrastructure": ["Medium", "High", "Excellent"],
}


@dataclass
class TrainingSet:
    X: Any
    y: Any
    feature_names: list[str]
    rows: int
    infrastructure_types: list[str]
    description: str


class _SyntheticSite:
    """A Site-shaped object the suitability engine can score directly.

    Not an ORM instance: the engine only reads attributes, so a plain carrier
    avoids polluting the session with throwaway rows.
    """

    __slots__ = (
        "id", "site_code", "name", "zone", "population_catchment_5km", "population_density",
        "existing_hospitals", "existing_schools", "existing_hospital_distance_km",
        "distance_major_road_km", "transit_access", "flood_risk", "elevation_m", "slope_deg",
        "land_use", "land_available_acres", "land_cost_cr_per_acre", "terrain_suitability",
        "utility_infrastructure", "water_availability", "electricity_availability",
        "internet_availability", "infrastructure_gap", "access_score", "is_demo_data",
    )

    def __init__(self, **kwargs):
        for slot in self.__slots__:
            setattr(self, slot, kwargs.get(slot))


def _sample_site(base: Site, rng, index: int) -> _SyntheticSite:
    values: dict[str, Any] = {
        "id": -index,
        "site_code": f"SYN-{index:05d}",
        "name": f"synthetic-{index}",
        "zone": base.zone,
        "transit_access": base.transit_access,
        "land_use": base.land_use,
        "internet_availability": base.internet_availability,
        "infrastructure_gap": None,
        "access_score": None,
        "is_demo_data": True,
        "existing_hospital_distance_km": None,
    }
    for field, (lo, hi) in JITTER.items():
        source = getattr(base, field)
        if source is None:
            values[field] = None
            continue
        scaled = float(source) * rng.uniform(lo, hi)
        values[field] = max(0.0, round(scaled, 3))

    for field, pool in CATEGORICAL_POOLS.items():
        # Mostly keep the real value; occasionally swap so the model sees the
        # full ordinal range rather than only what Chennai happens to contain.
        values[field] = rng.choice(pool) if rng.random() < 0.45 else getattr(base, field)

    values["existing_hospitals"] = int(round(values["existing_hospitals"] or 0))
    values["existing_schools"] = int(round(values["existing_schools"] or 0))
    values["population_catchment_5km"] = int(round(values["population_catchment_5km"] or 0))
    values["population_density"] = int(round(values["population_density"] or 0))
    values["terrain_suitability"] = nz.terrain_level_from(values["slope_deg"], values["elevation_m"])
    return _SyntheticSite(**values)


def _sample_weights(rng) -> dict[str, float]:
    """A random weight vector on the simplex, totalling 100."""
    raw = {k: rng.random() ** 1.4 + 0.02 for k in DEFAULT_SITE_WEIGHTS}
    total = sum(raw.values())
    return {k: (v / total) * 100.0 for k, v in raw.items()}


def build_training_set(
    sites: list[Site],
    infrastructure_types: list[str],
    samples: int = 4000,
    seed: int = 42,
) -> TrainingSet:
    """Sample the decision engine to produce an exactly-labelled training set.

    Each row is a (site attributes + weight vector + facility type) input and
    the engine's own score as the label — no noise, no proxy.
    """
    import random

    import numpy as np

    rng = random.Random(seed)
    base_sites = [s for s in sites if s.population_catchment_5km]
    if not base_sites:
        raise ValueError("No usable sites to sample from.")

    # Calibration must be fixed across the run, or identical inputs would get
    # different labels depending on which batch they landed in.
    calibrations = {t: Calibration.from_sites(sites, t) for t in infrastructure_types}

    weight_keys = list(DEFAULT_SITE_WEIGHTS)
    feature_names = [
        "population_catchment_5km", "population_density", "existing_hospitals",
        "existing_schools", "distance_major_road_km", "elevation_m", "slope_deg",
        "land_available_acres", "land_cost_cr_per_acre", "flood_safety_score",
        "terrain_score", "water_score", "power_score", "utility_score",
        # The engine's own intermediates. Without these the model has to
        # rediscover ratios it is being asked to reproduce exactly.
        "hospitals_per_100k", "schools_per_100k", "land_ratio",
    ] + [f"w_{k}" for k in weight_keys] + ["land_requirement_acres"]

    from app.engines.suitability import LAND_REQUIREMENT_ACRES

    rows: list[list[float]] = []
    labels: list[float] = []

    for i in range(samples):
        base = rng.choice(base_sites)
        infra = rng.choice(infrastructure_types)
        site = _sample_site(base, rng, i)
        weights = _sample_weights(rng)

        result = evaluate_site(site, infra, weights, calibrations[infra])

        rows.append(
            [
                float(site.population_catchment_5km or 0),
                float(site.population_density or 0),
                float(site.existing_hospitals or 0),
                float(site.existing_schools or 0),
                float(site.distance_major_road_km or 0),
                float(site.elevation_m or 0),
                float(site.slope_deg or 0),
                float(site.land_available_acres or 0),
                float(site.land_cost_cr_per_acre or 0),
                nz.flood_safety_score(site.flood_risk),
                nz.terrain_score(site.terrain_suitability),
                nz.utility_score(site.water_availability),
                nz.utility_score(site.electricity_availability),
                nz.utility_score(site.utility_infrastructure),
                (site.existing_hospitals or 0) / max((site.population_catchment_5km or 1) / 100_000, 1e-6),
                (site.existing_schools or 0) / max((site.population_catchment_5km or 1) / 100_000, 1e-6),
                (site.land_available_acres or 0)
                / LAND_REQUIREMENT_ACRES.get(infra, LAND_REQUIREMENT_ACRES["Other"]),
            ]
            + [weights[k] for k in weight_keys]
            + [LAND_REQUIREMENT_ACRES.get(infra, LAND_REQUIREMENT_ACRES["Other"])]
        )
        labels.append(float(result.score))

    return TrainingSet(
        X=np.array(rows, dtype=float),
        y=np.array(labels, dtype=float),
        feature_names=feature_names,
        rows=len(rows),
        infrastructure_types=list(infrastructure_types),
        description=(
            "Surrogate training set: site attributes and weight vectors sampled across the "
            "decision engine's input space, labelled with the engine's own deterministic score."
        ),
    )
