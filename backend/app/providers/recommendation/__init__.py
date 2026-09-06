"""RecommendationProvider abstraction.

The fourth interface named in the build plan. Site scoring is pluggable: the
deterministic MCDA engine is the default and the machine-learned model is
opt-in, but both answer the same contract so callers — and the frontend —
never change when the strategy does.

The build plan requires that the MVP not depend on a model for core scoring,
so `mcda` is the default and any ML failure degrades to it rather than
propagating an error.
"""

from __future__ import annotations

import abc
import logging
from functools import lru_cache
from typing import Any

from sqlalchemy.orm import Session

from app import repositories as repo
from app.core.constants import DataStatus
from app.engines import explain as explain_engine
from app.engines import ml as ml_engine
from app.engines.suitability import Calibration, evaluate_site, rank_sites
from app.models.spatial import Site

log = logging.getLogger(__name__)


class RecommendationProvider(abc.ABC):
    """Produces a suitability score and an explanation for a site."""

    key: str = "base"
    label: str = "Base"
    description: str = ""
    requires_model: bool = False

    @abc.abstractmethod
    def rank(
        self,
        sites: list[Site],
        infrastructure_type: str,
        weights: dict[str, float] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Return ranked sites, best first."""

    @abc.abstractmethod
    def explain(
        self,
        site: Site,
        sites: list[Site],
        infrastructure_type: str,
        weights: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        """Return a factor-level explanation of one site's score."""

    def available(self, sites: list[Site]) -> tuple[bool, str | None]:
        return True, None

    def info(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "description": self.description,
            "requires_model": self.requires_model,
        }


class McdaRecommendationProvider(RecommendationProvider):
    """Deterministic weighted multi-criteria analysis. The default."""

    key = "mcda"
    label = "Deterministic MCDA"
    description = (
        "Weighted multi-criteria analysis over nine normalised factors. Fully "
        "reproducible, needs no training data, and is the engine the platform "
        "relies on for site scoring."
    )

    def rank(self, sites, infrastructure_type, weights=None, limit=None):
        results = rank_sites(sites, infrastructure_type, weights, limit=limit)
        return [r.as_dict() for r in results]

    def explain(self, site, sites, infrastructure_type, weights=None):
        calibration = Calibration.from_sites(sites, infrastructure_type)
        result = evaluate_site(site, infrastructure_type, weights, calibration)
        payload = explain_engine.explain_site(result)
        payload["provider"] = self.key
        return payload


class MlRecommendationProvider(RecommendationProvider):
    """Gradient-boosted model explained with SHAP.

    Demonstrates the ML pathway from the technical stack. It learns to
    reproduce the demonstration dataset's published score from measurable site
    attributes, which is a modelling exercise on 40 rows — not a validated
    predictor. Weights do not apply: the model learned its own.
    """

    key = "ml"
    label = "Gradient-boosted model + SHAP"
    description = (
        "XGBoost regressor fitted on the demonstration dataset, explained with "
        "SHAP. Illustrative only — 40 training rows cannot generalise, so the "
        "deterministic MCDA engine remains the platform's scorer."
    )
    requires_model = True

    def available(self, sites):
        ml_engine.site_model.fit(sites)
        if ml_engine.site_model.available:
            return True, None
        return False, ml_engine.site_model.failure

    def rank(self, sites, infrastructure_type, weights=None, limit=None):
        predictions = []
        for site in sites:
            try:
                predictions.append(ml_engine.site_model.predict(site, sites))
            except ml_engine.MlUnavailable:
                raise
        predictions.sort(key=lambda p: p.score, reverse=True)
        if limit:
            predictions = predictions[:limit]

        out = []
        for p in predictions:
            d = p.as_dict()
            out.append(
                {
                    "site_id": d["site_id"],
                    "site_code": d["site_code"],
                    "site_name": d["site_name"],
                    "infrastructure_type": infrastructure_type,
                    "score": d["score"],
                    # The model has no notion of input completeness, so
                    # confidence reports the model's own cross-validated fit.
                    "confidence": round((d["model"].get("cross_validated_r2") or 0) * 100, 1),
                    "recommendation": d["recommendation"],
                    "factors": [
                        {
                            "name": c["factor"],
                            "label": c["label"],
                            "raw_value": c["value"],
                            "normalized": None,
                            "weight": None,
                            "contribution": c["shap_value"],
                            "direction": c["direction"],
                            "rationale": f"SHAP contribution {c['shap_value']:+.3f} at a value of {c['value']}.",
                        }
                        for c in d["all_factors"][:6]
                    ],
                    "weights": {},
                    "explanation": (
                        f"{d['site_name']} is predicted at {d['score']}/100 by the demonstration "
                        f"model, against a base value of {d['base_value']}."
                    ),
                    "data_status": DataStatus.AI_GENERATED,
                    "notes": d["notes"],
                    "model": d["model"],
                }
            )
        return out

    def explain(self, site, sites, infrastructure_type, weights=None):
        payload = ml_engine.site_model.predict(site, sites).as_dict()
        payload["provider"] = self.key
        payload["infrastructure_type"] = infrastructure_type
        payload["confidence"] = round((payload["model"].get("cross_validated_r2") or 0) * 100, 1)
        payload["why_this_site"] = payload["explanation"] = (
            f"{payload['site_name']} is predicted at {payload['score']}/100 by a gradient-boosted "
            f"model trained on the demonstration dataset. The strongest influence is "
            f"{payload['all_factors'][0]['label'].lower()} "
            f"({payload['all_factors'][0]['shap_value']:+.2f})."
        )
        return payload


_PROVIDERS: dict[str, RecommendationProvider] = {
    p.key: p for p in (McdaRecommendationProvider(), MlRecommendationProvider())
}
DEFAULT_PROVIDER = "mcda"


@lru_cache
def get_recommendation_provider(key: str = DEFAULT_PROVIDER) -> RecommendationProvider:
    return _PROVIDERS.get(key, _PROVIDERS[DEFAULT_PROVIDER])


def resolve(db: Session, key: str | None) -> tuple[RecommendationProvider, list[str]]:
    """Pick a provider, degrading to MCDA when a model cannot serve.

    Returns the provider plus any notes explaining a fallback, so the caller
    can tell the user what actually answered rather than silently swapping.
    """
    requested = (key or DEFAULT_PROVIDER).lower()
    provider = get_recommendation_provider(requested)
    notes: list[str] = []

    if provider.requires_model:
        ok, failure = provider.available(repo.all_sites(db))
        if not ok:
            notes.append(
                f"The '{provider.key}' provider is unavailable ({failure}); "
                "the deterministic MCDA engine answered instead."
            )
            provider = get_recommendation_provider(DEFAULT_PROVIDER)
    elif requested not in _PROVIDERS:
        notes.append(f"Unknown provider '{requested}'; using '{DEFAULT_PROVIDER}'.")

    return provider, notes


def list_providers() -> list[dict[str, Any]]:
    return [p.info() | {"default": p.key == DEFAULT_PROVIDER} for p in _PROVIDERS.values()]


__all__ = [
    "DEFAULT_PROVIDER",
    "McdaRecommendationProvider",
    "MlRecommendationProvider",
    "RecommendationProvider",
    "get_recommendation_provider",
    "list_providers",
    "resolve",
]
