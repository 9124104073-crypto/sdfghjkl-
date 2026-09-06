"""Weight profiles and validation.

Weights are always supplied as a mapping of factor -> percentage. They are
validated to sum to 100 (within tolerance) and then normalised so the engines
never depend on the caller getting the arithmetic exactly right.
"""

from __future__ import annotations

WEIGHT_SUM_TOLERANCE = 0.5

# Site suitability - the nine factors named in the build plan.
DEFAULT_SITE_WEIGHTS: dict[str, float] = {
    "population_coverage": 20.0,
    "accessibility": 15.0,
    "flood_safety": 15.0,
    "land_suitability": 12.0,
    "infrastructure_gap": 12.0,
    "terrain": 10.0,
    "water_availability": 6.0,
    "electricity_availability": 5.0,
    "existing_facility_distance": 5.0,
}

# Published Chennai MCDA profile (30/20/20/15/15).
MCDA_WEIGHTS: dict[str, float] = {
    "population_coverage": 30.0,
    "accessibility": 20.0,
    "flood_safety": 20.0,
    "land_suitability": 15.0,
    "infrastructure_readiness": 15.0,
}

# What-If Simulator parameters.
DEFAULT_WHAT_IF_WEIGHTS: dict[str, float] = {
    "budget": 20.0,
    "accessibility": 20.0,
    "flood_safety": 20.0,
    "population_coverage": 20.0,
    "sustainability": 20.0,
}

# Priority ranking factors.
DEFAULT_PRIORITY_WEIGHTS: dict[str, float] = {
    "impact": 35.0,
    "urgency": 20.0,
    "population_benefit": 20.0,
    "risk": 10.0,
    "infrastructure_gap": 10.0,
    "feasibility": 5.0,
}


class InvalidWeightsError(ValueError):
    """Raised when a caller supplies weights the engine cannot use."""


def validate_weights(weights: dict[str, float], allowed: set[str]) -> dict[str, float]:
    """Validate keys, ranges and total, then normalise to sum to exactly 100."""
    if not weights:
        raise InvalidWeightsError("At least one weight must be supplied.")

    unknown = set(weights) - allowed
    if unknown:
        raise InvalidWeightsError(
            f"Unknown weight keys: {sorted(unknown)}. Allowed: {sorted(allowed)}"
        )

    for key, value in weights.items():
        if value < 0 or value > 100:
            raise InvalidWeightsError(f"Weight '{key}' must be between 0 and 100 (got {value}).")

    total = sum(weights.values())
    if total <= 0:
        raise InvalidWeightsError("Weights must not sum to zero.")
    if abs(total - 100.0) > WEIGHT_SUM_TOLERANCE:
        raise InvalidWeightsError(f"Weights must total 100% (got {total:.2f}%).")

    # Normalise away the tolerance so contributions add up exactly.
    return {key: (value / total) * 100.0 for key, value in weights.items()}


def resolve_weights(
    supplied: dict[str, float] | None, defaults: dict[str, float]
) -> dict[str, float]:
    """Use caller weights when given, otherwise the profile defaults."""
    if not supplied:
        return dict(defaults)
    return validate_weights(supplied, set(defaults))
