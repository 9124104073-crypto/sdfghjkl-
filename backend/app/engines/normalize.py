"""Normalisation helpers.

Every raw factor - categorical or continuous - is mapped onto a 0-100 scale
before it reaches a weighted-sum engine, so weights are comparable.
"""

from __future__ import annotations

from app.core.constants import (
    FLOOD_RISK_SAFETY_SCORE,
    GROWTH_PRIORITY_SCORE,
    RISK_LEVEL_SCORE,
    TERRAIN_SUITABILITY_SCORE,
    UTILITY_SCORE,
)


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def scale(value: float | None, lo: float, hi: float, invert: bool = False) -> float:
    """Linearly map ``value`` from [lo, hi] onto 0-100, clamped at both ends."""
    if value is None:
        return 50.0
    if hi == lo:
        return 50.0
    pct = (float(value) - lo) / (hi - lo)
    if invert:
        pct = 1.0 - pct
    return clamp(pct * 100.0)


def flood_safety_score(flood_risk: str | None) -> float:
    """Higher score = safer. Accepts source spellings such as 'Very Low'."""
    if not flood_risk:
        return 50.0
    return FLOOD_RISK_SAFETY_SCORE.get(flood_risk.strip(), 50.0)


def terrain_score(level: str | None) -> float:
    if not level:
        return 50.0
    return TERRAIN_SUITABILITY_SCORE.get(level.strip(), 50.0)


def utility_score(level: str | None) -> float:
    if not level:
        return 50.0
    return UTILITY_SCORE.get(level.strip(), 50.0)


def risk_level_score(level: str | None) -> float:
    """Higher score = more risk."""
    if not level:
        return 50.0
    return RISK_LEVEL_SCORE.get(level.strip(), 50.0)


def growth_priority_score(level: str | None) -> float:
    if not level:
        return 50.0
    return GROWTH_PRIORITY_SCORE.get(level.strip(), 50.0)


def risk_band(score: float) -> str:
    """Map a 0-100 risk score back onto the controlled risk vocabulary."""
    if score >= 85:
        return "Very High"
    if score >= 65:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def road_connectivity_from(distance_km: float | None, transit: str | None) -> str:
    """Derive the controlled road-connectivity level from source attributes."""
    d = distance_km if distance_km is not None else 1.0
    transit_text = (transit or "").lower()
    multimodal = sum(token in transit_text for token in ("metro", "rail", "bus", "mrts"))
    if d <= 0.35 and multimodal >= 2:
        return "Excellent"
    if d <= 0.6 and multimodal >= 1:
        return "Good"
    if d <= 0.6:
        return "Good"
    return "Poor"


def terrain_level_from(slope_deg: float | None, elevation_m: float | None) -> str:
    """Derive the controlled terrain level from slope and elevation."""
    slope = slope_deg if slope_deg is not None else 2.0
    elev = elevation_m if elevation_m is not None else 15.0
    if elev < 10:
        return "Low"
    if slope <= 1.5 and elev >= 18:
        return "Suitable"
    if slope <= 2.5 and elev >= 12:
        return "Moderate"
    return "Low"
