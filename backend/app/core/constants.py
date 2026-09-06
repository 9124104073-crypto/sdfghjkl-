"""Controlled vocabularies and shared decision-support constants."""

from __future__ import annotations

from enum import StrEnum


class DataStatus(StrEnum):
    """How a value in an API response came to exist."""

    DEMO = "demo"
    SOURCE = "source"
    DERIVED = "derived"
    AI_GENERATED = "ai_generated"


class VerificationStatus(StrEnum):
    UNVERIFIED = "unverified"
    DEMO = "demonstration"
    VERIFIED = "verified"
    PENDING = "pending_verification"


FLOOD_RISK_LEVELS = ("Low", "Medium", "High", "Very High")
ROAD_CONNECTIVITY_LEVELS = ("Poor", "Good", "Excellent")
TERRAIN_LEVELS = ("Low", "Moderate", "Suitable")
RECOMMENDATION_TIERS = (
    "Recommended",
    "Consider",
    "Further Assessment Required",
    "Not Recommended",
)

# Ordinal maps used to normalise categorical source values onto 0-100 scales.
# The top of each scale means "no constraint from this factor", so a site with
# a fully adequate rating is not held below the recommendation threshold by a
# ceiling that no real value can reach.
FLOOD_RISK_SAFETY_SCORE = {"Very Low": 96.0, "Low": 88.0, "Moderate": 62.0, "Medium": 62.0, "High": 35.0, "Very High": 15.0}
TERRAIN_SUITABILITY_SCORE = {"Low": 35.0, "Moderate": 65.0, "Medium": 65.0, "Suitable": 90.0, "High": 94.0}
UTILITY_SCORE = {"Low": 40.0, "Medium": 66.0, "High": 90.0, "Excellent": 97.0}
RISK_LEVEL_SCORE = {"Low": 25.0, "Medium": 50.0, "Moderate": 50.0, "High": 75.0, "Very High": 92.0}
GROWTH_PRIORITY_SCORE = {"Low": 30.0, "Medium": 55.0, "High": 78.0, "Very High": 92.0}

DISCLAIMER = (
    "NIRMAN AI is a decision-support prototype. Demonstration datasets and "
    "AI-generated estimates require validation against authoritative data, "
    "engineering assessment and statutory approvals before real-world use."
)

DEMO_DATA_NOTICE = "Demonstration data — requires validation before real-world use."
