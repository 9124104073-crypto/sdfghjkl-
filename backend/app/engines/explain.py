"""Explainable AI layer.

For deterministic MCDA the exact attribution is known, so NIRMAN AI reports
true weighted contributions rather than an approximation. The same response
shape is what a SHAP explainer would fill in for an ML model, so the frontend
never has to change when a model replaces a rule.
"""

from __future__ import annotations

from typing import Any

from app.core.constants import DataStatus
from app.engines.suitability import SuitabilityResult

# A factor at the neutral midpoint neither helps nor hurts the score.
NEUTRAL_BASELINE = 50.0


def explain_site(result: SuitabilityResult) -> dict[str, Any]:
    """Decompose a suitability score into signed contributions vs. baseline."""
    baseline = sum(NEUTRAL_BASELINE * (w / 100.0) for w in result.weights.values())

    contributions = []
    for factor in result.factors:
        delta = (factor.normalized - NEUTRAL_BASELINE) * (factor.weight / 100.0)
        contributions.append(
            {
                "factor": factor.name,
                "label": factor.label,
                "raw_value": factor.raw_value,
                "normalized": round(factor.normalized, 1),
                "weight_pct": round(factor.weight, 1),
                "contribution": round(factor.contribution, 2),
                "delta_vs_baseline": round(delta, 2),
                "direction": "positive" if delta > 0.5 else "negative" if delta < -0.5 else "neutral",
                "rationale": factor.rationale,
            }
        )

    positives = sorted(
        (c for c in contributions if c["direction"] == "positive"),
        key=lambda c: c["delta_vs_baseline"],
        reverse=True,
    )
    negatives = sorted(
        (c for c in contributions if c["direction"] == "negative"),
        key=lambda c: c["delta_vs_baseline"],
    )

    return {
        "site_id": result.site_id,
        "site_code": result.site_code,
        "site_name": result.site_name,
        "infrastructure_type": result.infrastructure_type,
        "score": round(result.score, 2),
        "confidence": result.confidence,
        "recommendation": result.recommendation,
        "method": "deterministic_mcda_weighted_contribution",
        "baseline_score": round(baseline, 2),
        "positive_factors": positives,
        "negative_factors": negatives,
        "all_factors": contributions,
        "score_breakdown": {
            "baseline": round(baseline, 2),
            "net_factor_effect": round(result.score - baseline, 2),
            "final": round(result.score, 2),
        },
        "why_this_site": result.explanation,
        "data_status": result.data_status,
        "notes": result.notes
        + [
            "Contributions are exact weighted deviations from a neutral 50/100 baseline. "
            "When a machine-learned model is introduced, SHAP values populate this same shape."
        ],
    }


def explain_comparison(results: list[SuitabilityResult], limit: int = 5) -> dict[str, Any]:
    """Compare the leading candidates factor by factor."""
    ranked = sorted(results, key=lambda r: r.score, reverse=True)[:limit]
    if not ranked:
        return {"sites": [], "differentiators": [], "data_status": DataStatus.DERIVED}

    factor_names = [f.name for f in ranked[0].factors]
    differentiators = []
    for name in factor_names:
        values = []
        for result in ranked:
            match = next((f for f in result.factors if f.name == name), None)
            if match:
                values.append((result.site_name, match.normalized))
        if len(values) < 2:
            continue
        spread = max(v for _, v in values) - min(v for _, v in values)
        best = max(values, key=lambda pair: pair[1])
        worst = min(values, key=lambda pair: pair[1])
        differentiators.append(
            {
                "factor": name,
                "spread": round(spread, 1),
                "best": {"site": best[0], "value": round(best[1], 1)},
                "worst": {"site": worst[0], "value": round(worst[1], 1)},
            }
        )

    differentiators.sort(key=lambda d: d["spread"], reverse=True)
    return {
        "sites": [
            {
                "site_name": r.site_name,
                "site_code": r.site_code,
                "score": round(r.score, 2),
                "recommendation": r.recommendation,
            }
            for r in ranked
        ],
        "differentiators": differentiators[:5],
        "data_status": DataStatus.DERIVED,
    }
