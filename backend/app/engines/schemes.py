"""Government Scheme Engine.

Maps a project type onto schemes held in the database. A language model is
never permitted to name a scheme: it may only explain a match this engine
produced. If nothing matches, the engine says so rather than guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.models.planning import GovernmentScheme

# Broad category fallbacks used when an exact project-type match is absent.
CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Hospital": ("hospital", "medical", "critical care"),
    "Health Centre": ("health centre", "health center", "phc", "clinic", "dispensary"),
    "School": ("school", "education", "classroom"),
    "Anganwadi": ("anganwadi", "nutrition", "creche"),
    "Water Supply": ("water", "pipeline", "tank", "reservoir", "desalination"),
    "Drainage": ("drain", "storm water", "stormwater"),
    "Sewerage": ("sewage", "sewerage", "stp"),
    "Sanitation": ("toilet", "sanitation", "public amenities"),
    "Solid Waste": ("waste", "garbage", "solid waste"),
    "Road": ("road", "street", "footpath", "highway"),
    "Bridge": ("bridge", "flyover", "over bridge", "rob"),
    "Housing": ("housing", "dwelling", "tenement"),
    "Skill Centre": ("skill", "training", "kaushal"),
    "Coastal Infrastructure": ("coastal", "sea wall", "seawall", "shoreline", "harbour"),
    "Disaster Shelter": ("shelter", "disaster", "flood relief", "evacuation"),
    "Environmental Monitoring": ("air quality", "monitoring", "pollution"),
    "Transit Facility": ("bus", "terminal", "terminus", "transit"),
    "Smart Infrastructure": ("smart", "traffic", "signal", "surveillance"),
    "Digital Infrastructure": ("digital", "e-learning", "computer"),
    "Renewable Energy": ("solar", "renewable", "street light"),
    "Public Amenity": ("beach", "park", "amenity", "recreation"),
}


@dataclass
class SchemeMatch:
    scheme_name: str
    short_name: str | None
    ministry: str | None
    description: str | None
    reason: str
    match_confidence: float
    source_url: str | None
    verification_status: str
    data_status: str = DataStatus.DERIVED

    def as_dict(self) -> dict[str, Any]:
        return {
            "scheme_name": self.scheme_name,
            "short_name": self.short_name,
            "ministry": self.ministry,
            "description": self.description,
            "reason": self.reason,
            "match_confidence": round(self.match_confidence, 1),
            "source_url": self.source_url,
            "verification_status": self.verification_status,
            "data_status": self.data_status,
        }


@dataclass
class SchemeResult:
    project_type: str
    project_name: str | None
    matches: list[SchemeMatch] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "project_type": self.project_type,
            "project_name": self.project_name,
            "matched": bool(self.matches),
            "primary": self.matches[0].as_dict() if self.matches else None,
            "alternatives": [m.as_dict() for m in self.matches[1:]],
            "notes": self.notes,
        }


def _eligible_types(scheme: GovernmentScheme) -> list[str]:
    return [t.strip().lower() for t in (scheme.eligible_project_types or "").split(";") if t.strip()]


def infer_project_type(project_name: str) -> str:
    """Best-effort category inference from a free-text project name.

    The longest matching keyword wins, so 'storm water drain' resolves to
    Drainage rather than Water Supply on the shorter 'water' match.
    """
    text = project_name.lower()
    best_category = "Other"
    best_length = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text and len(keyword) > best_length:
                best_category, best_length = category, len(keyword)
    return best_category


def recommend(
    schemes: list[GovernmentScheme],
    project_type: str,
    project_name: str | None = None,
) -> SchemeResult:
    """Return every scheme whose eligibility covers ``project_type``, best first."""
    effective_type = project_type
    if (not effective_type or effective_type == "Other") and project_name:
        effective_type = infer_project_type(project_name)

    needle = (effective_type or "").strip().lower()
    result = SchemeResult(project_type=effective_type, project_name=project_name)

    if not needle:
        result.notes.append("Insufficient verified data available: no project type supplied.")
        return result

    scored: list[tuple[float, SchemeMatch]] = []
    for scheme in schemes:
        eligible = _eligible_types(scheme)
        if needle in eligible:
            confidence = 92.0
            reason = (
                f"'{effective_type}' is listed among the eligible project types for "
                f"{scheme.scheme_name}."
            )
        elif any(needle in item or item in needle for item in eligible):
            confidence = 74.0
            reason = (
                f"'{effective_type}' partially matches the eligible project types for "
                f"{scheme.scheme_name}."
            )
        else:
            continue

        scored.append(
            (
                confidence,
                SchemeMatch(
                    scheme_name=scheme.scheme_name,
                    short_name=scheme.short_name,
                    ministry=scheme.ministry,
                    description=scheme.description,
                    reason=reason,
                    match_confidence=confidence,
                    source_url=scheme.source_url,
                    verification_status=scheme.verification_status,
                ),
            )
        )

    scored.sort(key=lambda pair: pair[0], reverse=True)
    result.matches = [match for _, match in scored]

    if not result.matches:
        result.notes.append(
            "Insufficient verified data available: no scheme in the reference table lists "
            f"'{effective_type}' as an eligible project type."
        )
    else:
        result.notes.append(
            "Scheme eligibility is drawn from the NIRMAN AI reference table. Portal URLs are "
            "indicative and marked pending verification - confirm with the administering "
            "ministry before any funding decision."
        )
    return result
