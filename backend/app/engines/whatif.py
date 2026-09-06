"""What-If Engine.

Recalculates the area ranking under user-supplied weights and reports what
moved, by how much, and why. All arithmetic happens here - never in the
frontend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines.weights import DEFAULT_WHAT_IF_WEIGHTS, resolve_weights
from app.models.planning import WhatIfParameter

PARAMETERS = ("budget", "accessibility", "flood_safety", "population_coverage", "sustainability")
PARAMETER_LABELS = {
    "budget": "Budget",
    "accessibility": "Accessibility",
    "flood_safety": "Flood Safety",
    "population_coverage": "Population Coverage",
    "sustainability": "Sustainability",
}


@dataclass
class ScenarioRow:
    area: str
    baseline_score: float
    baseline_rank: int
    new_score: float
    new_rank: int
    parameters: dict[str, float] = field(default_factory=dict)
    contributions: dict[str, float] = field(default_factory=dict)
    explanation: str = ""

    @property
    def score_change(self) -> float:
        return self.new_score - self.baseline_score

    @property
    def rank_change(self) -> int:
        # Positive means the area moved up the list.
        return self.baseline_rank - self.new_rank

    def as_dict(self) -> dict[str, Any]:
        return {
            "area": self.area,
            "baseline_score": round(self.baseline_score, 2),
            "baseline_rank": self.baseline_rank,
            "new_score": round(self.new_score, 2),
            "new_rank": self.new_rank,
            "score_change": round(self.score_change, 2),
            "rank_change": self.rank_change,
            "parameters": self.parameters,
            "contributions": {k: round(v, 2) for k, v in self.contributions.items()},
            "explanation": self.explanation,
        }


def _composite(row: WhatIfParameter, weights: dict[str, float]) -> tuple[float, dict[str, float]]:
    contributions: dict[str, float] = {}
    total = 0.0
    for key, weight in weights.items():
        value = float(getattr(row, key))
        contribution = value * (weight / 100.0)
        contributions[key] = contribution
        total += contribution
    return total, contributions


def simulate(
    rows: list[WhatIfParameter],
    weights: dict[str, float] | None = None,
    top_n: int | None = None,
) -> dict[str, Any]:
    """Rank areas under ``weights`` and diff against the equal-weight baseline."""
    resolved = resolve_weights(weights, DEFAULT_WHAT_IF_WEIGHTS)

    baseline = {}
    for row in rows:
        score, _ = _composite(row, DEFAULT_WHAT_IF_WEIGHTS)
        baseline[row.area] = score
    baseline_order = sorted(baseline, key=lambda a: baseline[a], reverse=True)
    baseline_rank = {area: i + 1 for i, area in enumerate(baseline_order)}

    scored: list[ScenarioRow] = []
    for row in rows:
        score, contributions = _composite(row, resolved)
        scored.append(
            ScenarioRow(
                area=row.area,
                baseline_score=baseline[row.area],
                baseline_rank=baseline_rank[row.area],
                new_score=score,
                new_rank=0,
                parameters={p: float(getattr(row, p)) for p in PARAMETERS},
                contributions=contributions,
            )
        )

    scored.sort(key=lambda r: r.new_score, reverse=True)
    for index, row in enumerate(scored):
        row.new_rank = index + 1
        row.explanation = _explain(row, resolved)

    biggest_gain = max(scored, key=lambda r: r.rank_change)
    biggest_drop = min(scored, key=lambda r: r.rank_change)
    dominant = max(resolved, key=lambda k: resolved[k])

    result_rows = scored[:top_n] if top_n else scored
    return {
        "weights": {k: round(v, 2) for k, v in resolved.items()},
        "dominant_parameter": PARAMETER_LABELS[dominant],
        "areas_evaluated": len(scored),
        "results": [r.as_dict() for r in result_rows],
        "movers": {
            "biggest_gain": biggest_gain.as_dict(),
            "biggest_drop": biggest_drop.as_dict(),
        },
        "scenario_summary": (
            f"With {PARAMETER_LABELS[dominant]} weighted at {resolved[dominant]:.0f}%, "
            f"{scored[0].area} ranks first ({scored[0].new_score:.1f}). "
            f"{biggest_gain.area} gains {biggest_gain.rank_change} places and "
            f"{biggest_drop.area} loses {abs(biggest_drop.rank_change)}."
        ),
        "data_status": DataStatus.DERIVED,
        "notes": [
            "Baseline is the equal-weight (20% each) scenario.",
            "Area parameter scores are demonstration data - requires validation before real-world use.",
        ],
    }


def _explain(row: ScenarioRow, weights: dict[str, float]) -> str:
    top = max(row.contributions, key=lambda k: row.contributions[k])
    direction = (
        f"up {row.rank_change}"
        if row.rank_change > 0
        else f"down {abs(row.rank_change)}"
        if row.rank_change < 0
        else "unchanged"
    )
    return (
        f"{row.area} scores {row.new_score:.1f} ({direction} vs the equal-weight baseline). "
        f"{PARAMETER_LABELS[top]} contributes the most at "
        f"{row.contributions[top]:.1f} points from a {weights[top]:.0f}% weight "
        f"on a raw score of {row.parameters[top]:.0f}."
    )
