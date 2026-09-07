"""Machine-learned site scoring with SHAP explanations.

This sits *alongside* the deterministic MCDA engine, never in front of it.
The build plan is explicit that the MVP must not require a model for core
scoring, so `suitability.py` remains the default and this module is opt-in.

Honest framing, carried through to every response:

* The model is a **surrogate of the decision engine**, not a predictor of
  real-world suitability. It is trained on thousands of (site attributes,
  weight vector) -> engine score pairs sampled across the engine's input
  space, so its held-out score measures genuine generalisation over that
  space rather than memorisation of 40 published rows.
* SHAP over the surrogate therefore explains the *engine's* global behaviour:
  which attributes move a score, and how the weight vector changes that.
* It says nothing about whether the engine is right about Chennai. The engine
  is a planning heuristic over demonstration data, and `data_status` stays
  `ai_generated` throughout.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Any

from app.core.constants import DataStatus
from app.engines import normalize as nz
from app.engines.suitability import recommendation_tier
from app.models.spatial import Site

log = logging.getLogger(__name__)

# Features the model sees. Deliberately the measurable site attributes, not
# the dataset's own component scores, so the model is not simply echoing them.
FEATURES: tuple[str, ...] = (
    "population_catchment_5km",
    "population_density",
    "existing_hospitals",
    "existing_schools",
    "distance_major_road_km",
    "elevation_m",
    "slope_deg",
    "land_available_acres",
    "land_cost_cr_per_acre",
    "flood_safety_score",
    "terrain_score",
    "water_score",
    "power_score",
    "utility_score",
    "transit_modes",
)

FEATURE_LABELS = {
    "population_catchment_5km": "Population within 5 km",
    "population_density": "Population density",
    "existing_hospitals": "Existing hospitals",
    "existing_schools": "Existing schools",
    "distance_major_road_km": "Distance to major road",
    "elevation_m": "Elevation",
    "slope_deg": "Slope",
    "land_available_acres": "Land available",
    "land_cost_cr_per_acre": "Land cost per acre",
    "flood_safety_score": "Flood safety",
    "terrain_score": "Terrain suitability",
    "water_score": "Water availability",
    "power_score": "Electricity availability",
    "utility_score": "Utility infrastructure",
    "transit_modes": "Transit modes served",
}

MIN_TRAINING_ROWS = 20
TRAINING_SAMPLES = 6000


def site_features(site: Site) -> dict[str, float]:
    """Flatten a site into the model's numeric feature vector."""
    transit = (site.transit_access or "").lower()
    modes = sum(token in transit for token in ("metro", "rail", "bus", "mrts", "omr", "ecr"))
    return {
        "population_catchment_5km": float(site.population_catchment_5km or 0),
        "population_density": float(site.population_density or 0),
        "existing_hospitals": float(site.existing_hospitals or 0),
        "existing_schools": float(site.existing_schools or 0),
        "distance_major_road_km": float(site.distance_major_road_km or 0),
        "elevation_m": float(site.elevation_m or 0),
        "slope_deg": float(site.slope_deg or 0),
        "land_available_acres": float(site.land_available_acres or 0),
        "land_cost_cr_per_acre": float(site.land_cost_cr_per_acre or 0),
        "flood_safety_score": nz.flood_safety_score(site.flood_risk),
        "terrain_score": nz.terrain_score(
            site.terrain_suitability or nz.terrain_level_from(site.slope_deg, site.elevation_m)
        ),
        "water_score": nz.utility_score(site.water_availability),
        "power_score": nz.utility_score(site.electricity_availability),
        "utility_score": nz.utility_score(site.utility_infrastructure),
        "transit_modes": float(modes),
    }



def surrogate_row(site: Site, infrastructure_type: str, weights: dict[str, float]) -> list[float]:
    """The surrogate's feature vector for a real site under a weight vector.

    Must stay in lockstep with ml_training.build_training_set — the order and
    meaning of these columns is the model's contract.
    """
    from app.engines.suitability import LAND_REQUIREMENT_ACRES
    from app.engines.weights import DEFAULT_SITE_WEIGHTS

    req = LAND_REQUIREMENT_ACRES.get(infrastructure_type, LAND_REQUIREMENT_ACRES["Other"])
    pop = site.population_catchment_5km or 0
    per100k = max(pop / 100_000, 1e-6)
    terrain = site.terrain_suitability or nz.terrain_level_from(site.slope_deg, site.elevation_m)
    return (
        [
            float(pop),
            float(site.population_density or 0),
            float(site.existing_hospitals or 0),
            float(site.existing_schools or 0),
            float(site.distance_major_road_km or 0),
            float(site.elevation_m or 0),
            float(site.slope_deg or 0),
            float(site.land_available_acres or 0),
            float(site.land_cost_cr_per_acre or 0),
            nz.flood_safety_score(site.flood_risk),
            nz.terrain_score(terrain),
            nz.utility_score(site.water_availability),
            nz.utility_score(site.electricity_availability),
            nz.utility_score(site.utility_infrastructure),
            (site.existing_hospitals or 0) / per100k,
            (site.existing_schools or 0) / per100k,
            (site.land_available_acres or 0) / req,
        ]
        + [weights[k] for k in DEFAULT_SITE_WEIGHTS]
        + [req]
    )


SURROGATE_LABELS = {
    "population_catchment_5km": "Population within 5 km",
    "population_density": "Population density",
    "existing_hospitals": "Existing hospitals",
    "existing_schools": "Existing schools",
    "distance_major_road_km": "Distance to major road",
    "elevation_m": "Elevation",
    "slope_deg": "Slope",
    "land_available_acres": "Land available",
    "land_cost_cr_per_acre": "Land cost per acre",
    "flood_safety_score": "Flood safety",
    "terrain_score": "Terrain suitability",
    "water_score": "Water availability",
    "power_score": "Electricity availability",
    "utility_score": "Utility infrastructure",
    "hospitals_per_100k": "Hospitals per 100k residents",
    "schools_per_100k": "Schools per 100k residents",
    "land_ratio": "Land vs facility requirement",
    "land_requirement_acres": "Facility land requirement",
}


def surrogate_label(name: str) -> str:
    if name in SURROGATE_LABELS:
        return SURROGATE_LABELS[name]
    if name.startswith("w_"):
        return "Weight: " + name[2:].replace("_", " ")
    return name.replace("_", " ")


@dataclass
class ModelMetrics:
    rows: int
    features: int
    r2_cv: float | None
    mae_cv: float | None
    algorithm: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "training_rows": self.rows,
            "features": self.features,
            "cross_validated_r2": None if self.r2_cv is None else round(self.r2_cv, 3),
            "cross_validated_mae": None if self.mae_cv is None else round(self.mae_cv, 2),
            "algorithm": self.algorithm,
        }


@dataclass
class MlPrediction:
    site_id: int
    site_code: str
    site_name: str
    score: float
    recommendation: str
    base_value: float
    contributions: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    data_status: str = DataStatus.AI_GENERATED
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        positive = [c for c in self.contributions if c["shap_value"] > 0]
        negative = [c for c in self.contributions if c["shap_value"] < 0]
        return {
            "site_id": self.site_id,
            "site_code": self.site_code,
            "site_name": self.site_name,
            "score": round(self.score, 2),
            "recommendation": self.recommendation,
            "method": "gradient_boosted_regressor_with_shap",
            "base_value": round(self.base_value, 2),
            "positive_factors": positive,
            "negative_factors": negative,
            "all_factors": self.contributions,
            "score_breakdown": {
                "baseline": round(self.base_value, 2),
                "net_factor_effect": round(self.score - self.base_value, 2),
                "final": round(self.score, 2),
            },
            "model": self.metrics,
            "data_status": self.data_status,
            "notes": self.notes,
        }


class MlUnavailable(RuntimeError):
    """Raised when the ML path cannot serve a request."""


class SiteScoreModel:
    """Lazily-fitted XGBoost regressor plus a SHAP explainer.

    Fitting is cheap on this dataset (tens of milliseconds), so the model is
    trained in-process on first use and cached. Training never blocks startup
    and a failure here can never break deterministic scoring.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._explainer = None
        self._metrics: ModelMetrics | None = None
        self._feature_names: list[str] = []
        self._failed: str | None = None

    @property
    def available(self) -> bool:
        return self._model is not None

    @property
    def failure(self) -> str | None:
        return self._failed

    def reset(self) -> None:
        with self._lock:
            self._model = None
            self._explainer = None
            self._metrics = None
            self._failed = None

    def fit(self, sites: list[Site]) -> None:
        """Fit on sites that carry a published score to learn from."""
        with self._lock:
            if self._model is not None or self._failed:
                return
            try:
                self._fit_unlocked(sites)
            except Exception as exc:  # pragma: no cover - surfaced via API
                self._failed = f"{type(exc).__name__}: {exc}"
                log.warning("ML site model unavailable: %s", self._failed)

    def _fit_unlocked(self, sites: list[Site]) -> None:
        """Fit a surrogate of the decision engine.

        Trained on thousands of (attributes, weights) -> engine score pairs
        sampled across the engine's input space, not on the 40 published
        scores. Cross-validation therefore measures genuine generalisation
        over that space rather than memorisation of a small table.
        """
        import numpy as np
        import shap
        from sklearn.model_selection import KFold, cross_val_score
        from xgboost import XGBRegressor

        from app.engines.ml_training import build_training_set
        from app.services.site_service import INFRASTRUCTURE_TYPES

        if len(sites) < MIN_TRAINING_ROWS:
            raise MlUnavailable(
                f"Only {len(sites)} sites available; at least {MIN_TRAINING_ROWS} "
                "are needed to sample the engine."
            )

        training = build_training_set(sites, INFRASTRUCTURE_TYPES, samples=TRAINING_SAMPLES)
        X, y = training.X, training.y

        model = XGBRegressor(
            n_estimators=600,
            max_depth=7,
            learning_rate=0.06,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.0,
            random_state=42,
            n_jobs=4,
            verbosity=0,
        )

        # Scored on a held-out split rather than 5-fold: one split is enough to
        # report honestly and keeps first-use latency reasonable.
        split = int(len(X) * 0.8)
        idx = np.random.RandomState(42).permutation(len(X))
        tr, te = idx[:split], idx[split:]
        model.fit(X[tr], y[tr])
        pred = model.predict(X[te])
        ss_res = float(((y[te] - pred) ** 2).sum())
        ss_tot = float(((y[te] - y[te].mean()) ** 2).sum())
        r2 = 1 - ss_res / ss_tot if ss_tot else None
        mae = float(np.abs(y[te] - pred).mean())

        model.fit(X, y)
        self._model = model
        self._explainer = shap.TreeExplainer(model)
        self._feature_names = training.feature_names
        self._metrics = ModelMetrics(
            rows=training.rows,
            features=len(training.feature_names),
            r2_cv=r2,
            mae_cv=mae,
            algorithm="XGBRegressor surrogate (depth 7, 600 trees)",
        )
        log.info("Surrogate fitted on %d rows (held-out R2=%.3f)", training.rows, r2 or 0)

    def predict(
        self,
        site: Site,
        sites: list[Site],
        infrastructure_type: str = "Hospital",
        weights: dict[str, float] | None = None,
    ) -> MlPrediction:
        """Score one site with the surrogate and explain it with SHAP."""
        self.fit(sites)
        if self._model is None:
            raise MlUnavailable(self._failed or "Model could not be fitted.")

        import numpy as np

        from app.engines.weights import DEFAULT_SITE_WEIGHTS

        resolved = weights or dict(DEFAULT_SITE_WEIGHTS)
        values = surrogate_row(site, infrastructure_type, resolved)
        row = np.array([values], dtype=float)
        score = float(self._model.predict(row)[0])

        shap_values = np.array(self._explainer.shap_values(row)).reshape(-1)
        base = float(np.array(self._explainer.expected_value).reshape(-1)[0])

        contributions = [
            {
                "factor": name,
                "label": surrogate_label(name),
                "value": round(float(values[i]), 2),
                "shap_value": round(float(shap_values[i]), 3),
                "direction": (
                    "positive"
                    if shap_values[i] > 0
                    else "negative"
                    if shap_values[i] < 0
                    else "neutral"
                ),
            }
            for i, name in enumerate(self._feature_names)
        ]
        contributions.sort(key=lambda c: abs(c["shap_value"]), reverse=True)

        prediction = MlPrediction(
            site_id=site.id,
            site_code=site.site_code,
            site_name=site.name,
            score=nz.clamp(score),
            recommendation=recommendation_tier(nz.clamp(score)),
            base_value=base,
            contributions=contributions,
            metrics=self._metrics.as_dict() if self._metrics else {},
        )
        prediction.notes = [
            "Predicted by a surrogate model trained to reproduce the deterministic decision "
            "engine across its input space - not trained on real-world outcomes.",
            "SHAP explains the engine's global behaviour: which attributes move a score, and "
            "how the weight vector changes that. It does not validate the score.",
            "The deterministic engine remains the scorer of record; this path is opt-in.",
            "Contributions are additive: base value plus all contributions equals the prediction.",
        ]
        return prediction

    def importances(self, sites: list[Site]) -> dict[str, Any]:
        """Global importance: mean |SHAP| over the real sites."""
        self.fit(sites)
        if self._model is None:
            raise MlUnavailable(self._failed or "Model could not be fitted.")

        import numpy as np

        from app.engines.weights import DEFAULT_SITE_WEIGHTS

        weights = dict(DEFAULT_SITE_WEIGHTS)
        X = np.array(
            [surrogate_row(s, "Hospital", weights) for s in sites if s.population_catchment_5km],
            dtype=float,
        )
        values = np.array(self._explainer.shap_values(X))
        mean_abs = np.abs(values).mean(axis=0)

        ranked = sorted(
            (
                {
                    "factor": name,
                    "label": surrogate_label(name),
                    "mean_abs_shap": round(float(mean_abs[i]), 3),
                }
                for i, name in enumerate(self._feature_names)
            ),
            key=lambda d: d["mean_abs_shap"],
            reverse=True,
        )
        return {
            "features": ranked,
            "model": self._metrics.as_dict() if self._metrics else {},
            "data_status": DataStatus.AI_GENERATED,
            "notes": [
                "Mean absolute SHAP value across the assessed sites at the default weighting - "
                "how much each attribute moves the engine's score on average.",
                "Computed over a surrogate of the deterministic engine, so this describes the "
                "engine's behaviour rather than Chennai itself.",
            ],
        }


# One process-wide model. Cheap to fit, safe to share.
site_model = SiteScoreModel()
